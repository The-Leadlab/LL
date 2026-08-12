from pydantic import BaseModel, EmailStr, constr, model_validator
from typing import Optional, Union
from app.schemas.user import User

class UserLogin(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: str
    
    @model_validator(mode='after')
    def validate_login_identifier(self):
        # At least one of email or username must be provided
        if not self.email and not self.username:
            raise ValueError('Either email or username must be provided')
        return self
    
    def get_identifier(self) -> str:
        """Returns the identifier used for login (email or username)"""
        return self.email or self.username or ""

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: User
    refresh_token: Optional[str] = None

    class Config:
        from_attributes = True


class RefreshTokenInput(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    refresh_token: Optional[str] = None
