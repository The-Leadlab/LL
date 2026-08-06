from typing import Generator, Optional, Union
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session
from sqlalchemy import text
from app import crud, models, schemas
from app.core import security
from app.core.config import settings
from app.db.base import SessionLocal
import logging
import time
import traceback

logger = logging.getLogger(__name__)

class CustomOAuth2PasswordBearer(OAuth2PasswordBearer):
    """Enhanced OAuth2 password bearer with better error logging"""
    
    async def __call__(self, request: Request) -> Optional[str]:
        """Override to provide better debugging and optional unauthenticated access"""
        try:
            # Use the parent class to get the token
            token = await super().__call__(request)
            return token
        except HTTPException as e:
            path = request.url.path
            # Only log as warning for API endpoints that commonly get token errors
            if path.endswith("/tags") or "health" in path:
                logger.debug(f"Authentication error on path {path}: {e.detail}")
            else:
                logger.warning(f"Authentication error on path {path}: {e.detail}")
                
            # Allow processing to continue with unauthenticated access for health endpoint
            if "health" in path:
                return None
                
            # Re-raise the original exception
            raise e

# Replace the simple OAuth2 scheme with our enhanced version
oauth2_scheme = CustomOAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def get_db() -> Generator:
    """
    Creates a new database session for each request
    with enhanced error handling.

    Connection probe runs *before* yield so SQL/business errors inside
    endpoints are not incorrectly rewritten as "Database connection error".
    """
    db = SessionLocal()
    try:
        try:
            db.execute(text("SELECT 1"))
        except Exception as e:
            logger.error("Database connection error: %s", str(e), exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Database connection error. Please try again later.",
            ) from e
        yield db
    finally:
        db.close()

async def get_token_from_request(request: Request) -> Optional[str]:
    """Extract token from request headers or query parameters"""
    # Try to get from Authorization header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.replace("Bearer ", "")
    
    # If not in header, try query parameters
    token = request.query_params.get("token")
    if token:
        return token
    
    # Log detailed information for debugging
    logger.debug(f"No token found in request: {request.url.path}")
    # Get headers safely using MutableHeaders
    try:
        from starlette.datastructures import MutableHeaders
        headers = MutableHeaders(scope=request.scope)
        # Convert to dictionary for logging
        headers_dict = {k: headers.get(k) for k in headers.keys()}
        logger.debug(f"Request headers: {headers_dict}")
    except Exception as e:
        logger.error(f"Error processing headers: {str(e)}")
    
    return None

async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> Optional[models.User]:
    """
    Verify token and return current user
    """
    request_path = request.url.path if hasattr(request, 'url') else "unknown"
    start_time = time.time()
    
    logger.debug(f"Authentication process started for path: {request_path}")
    
    # Check if token is provided
    if not token:
        logger.warning(f"No token provided for path: {request_path}")
        
        # Special handling for health endpoint
        if request_path.endswith("/health"):
            logger.debug("Allowing unauthenticated access to health endpoint")
            return None
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Decode the JWT token
        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
            token_data = schemas.TokenPayload(**payload)
        except JWTError as e:
            logger.error(f"JWT decode error for path {request_path}: {str(e)}")
            # Log the first 10 chars of token for debugging (not the whole token for security)
            if token and len(token) > 10:
                logger.debug(f"Token starts with: {token[:10]}...")
            raise
        except ValidationError as e:
            logger.error(f"Token payload validation error: {str(e)}")
            raise
        
        # Check if token is expired
        if token_data.exp is not None:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).timestamp()
            if now > token_data.exp:
                logger.warning(f"Token expired at {token_data.exp}, current time: {now}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token expired",
                    headers={"WWW-Authenticate": "Bearer"},
                )
    except (JWTError, ValidationError) as e:
        logger.error(f"Token validation error for path {request_path}: {str(e)}")
        logger.debug(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database - simplified to avoid relationship loading issues
    try:
        from sqlalchemy import text
        logger.debug(f"Attempting to fetch user with ID: {token_data.sub}")
        
        # Use raw SQL first to validate user exists and is active
        result = db.execute(
            text("SELECT id, email, first_name, last_name, is_active, organization_id FROM users WHERE id = :user_id LIMIT 1"),
            {"user_id": token_data.sub}
        )
        user_row = result.first()
        
        if not user_row:
            logger.error(f"User not found for token subject: {token_data.sub}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
        logger.debug(f"User found: {user_row.id} - {user_row.email}")
        
        # Check if user is active
        if not user_row.is_active:
            logger.warning(f"Inactive user attempted access: {user_row.id} - {user_row.email}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
        
        # Now get the full ORM object for return (after validation)
        user = crud.user.get(db=db, id=token_data.sub)
        if not user:
            logger.error(f"Failed to load ORM user object for ID: {token_data.sub}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User data error")
        
        process_time = time.time() - start_time
        logger.debug(f"Authentication completed for user {user.id} in {process_time:.4f}s")
        
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.critical(f"Database error in get_current_user: {str(e)}")
        logger.critical(f"Exception type: {type(e).__name__}")
        logger.critical(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Auth database error: {str(e)}"
        )

def get_current_active_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """
    Get current active user
    """
    if not crud.user.is_active(current_user):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_active_superuser(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """
    Get current active superuser
    """
    if not crud.user.is_superuser(current_user):
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user

def get_current_admin_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions"
        )
    return current_user

def get_current_superuser(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions"
        )
    return current_user
