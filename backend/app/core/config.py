from pydantic_settings import BaseSettings
from typing import List, Optional, Union
import json
from pydantic import Field, field_validator, AnyHttpUrl, ConfigDict
import os

class Settings(BaseSettings):
    # Environment
    ENV: str = Field(default="development", description="Current environment (development/production)")
    
    # Application
    PROJECT_NAME: str = Field(default="LeadLab API", description="Project name")
    VERSION: str = Field(default="1.0.0", description="API version")
    API_V1_STR: str = Field(default="/api/v1", description="API version prefix")
    DEBUG: bool = Field(default=False, description="Debug mode")
    SECRET_KEY: str = Field(..., description="Secret key for JWT encoding - MUST be set via environment variable")
    FRONTEND_URL: str = Field(default="https://the-leadlab.com", description="Frontend application URL")

    # Database
    DATABASE_URL: str = Field(..., description="Database connection URL - MUST be set via environment variable")
    MYSQL_POOL_SIZE: int = Field(default=5, description="MySQL connection pool size")
    MYSQL_MAX_OVERFLOW: int = Field(default=2, description="MySQL connection pool max overflow")
    MYSQL_POOL_TIMEOUT: int = Field(default=30, description="MySQL connection pool timeout")
    MYSQL_POOL_RECYCLE: int = Field(default=300, description="MySQL connection pool recycle time in seconds")
    
    # Security
    ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24, description="Access token expiry in minutes")
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, description="Refresh token expiry in days")
    TOKEN_ENCRYPTION_KEY: str = Field(..., description="Key used for encrypting tokens - MUST be set via environment variable")
    
    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=[
            "https://www.the-leadlab.com",
            "https://the-leadlab.com",
            "https://api.the-leadlab.com"
        ],
        description="List of allowed origins for CORS"
    )
    CORS_ALLOW_CREDENTIALS: bool = Field(default=True, description="Allow credentials for CORS")
    CORS_METHODS: List[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
        description="Allowed HTTP methods for CORS"
    )
    CORS_HEADERS: List[str] = Field(
        default=[
            "Content-Type",
            "Accept",
            "Authorization",
            "Origin",
            "X-Requested-With",
            "Access-Control-Request-Method",
            "Access-Control-Request-Headers",
            "Access-Control-Allow-Origin",
            "Access-Control-Allow-Credentials",
            "Access-Control-Allow-Methods",
            "Access-Control-Allow-Headers"
        ],
        description="Allowed HTTP headers for CORS"
    )
    
    # API Keys
    API_SECRET_KEY: str = Field(..., description="API secret key - MUST be set via environment variable")
    CRYSTAL_KNOWS_API_KEY: Optional[str] = Field(default=None, description="Crystal Knows API key")
    CRYSTAL_KNOWS_BASE_URL: Optional[str] = Field(
        default="https://api.crystalknows.com/v1",
        description="Crystal Knows API base URL"
    )

    # LinkedIn Configuration
    LINKEDIN_CLIENT_ID: Optional[str] = Field(default=None, description="LinkedIn client ID")
    LINKEDIN_CLIENT_SECRET: Optional[str] = Field(default=None, description="LinkedIn client secret")
    LINKEDIN_REDIRECT_URI: str = Field(default="https://the-leadlab.com/linkedin/callback", description="LinkedIn redirect URI")
    LINKEDIN_SCOPE: str = Field(default="openid profile email w_member_social", description="LinkedIn OAuth scope")
    
    @field_validator("LINKEDIN_CLIENT_SECRET", mode="before")
    def clean_linkedin_secret(cls, v: str) -> str:
        """Handle LinkedIn client secret format."""
        if not isinstance(v, str):
            return v
            
        # Keep the client secret as is, including any prefix or suffix
        return v

    # Stripe Configuration
    STRIPE_PUBLISHABLE_KEY: Optional[str] = Field(default=None, description="Stripe publishable key")
    STRIPE_SECRET_KEY: Optional[str] = Field(default=None, description="Stripe secret key")
    STRIPE_WEBHOOK_SECRET: Optional[str] = Field(default=None, description="Stripe webhook secret")
    STRIPE_CURRENCY: str = Field(default="usd", description="Default currency for Stripe payments")
    
    # Email/SMTP Configuration
    SMTP_HOST: str = Field(default="the-leadlab.com", description="SMTP server host")
    SMTP_PORT: int = Field(default=465, description="SMTP server port")
    SMTP_USER: Optional[str] = Field(default="no-reply@the-leadlab.com", description="SMTP username")
    SMTP_PASSWORD: Optional[str] = Field(default=None, description="SMTP password - MUST be set via environment variable")
    SMTP_TLS: bool = Field(default=True, description="Use TLS for SMTP")
    EMAILS_FROM_EMAIL: str = Field(
        default="noreply@the-leadlab.com",
        description="Default from email — must be on a Resend-verified domain (the-leadlab.com)",
    )
    SMTP_FROM_NAME: str = Field(default="LeadLab", description="Default from name")
    RESEND_API_KEY: Optional[str] = Field(default=None, description="Resend API key for HTTP email sending")
    RESEND_FROM_EMAIL: Optional[str] = Field(
        default="noreply@the-leadlab.com",
        description="Verified sender email for Resend API (prefer main domain)",
    )
    EMAIL_PROVIDER: str = Field(default="smtp", description="Email transport mode: smtp, api, or auto")
    EMAIL_PROVIDER_TIMEOUT_SECONDS: int = Field(default=12, description="Timeout (seconds) for provider API requests")

    # Invoice Email Configuration (separate from auth emails)
    INVOICE_EMAIL: str = Field(default="invoice@the-leadlab.com", description="Invoice-specific email")
    INVOICE_EMAIL_PASSWORD: Optional[str] = Field(default=None, description="Invoice email password - MUST be set via environment variable")
    
    # Email Token Configuration
    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = Field(default=1, description="Password reset token expiry in hours")
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = Field(default=24, description="Email verification token expiry in hours")
    
    # File upload settings
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # Calendar integrations (Google OAuth first)
    GOOGLE_CALENDAR_CLIENT_ID: Optional[str] = None
    GOOGLE_CALENDAR_CLIENT_SECRET: Optional[str] = None
    GOOGLE_CALENDAR_REDIRECT_URI: Optional[str] = None
    GOOGLE_CALENDAR_SCOPES: str = "openid email profile https://www.googleapis.com/auth/calendar"
    GOOGLE_EMAIL_REDIRECT_URI: Optional[str] = None
    GOOGLE_EMAIL_SCOPES: str = "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"
    GOOGLE_AUTH_REDIRECT_URI: Optional[str] = None

    model_config = ConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow"
    )

    @field_validator("CORS_ORIGINS", mode="before")
    def parse_list(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v

# Settings instance
settings = Settings()