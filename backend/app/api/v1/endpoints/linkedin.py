from fastapi import APIRouter, Depends, HTTPException
from app.core.linkedin import LinkedInClient
from app.schemas.linkedin import MessageSchema, ConnectionSchema, LinkedInTokenRequest
from app.api.deps import get_current_user, get_db
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi.responses import RedirectResponse
from fastapi import status
from app.core.config import settings
from app.utils.logger import logger
from app.models.user import User
from typing import Optional, Dict, Any, cast
from sqlalchemy.orm import Mapped

router = APIRouter(redirect_slashes=False)
linkedin_client = LinkedInClient()

@router.post("/profile")
async def get_profile(profile_url: str, current_user = Depends(get_current_user)):
    try:
        profile = await linkedin_client.get_profile(profile_url)
        return profile
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/messages")
async def send_message(message: MessageSchema, current_user = Depends(get_current_user)):
    try:
        result = await linkedin_client.send_message(
            profile_id=message.profile_id,
            message=message.content
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/connect")
async def send_connection(
    connection: ConnectionSchema, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Send a connection request to a LinkedIn profile"""
    try:
        logger.info(f"Attempting to send connection request to profile: {connection.profile_id}")
        
        # Check if user has LinkedIn token
        if not current_user.linkedin_token:
            logger.warning(f"User (id: {current_user.id}) doesn't have LinkedIn token")
            raise HTTPException(
                status_code=401,
                detail="You need to connect your LinkedIn account first"
            )
        
        # Check for token expiration
        if (current_user.linkedin_token_expires and 
            current_user.linkedin_token_expires < datetime.utcnow()):
            logger.warning(f"User (id: {current_user.id}) has expired LinkedIn token")
            raise HTTPException(
                status_code=401,
                detail="Your LinkedIn token has expired. Please reconnect your account"
            )
        
        # Send connection request - now passing user_id for better debugging
        result = await linkedin_client.send_connection(
            profile_id=connection.profile_id,
            message=connection.message,
            access_token=current_user.linkedin_token,
            user_id=current_user.id
        )
        
        # Log success and return result
        logger.info(f"Successfully sent connection request to profile: {connection.profile_id}")
        return result
    except HTTPException as e:
        # Re-raise HTTP exceptions with proper error code
        logger.error(f"HTTP error sending connection request: {e.detail}")
        raise
    except Exception as e:
        # Log any other exceptions but return a 400 instead of 500
        logger.error(f"Error sending connection request: {str(e)}")
        raise HTTPException(
            status_code=400, 
            detail=f"Failed to send connection request: {str(e)}"
        )

@router.post("/token")
async def get_token(
    token_request: LinkedInTokenRequest,
    db: Session = Depends(get_db)
):
    try:
        # Log incoming request details
        logger.info(f"Received token request with code length: {len(token_request.code)}")
        logger.info(f"Code verifier present: {bool(token_request.code_verifier)}")
        if token_request.code_verifier:
            logger.info(f"Code verifier length: {len(token_request.code_verifier)}")
        
        try:
            # Get LinkedIn token
            token_response = await linkedin_client.get_access_token(
                token_request.code,
                token_request.code_verifier
            )
            
            # Log token response (without exposing sensitive data)
            logger.info(f"LinkedIn token received for code: {token_request.code[:10]}..., with response keys: {list(token_response.keys())}")
        except Exception as e:
            logger.error(f"Error during LinkedIn token exchange: {str(e)}")
            logger.exception("Full traceback:")
            raise HTTPException(
                status_code=500,
                detail=f"Error during LinkedIn token exchange: {str(e)}"
            )
        
        # Check if access_token is in the response
        if 'access_token' not in token_response:
            logger.error(f"No access_token in LinkedIn response: {token_response}")
            raise ValueError("Invalid LinkedIn token response: Missing access_token")
            
        # No need to encrypt here - the token itself is the actual token, not encrypted
        access_token = token_response['access_token']
        
        try:
            # Get user info from UserInfo endpoint - direct token, not encrypted
            logger.info("Attempting to get LinkedIn user info")
            userinfo = await linkedin_client.get_userinfo_direct(access_token)
            logger.info(f"Successfully retrieved LinkedIn user info: {userinfo.keys()}")
        except Exception as user_info_error:
            logger.error(f"Failed to get LinkedIn user info: {str(user_info_error)}")
            raise ValueError(f"Failed to get LinkedIn user info: {str(user_info_error)}")
        
        # Try to find the currently authenticated user
        current_user = db.query(User).filter(User.id == 1).first()  # Assuming user is logged in
        
        if not current_user:
            logger.error("No authenticated user found to update LinkedIn credentials")
            raise ValueError("Authentication required to link LinkedIn account")
        
        # Update current user with LinkedIn info
        logger.info(f"Updating LinkedIn info for user {current_user.id}")
        
        # Calculate token expiry time
        expires_in = int(token_response.get('expires_in', 3600))  # Default to 1 hour if not specified
        expiry_time = datetime.utcnow() + timedelta(seconds=expires_in)
        
        # Save LinkedIn info to the user
        current_user.linkedin_profile_id = str(userinfo.get('sub', ''))
        current_user.linkedin_token = access_token
        current_user.linkedin_token_expires = expiry_time
        current_user.linkedin_profile_url = userinfo.get('picture', '')
        
        if not current_user.email and userinfo.get('email'):
            current_user.email = userinfo.get('email')
            
        if (not current_user.first_name or not current_user.last_name) and userinfo.get('name'):
            name_parts = userinfo.get('name', '').split(' ', 1)
            if len(name_parts) > 0 and not current_user.first_name:
                current_user.first_name = name_parts[0]
            if len(name_parts) > 1 and not current_user.last_name:
                current_user.last_name = name_parts[1]
        
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
        
        logger.info(f"Successfully updated LinkedIn info for user {current_user.id} with profile ID {current_user.linkedin_profile_id}")
        
        return {
            "message": "LinkedIn connected successfully",
            "profile": userinfo
        }
    except Exception as e:
        logger.error(f"LinkedIn token error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LinkedIn authentication failed: {str(e)}")

@router.get("/status")
async def get_status(current_user: User = Depends(get_current_user)):
    try:
        connected = bool(current_user.is_linkedin_connected)
        expires_at = None
        conn = getattr(current_user, "linkedin_connection", None)
        if conn is not None:
            expires_at = getattr(conn, "token_expires_at", None)
        else:
            expires_at = getattr(current_user, "linkedin_token_expires", None)
        return {
            "connected": connected,
            "expires_at": expires_at,
        }
    except Exception:
        return {"connected": False, "expires_at": None}

@router.post("/disconnect")
async def disconnect_linkedin(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        current_user.linkedin_token = None
        current_user.linkedin_refresh_token = None
        current_user.linkedin_token_expires = None
        current_user.linkedin_profile_id = None
        current_user.linkedin_profile_url = None
        
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
        
        return {"message": "LinkedIn disconnected successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/callback")
async def linkedin_callback(
    code: str,
    state: str,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    LinkedIn OAuth callback handler
    """
    try:
        # Log incoming request
        logger.info(f"LinkedIn callback received - code: {code[:10]}..., state: {state}")
        
        # Error check
        if error or error_description:
            logger.error(f"LinkedIn OAuth error: {error} - {error_description}")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/dashboard?error={error}&error_description={error_description}",
                status_code=status.HTTP_302_FOUND
            )

        # For callbacks, we don't have code_verifier as it's only used in the frontend PKCE flow
        # Get token directly without code_verifier for redirect flow
        try:
            token_response = await linkedin_client.get_access_token(code)
            logger.info("Successfully obtained LinkedIn access token")
        except Exception as e:
            logger.error(f"Failed to get LinkedIn access token: {str(e)}")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/dashboard?error=token_error&error_description={str(e)}",
                status_code=status.HTTP_302_FOUND
            )
        
        # Get user info from UserInfo endpoint
        try:
            userinfo = await linkedin_client.get_userinfo(token_response['access_token'])
            logger.info(f"Successfully obtained LinkedIn user info for sub: {userinfo.get('sub')}")
        except Exception as e:
            logger.error(f"Failed to get LinkedIn user info: {str(e)}")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/dashboard?error=userinfo_error&error_description={str(e)}",
                status_code=status.HTTP_302_FOUND
            )
        
        # Validate ID token if present
        if 'id_token' in token_response:
            try:
                await linkedin_client.validate_id_token(token_response['id_token'])
                logger.info("Successfully validated LinkedIn ID token")
            except Exception as e:
                logger.error(f"ID token validation failed: {str(e)}")
                return RedirectResponse(
                    url=f"{settings.FRONTEND_URL}/dashboard?error=id_token_error&error_description={str(e)}",
                    status_code=status.HTTP_302_FOUND
                )
        
        # Decode the state parameter to get user_id (state should contain the user's ID)
        # If state is not properly formatted, this will fall back to finding by LinkedIn ID
        user_id = None
        try:
            if state and ':' in state:
                user_id = int(state.split(':')[0])
                logger.info(f"Extracted user_id from state: {user_id}")
        except ValueError:
            logger.warning(f"Could not parse user_id from state: {state}")
            
        # First try to find user by ID from state parameter
        user = None
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            logger.info(f"User lookup by ID {user_id}: {'Found' if user else 'Not found'}")
            
        # If no user found by ID, try LinkedIn profile ID as fallback
        if not user:
            user = db.query(User).filter(
                User.linkedin_profile_id == str(userinfo['sub'])
            ).first()
            logger.info(f"User lookup by LinkedIn ID {userinfo['sub']}: {'Found' if user else 'Not found'}")
        
        # If still no user, fall back to a default (user 1 for testing)
        if not user:
            logger.warning(f"No user found for LinkedIn, using fallback user")
            user = db.query(User).filter(User.id == 1).first()
            
        if not user:
            logger.error(f"Could not identify user for LinkedIn connection")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/signin?error=user_not_found",
                status_code=status.HTTP_302_FOUND
            )
            
        # Update user's LinkedIn info
        user.linkedin_token = str(token_response['access_token'])
        user.linkedin_token_expires = datetime.utcnow() + timedelta(
            seconds=int(token_response['expires_in'])
        )
        user.linkedin_profile_id = str(userinfo['sub'])
        user.linkedin_profile_url = userinfo.get('picture', '')
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        logger.info(f"Successfully updated LinkedIn info for user {user.id}")
        
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard",
            status_code=status.HTTP_302_FOUND
        )
            
    except Exception as e:
        logger.error(f"LinkedIn callback error: {str(e)}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard?error=unknown&error_description={str(e)}",
            status_code=status.HTTP_302_FOUND
        ) 