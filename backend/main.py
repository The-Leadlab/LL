from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.core.config import settings
from app.middleware.url_normalizer import URLNormalizerMiddleware
from app.middleware.security import SecurityMiddleware
import logging
import os
from datetime import datetime
from sqlalchemy import text

from app.utils.safe_request_body_log import safe_request_body_log

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

# Create the FastAPI application
app = FastAPI(
    title="LeadLab Backend",
    description="Lead management system backend",
    version="1.0.0"
)


def _sync_table_sequence(table_name: str, id_column: str = "id") -> None:
    """
    Align PostgreSQL serial sequence with MAX(id) after imports/backfills.
    Safe no-op for non-PostgreSQL databases.
    """
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        db.execute(
            text(
                f"""
                SELECT setval(
                    pg_get_serial_sequence('{table_name}', '{id_column}'),
                    COALESCE((SELECT MAX({id_column}) FROM {table_name}), 1),
                    true
                )
                """
            )
        )
        db.commit()
        logger.info("Sequence synced for %s.%s", table_name, id_column)
    except Exception as exc:
        db.rollback()
        logger.warning(
            "Skipping sequence sync for %s.%s: %s",
            table_name,
            id_column,
            str(exc),
        )
    finally:
        db.close()


@app.on_event("startup")
async def startup_sequence_guard() -> None:
    # Keep this list small and focused on tables that are user-created frequently.
    _sync_table_sequence("organizations", "id")
    # Ensure public marketing intake table exists (data-request / diagnostic / pitch).
    try:
        from app.db.session import engine
        from app.models.marketing_form_submission import MarketingFormSubmission

        MarketingFormSubmission.__table__.create(bind=engine, checkfirst=True)
        logger.info("Ensured marketing_form_submissions table exists")
    except Exception as exc:
        logger.warning("Could not ensure marketing_form_submissions: %s", exc)

# Health check endpoint - Keep both versions for compatibility
@app.get("/")
async def root():
    return {
        "message": "LeadLab Backend API", 
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "python_version": "3.12.11"
    }

@app.get("/health")
async def health_check():
    """
    System health check endpoint

    SECURITY: Uses SQLAlchemy session from dependency injection instead of hardcoded credentials.
    Returns minimal information to avoid information disclosure.
    """
    try:
        from app.db.session import SessionLocal
        from sqlalchemy import text

        # Use existing database session configuration
        db = SessionLocal()

        # Simple query to test database connection
        db.execute(text("SELECT 1"))
        db.close()

        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        # Don't expose internal error details in production
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "timestamp": datetime.now().isoformat()
        }

@app.get("/api/v1/status")
async def api_status():
    """API status"""
    return {
        "api_version": "v1",
        "status": "active",
        "endpoints": [
            "/",
            "/health", 
            "/api/v1/status",
            "/docs",
            "/redoc"
        ]
    }

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Development - Vite default port
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Development - Other ports
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        # Production
        "https://the-leadlab.com",
        "https://www.the-leadlab.com",
        "https://api.the-leadlab.com",
        # Vercel previews (marketing intake / staging)
        "https://ll-alilead.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "Origin",
        "X-Requested-With",
        "DNT",
        "User-Agent",
        "If-Modified-Since",
        "Cache-Control",
        "Range",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers"
    ],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url.path} from origin: {request.headers.get('origin')}")
    if request.method != "OPTIONS":  # Don't log OPTIONS request bodies
        try:
            body = await request.body()
            if body:
                logger.debug("Request body: %s", safe_request_body_log(request.url.path, body))
        except Exception as e:
            logger.error(f"Error reading request body: {e}")
    
    response: Response = await call_next(request)
    logger.info(f"Response: {request.method} {request.url.path} - Status: {response.status_code}")
    return response

# Add URL normalizer middleware after CORS
app.add_middleware(URLNormalizerMiddleware)

# Add security middleware for rate limiting and security headers
app.add_middleware(
    SecurityMiddleware,
    max_requests_per_minute=60,  # Adjust based on your needs
    max_request_size=10 * 1024 * 1024  # 10MB
)

# Mount the API router with EXPLICIT prefix
logger.debug("Mounting API router with routes:")
for route in api_router.routes:
    logger.debug(f"Route: {route.path} - Methods: {route.methods}")

# Use explicit /api/v1 prefix instead of settings.API_V1_STR
app.include_router(api_router, prefix=settings.API_V1_STR)

# Debug endpoint to list all routes
@app.get("/debug/routes")
async def debug_routes():
    """List all registered routes"""
    routes = []
    for route in app.routes:
        routes.append({
            "path": route.path,
            "methods": list(route.methods) if hasattr(route, "methods") else None,
            "name": route.name if hasattr(route, "name") else None,
        })
    return {"routes": routes}

if __name__ == "__main__":
    import uvicorn
    
    # Log settings for debugging
    logger.info(f"Starting server with CORS origins: {['http://localhost:3000', 'http://127.0.0.1:3000']}")
    logger.info(f"CORS headers: {['DNT', 'User-Agent', 'X-Requested-With', 'If-Modified-Since', 'Cache-Control', 'Content-Type', 'Range', 'Authorization', 'Origin', 'Accept']}")
    logger.info(f"API URL: /api/v1")
    
    # Make sure to bind to 0.0.0.0 to allow external connections
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000, 
        log_level="info",
        access_log=True
    )
