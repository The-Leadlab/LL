from datetime import datetime, timedelta
from typing import Any, Union, Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings
from fastapi import HTTPException
from app import models
from cryptography.fernet import Fernet
import base64
import logging

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        logger.debug(f"Password verification starting (hash length: {len(hashed_password)})")
        result = pwd_context.verify(plain_password, hashed_password)
        logger.debug(f"Password verification completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Password verification error: {str(e)}")
        # Return False on error to ensure authentication fails securely
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# JWT token functions
def create_access_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
    organization_id: Optional[int] = None
) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "organization_id": organization_id,
        "type": "access",
    }
    
    try:
        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        return encoded_jwt
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error creating access token: {str(e)}"
        )


def create_refresh_token(
    subject: Union[str, Any],
    organization_id: Optional[int] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Long-lived token used to mint new access tokens (Remember me / session restore)."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "organization_id": organization_id,
        "type": "refresh",
    }
    try:
        return jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error creating refresh token: {str(e)}",
        )


def decode_token(token: str) -> dict:
    """Decode and validate a JWT; raises HTTPException on failure."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception as e:
        logger.warning("Token decode failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def check_permission(user: models.User, entity_type: str, entity_id: int, db_obj: Any = None) -> bool:
    """
    Check if user has permission to access an entity.
    """
    # Superuser has all permissions
    if user.is_superuser:
        return True
    
    # Check organization match
    if hasattr(db_obj, 'organization_id'):
        if db_obj.organization_id != user.organization_id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to access this resource"
            )
    
    # Check ownership
    if hasattr(db_obj, 'user_id'):
        if db_obj.user_id != user.id and not user.is_superuser:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to access this resource"
            )
    
    return True

def encrypt_password(password: str) -> str:
    """Encrypt a password using Fernet symmetric encryption"""
    try:
        encryption = TokenEncryption()
        return encryption.encrypt_token(password)
    except Exception as e:
        logger.error(f"Password encryption failed: {str(e)}")
        raise

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt an encrypted password"""
    try:
        encryption = TokenEncryption()
        return encryption.decrypt_token(encrypted_password)
    except Exception as e:
        logger.error(f"Password decryption failed: {str(e)}")
        raise

class TokenEncryption:
    def __init__(self):
        try:
            # Generate or load encryption key
            key = settings.TOKEN_ENCRYPTION_KEY.encode()
            # Ensure the key is properly padded for Fernet
            key_base64 = base64.b64encode(key.ljust(32)[:32])
            self.cipher = Fernet(key_base64)
        except Exception as e:
            logger.error(f"Failed to initialize token encryption: {str(e)}")
            raise

    def encrypt_token(self, token: str) -> str:
        """Encrypt a token using Fernet symmetric encryption"""
        try:
            return self.cipher.encrypt(token.encode()).decode()
        except Exception as e:
            logger.error(f"Token encryption failed: {str(e)}")
            raise

    def decrypt_token(self, encrypted_token: str) -> str:
        """Decrypt an encrypted token"""
        try:
            return self.cipher.decrypt(encrypted_token.encode()).decode()
        except Exception as e:
            logger.error(f"Token decryption failed: {str(e)}")
            raise

token_encryption = TokenEncryption()
