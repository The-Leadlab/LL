from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
import requests
import secrets
import logging
from urllib.parse import urlencode
import os
import httpx
from datetime import datetime, timedelta

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.linkedin_connection import LinkedInConnection
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(redirect_slashes=False)

# LinkedIn OAuth Configuration
LINKEDIN_CLIENT_ID = settings.LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET = settings.LINKEDIN_CLIENT_SECRET
LINKEDIN_REDIRECT_URI = settings.LINKEDIN_REDIRECT_URI
LINKEDIN_SCOPE = settings.LINKEDIN_SCOPE
LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_PROFILE_URL = "https://api.linkedin.com/v2/people/~"

# Debug endpoint to check LinkedIn OAuth configuration
@router.get("/debug")
async def debug_linkedin_config():
    """Debug endpoint to check LinkedIn OAuth configuration"""
    return {
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "scope": settings.LINKEDIN_SCOPE,
        "client_secret_set": bool(settings.LINKEDIN_CLIENT_SECRET),
        "authorize_url": f"https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={settings.LINKEDIN_CLIENT_ID}&redirect_uri={settings.LINKEDIN_REDIRECT_URI}&scope={settings.LINKEDIN_SCOPE}&state=test"
    }

# Mock test endpoint for development
@router.post("/mock-connect")
async def mock_linkedin_connect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mock LinkedIn connection for testing purposes"""
    try:
        # Check if user already has a LinkedIn connection
        existing_connection = db.query(LinkedInConnection).filter(
            LinkedInConnection.user_id == current_user.id
        ).first()
        
        if existing_connection:
            return {"message": "LinkedIn already connected", "profile": {
                "id": existing_connection.linkedin_id,
                "firstName": existing_connection.first_name,
                "lastName": existing_connection.last_name,
                "headline": existing_connection.headline,
                "profilePicture": existing_connection.profile_picture_url,
                "publicProfileUrl": existing_connection.public_profile_url,
                "connectedAt": existing_connection.created_at.isoformat()
            }}
        
        # Create mock LinkedIn connection
        mock_connection = LinkedInConnection(
            user_id=current_user.id,
            linkedin_id=f"mock_linkedin_{current_user.id}",
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            headline=f"{current_user.job_title or 'Professional'} at {current_user.company or 'Company'}",
            email=current_user.email,
            profile_picture_url="https://via.placeholder.com/150",
            public_profile_url=f"https://linkedin.com/in/mock-user-{current_user.id}",
            access_token="mock_access_token",
            refresh_token="mock_refresh_token",
            is_active=True
        )
        
        db.add(mock_connection)
        db.commit()
        db.refresh(mock_connection)
        
        return {
            "message": "Mock LinkedIn connection created successfully",
            "profile": {
                "id": mock_connection.linkedin_id,
                "firstName": mock_connection.first_name,
                "lastName": mock_connection.last_name,
                "headline": mock_connection.headline,
                "profilePicture": mock_connection.profile_picture_url,
                "publicProfileUrl": mock_connection.public_profile_url,
                "connectedAt": mock_connection.created_at.isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Mock LinkedIn connection error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create mock LinkedIn connection")

@router.get("/authorize")
async def linkedin_authorize(
    current_user: User = Depends(get_current_user)
):
    """
    Initiate LinkedIn OAuth flow
    """
    if not LINKEDIN_CLIENT_ID or not LINKEDIN_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="LinkedIn OAuth not configured. Please contact administrator."
        )
    
    # Generate state parameter for security (include user ID for verification)
    state = f"{current_user.id}_{secrets.token_urlsafe(32)}"
    
    # Build authorization URL
    params = {
        "response_type": "code",
        "client_id": LINKEDIN_CLIENT_ID,
        "redirect_uri": LINKEDIN_REDIRECT_URI,
        "state": state,
        "scope": LINKEDIN_SCOPE
    }
    
    auth_url = f"{LINKEDIN_AUTH_URL}?{urlencode(params)}"
    
    # Return JSON response instead of redirect
    return {"url": auth_url, "state": state}

@router.post("/callback")
async def linkedin_callback(
    callback_data: Dict[str, str],
    db: Session = Depends(get_db)
):
    """
    Handle LinkedIn OAuth callback
    """
    code = callback_data.get("code")
    state = callback_data.get("state")
    
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state parameter")
    
    # Extract user ID from state parameter
    try:
        user_id_str, _ = state.split("_", 1)
        user_id = int(user_id_str)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid state parameter format")
    
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    
    try:
        logger.info(f"LinkedIn callback: Starting token exchange for user {user_id}")
        
        # Exchange code for access token
        token_data = await exchange_code_for_token(code)
        logger.info(f"LinkedIn callback: Token exchange successful")
        
        # Get LinkedIn profile
        profile_data = await get_linkedin_profile(token_data["access_token"])
        logger.info(f"LinkedIn callback: Profile data retrieved: {profile_data}")
        
        # Save LinkedIn connection to database
        linkedin_connection = save_linkedin_connection(
            db, user_id, token_data, profile_data
        )
        logger.info(f"LinkedIn callback: Connection saved successfully")
        
        return {"message": "LinkedIn connected successfully", "profile": profile_data}
        
    except Exception as e:
        logger.error(f"LinkedIn callback error: {str(e)}")
        logger.error(f"LinkedIn callback error details: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(f"LinkedIn callback traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to connect LinkedIn account: {str(e)}")

@router.get("/profile")
async def get_linkedin_profile_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user's LinkedIn profile information
    """
    linkedin_connection = db.query(LinkedInConnection).filter(
        LinkedInConnection.user_id == current_user.id,
        LinkedInConnection.is_active == True
    ).first()
    
    if not linkedin_connection:
        return {
            "connected": False,
            "message": "LinkedIn account not connected"
        }
    
    return {
        "connected": True,
        "profile": {
            "id": linkedin_connection.linkedin_id,
            "firstName": linkedin_connection.first_name,
            "lastName": linkedin_connection.last_name,
            "headline": linkedin_connection.headline,
            "profilePicture": linkedin_connection.profile_picture_url,
            "publicProfileUrl": linkedin_connection.public_profile_url,
            "connectedAt": linkedin_connection.created_at.isoformat()
        }
    }

@router.delete("/disconnect")
async def disconnect_linkedin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Disconnect LinkedIn account
    """
    linkedin_connection = db.query(LinkedInConnection).filter(
        LinkedInConnection.user_id == current_user.id,
        LinkedInConnection.is_active == True
    ).first()
    
    if not linkedin_connection:
        raise HTTPException(status_code=404, detail="LinkedIn account not connected")
    
    # Deactivate connection instead of deleting
    linkedin_connection.is_active = False
    db.commit()
    
    return {"message": "LinkedIn account disconnected successfully"}

async def exchange_code_for_token(code: str) -> Dict[str, Any]:
    """
    Exchange authorization code for access token
    """
    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": LINKEDIN_REDIRECT_URI,
        "client_id": LINKEDIN_CLIENT_ID,
        "client_secret": LINKEDIN_CLIENT_SECRET
    }
    
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    response = requests.post(LINKEDIN_TOKEN_URL, data=token_data, headers=headers)
    
    if response.status_code != 200:
        logger.error(f"LinkedIn token exchange failed: {response.text}")
        raise HTTPException(status_code=400, detail="Failed to exchange code for token")
    
    return response.json()

async def get_linkedin_profile(access_token: str) -> Dict[str, Any]:
    """
    Get LinkedIn profile using access token
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Get basic profile using OpenID Connect userinfo endpoint
    profile_response = requests.get(
        "https://api.linkedin.com/v2/userinfo",
        headers=headers
    )
    
    if profile_response.status_code != 200:
        logger.error(f"LinkedIn profile fetch failed: {profile_response.text}")
        raise HTTPException(status_code=400, detail="Failed to fetch LinkedIn profile")
    
    profile_data = profile_response.json()
    logger.info(f"LinkedIn userinfo response: {profile_data}")
    
    # Process profile data from OpenID Connect userinfo endpoint
    processed_profile = {
        "id": profile_data.get("sub", ""),
        "firstName": profile_data.get("given_name", ""),
        "lastName": profile_data.get("family_name", ""),
        "headline": profile_data.get("headline", "Professional"),  # Default if not available
        "profilePicture": profile_data.get("picture", ""),
        "email": profile_data.get("email", ""),
        "publicProfileUrl": f"https://www.linkedin.com/in/{profile_data.get('sub', '')}"
    }
    
    return processed_profile

def save_linkedin_connection(
    db: Session, 
    user_id: int, 
    token_data: Dict[str, Any], 
    profile_data: Dict[str, Any]
) -> LinkedInConnection:
    """
    Save LinkedIn connection to database
    """
    # Get the user to update both LinkedInConnection and User tables
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if connection already exists
    existing_connection = db.query(LinkedInConnection).filter(
        LinkedInConnection.user_id == user_id
    ).first()
    
    linkedin_connection = None
    
    if existing_connection:
        # Update existing connection
        existing_connection.linkedin_id = profile_data["id"]
        existing_connection.access_token = token_data["access_token"]
        existing_connection.refresh_token = token_data.get("refresh_token")
        existing_connection.token_expires_at = None  # LinkedIn tokens don't expire
        existing_connection.first_name = profile_data["firstName"]
        existing_connection.last_name = profile_data["lastName"]
        existing_connection.headline = profile_data["headline"]
        existing_connection.email = profile_data.get("email")
        existing_connection.profile_picture_url = profile_data.get("profilePicture")
        existing_connection.public_profile_url = profile_data["publicProfileUrl"]
        existing_connection.is_active = True
        
        linkedin_connection = existing_connection
    else:
        # Create new connection
        linkedin_connection = LinkedInConnection(
            user_id=user_id,
            linkedin_id=profile_data["id"],
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            token_expires_at=None,  # LinkedIn tokens don't expire
            first_name=profile_data["firstName"],
            last_name=profile_data["lastName"],
            headline=profile_data["headline"],
            email=profile_data.get("email"),
            profile_picture_url=profile_data.get("profilePicture"),
            public_profile_url=profile_data["publicProfileUrl"],
            is_active=True
        )
        
        db.add(linkedin_connection)
    
    # Also update User table LinkedIn fields for backward compatibility
    user.linkedin_token = token_data["access_token"]
    user.linkedin_refresh_token = token_data.get("refresh_token")
    user.linkedin_token_expires = datetime.utcnow() + timedelta(days=365)  # Set far future date since LinkedIn tokens don't expire
    user.linkedin_profile_id = profile_data["id"]
    user.linkedin_profile_url = profile_data.get("profilePicture", "")
    
    # Update user profile if empty
    if not user.first_name and profile_data["firstName"]:
        user.first_name = profile_data["firstName"]
    if not user.last_name and profile_data["lastName"]:
        user.last_name = profile_data["lastName"]
    
    db.commit()
    db.refresh(linkedin_connection)
    db.refresh(user)
    
    return linkedin_connection

def extract_profile_picture(profile_data: Dict[str, Any]) -> str:
    """
    Extract profile picture URL from LinkedIn profile data
    """
    try:
        profile_picture = profile_data.get("profilePicture", {})
        display_image = profile_picture.get("displayImage~", {})
        elements = display_image.get("elements", [])
        
        if elements:
            # Get the largest image
            largest_image = max(elements, key=lambda x: x.get("data", {}).get("com.linkedin.digitalmedia.mediaartifact.StillImage", {}).get("storageSize", {}).get("width", 0))
            identifiers = largest_image.get("identifiers", [])
            if identifiers:
                return identifiers[0].get("identifier", "")
    except Exception as e:
        logger.warning(f"Failed to extract profile picture: {str(e)}")
    
    return ""

def extract_email(email_data: Dict[str, Any]) -> str:
    """
    Extract email from LinkedIn email response
    """
    try:
        elements = email_data.get("elements", [])
        if elements:
            for element in elements:
                if element.get("type") == "EMAIL":
                    handle = element.get("handle~", {})
                    return handle.get("emailAddress", "")
    except Exception as e:
        logger.warning(f"Failed to extract email: {str(e)}")
    
    return "" 