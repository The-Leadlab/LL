from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api import deps
from app.core.config import settings

router = APIRouter(redirect_slashes=False)

@router.get("", tags=["monitoring"])  # Empty string to match /api/v1/health
async def health_check(db: Session = Depends(deps.get_db)):
    """
    Health check endpoint
    """
    try:
        # Check database connection
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return {
        "status": "healthy",
        "version": settings.VERSION,
        "environment": settings.ENV,
        "database": db_status
    }
