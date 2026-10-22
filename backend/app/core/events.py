from typing import Callable
from fastapi import FastAPI
from app.db.session import engine
from app.core.config import settings
from app.monitoring.metrics import ACTIVE_USERS, REQUEST_COUNT, SYSTEM_METRICS
from app.core.logger import logger
from app.models.base import Base
import psutil
import aiohttp
import asyncio
from prometheus_client import Gauge, Counter, Histogram

# Yeni metrikler
API_LATENCY = Histogram('api_latency_seconds', 'API endpoint latency')
ERROR_COUNT = Counter('error_count', 'Number of errors', ['error_type'])
SYSTEM_RESOURCES = Gauge('system_resources', 'System resource usage', ['resource_type'])

_LEAD_SEARCH_INDEXES = (
    ("ix_leads_org_deleted", "organization_id, is_deleted"),
    ("ix_leads_org_first_name", "organization_id, first_name"),
    ("ix_leads_org_last_name", "organization_id, last_name"),
    ("ix_leads_org_email", "organization_id, email"),
    ("ix_leads_org_company", "organization_id, company"),
)


def _ensure_lead_search_indexes() -> None:
    """Best-effort indexes for lead search. Existing DBs are not updated by create_all."""
    from sqlalchemy import text
    try:
        dialect = engine.dialect.name
        with engine.begin() as conn:
            for name, cols in _LEAD_SEARCH_INDEXES:
                try:
                    if dialect == "mysql":
                        conn.execute(text(f"CREATE INDEX {name} ON leads ({cols})"))
                    else:
                        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON leads ({cols})"))
                except Exception:
                    pass
            if dialect == "postgresql":
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                    for col in ("first_name", "last_name", "email", "company"):
                        conn.execute(
                            text(
                                f"CREATE INDEX IF NOT EXISTS ix_leads_{col}_trgm "
                                f"ON leads USING gin ({col} gin_trgm_ops)"
                            )
                        )
                except Exception:
                    pass
    except Exception as exc:
        logger.warning("Could not ensure lead search indexes: %s", exc)

async def startup_handler(app: FastAPI) -> None:
    try:
        # Port kontrolleri
        await check_port_availability()
        await configure_ports()
        
        # Mevcut kontroller
        from app.models import TaskAttachment  # noqa: F401 — register table for create_all
        from app.models import SupportTicket  # noqa: F401 — register support_tickets
        from app.models import SupportTicketAttachment  # noqa: F401
        Base.metadata.create_all(bind=engine)
        try:
            from app.core.task_attachment_schema import ensure_task_attachments_schema

            ensure_task_attachments_schema(engine)
        except Exception as exc:
            logger.warning("Could not ensure task_attachments on startup: %s", exc)
        try:
            from app.core.support_ticket_schema import ensure_support_tickets_schema

            ensure_support_tickets_schema(engine)
        except Exception as exc:
            logger.warning("Could not ensure support_tickets on startup: %s", exc)
        try:
            from app.core.client_ownership_schema import ensure_client_ownership_schema

            ensure_client_ownership_schema(engine)
        except Exception as exc:
            logger.warning("Could not ensure client ownership columns on startup: %s", exc)
        try:
            from app.core.assignees_schema import ensure_assignees_schema

            ensure_assignees_schema(engine)
        except Exception as exc:
            logger.warning("Could not ensure assignee tables on startup: %s", exc)
        _ensure_lead_search_indexes()
        ACTIVE_USERS.set(0)
        REQUEST_COUNT.clear()
        
        # Genişletilmiş sistem kontrolleri
        await check_all_dependencies()
        await initialize_monitoring()
        await setup_background_tasks(app)
        
        logger.info("Application startup completed", extra={
            "environment": settings.ENVIRONMENT,
            "debug_mode": settings.DEBUG,
            "system_resources": await get_system_resources()
        })
    except Exception as e:
        logger.critical(f"Startup failed: {str(e)}")
        raise

async def check_all_dependencies() -> None:
    """Tüm bağımlılıkların sağlık kontrolü"""
    await asyncio.gather(
        check_redis_connection(),
        check_crystal_api_connection(),
        check_stripe_api(),
        check_database_connection()
    )

async def check_stripe_api() -> None:
    """Stripe API bağlantı kontrolü"""
    try:
        import stripe
        stripe.api_key = settings.STRIPE_API_KEY
        stripe.Account.retrieve()
    except Exception as e:
        logger.error(f"Stripe API connection failed: {str(e)}")
        ERROR_COUNT.labels(error_type='stripe_api').inc()
        raise

async def check_database_connection() -> None:
    """MySQL health check for cPanel"""
    try:
        async with engine.connect() as conn:
            # Basic connectivity
            await conn.execute("SELECT 1")
            
            # Check important variables
            variables = await conn.execute("""
                SELECT @@max_connections, 
                       @@wait_timeout,
                       @@interactive_timeout,
                       @@innodb_buffer_pool_size
            """)
            
            # Check current usage
            status = await conn.execute("""
                SELECT SUM(data_length + index_length) / 1024 / 1024 AS total_mb,
                       COUNT(*) as total_tables
                FROM information_schema.tables 
                WHERE table_schema = 'httpdvic1_leadlab'
            """)
            
            logger.info("MySQL health check completed", extra={
                "variables": dict(variables),
                "status": dict(status)
            })
    except Exception as e:
        logger.error(f"MySQL check failed: {str(e)}")
        ERROR_COUNT.labels(error_type='mysql').inc()
        raise

async def initialize_monitoring() -> None:
    """Monitoring sistemini başlat"""
    SYSTEM_RESOURCES.labels(resource_type='cpu').set(psutil.cpu_percent())
    SYSTEM_RESOURCES.labels(resource_type='memory').set(psutil.virtual_memory().percent)
    SYSTEM_RESOURCES.labels(resource_type='disk').set(psutil.disk_usage('/').percent)

async def monitor_system_health() -> None:
    """Sistem sağlığını periyodik olarak kontrol et"""
    while True:
        try:
            resources = await get_system_resources()
            for resource_type, value in resources.items():
                SYSTEM_RESOURCES.labels(resource_type=resource_type).set(value)
            
            await asyncio.sleep(settings.HEALTH_CHECK_INTERVAL)
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            ERROR_COUNT.labels(error_type='health_check').inc()

async def setup_background_tasks(app: FastAPI) -> None:
    """Background task'ları başlat"""
    app.state.background_tasks = set()
    task = asyncio.create_task(monitor_system_health())
    app.state.background_tasks.add(task)

async def shutdown_handler(app: FastAPI) -> None:
    try:
        # Background task'ları durdur
        for task in app.state.background_tasks:
            task.cancel()
        
        # Bağlantıları kapat
        await engine.dispose()
        await shutdown_celery_workers()
        
        logger.info("Application shutdown completed")
    except Exception as e:
        logger.error(f"Shutdown error: {str(e)}")
        raise

async def check_redis_connection() -> None:
    """Redis bağlantı kontrolü"""
    from redis import Redis
    redis = Redis.from_url(settings.REDIS_URL)
    try:
        redis.ping()
    except Exception as e:
        logger.error(f"Redis connection failed: {str(e)}")
        raise

async def check_crystal_api_connection() -> None:
    """Crystal API bağlantı kontrolü"""
    from app.services.crystal_knows import CrystalKnowsService
    try:
        crystal = CrystalKnowsService()
        await crystal.check_connection()
    except Exception as e:
        logger.error(f"Crystal API connection failed: {str(e)}")
        raise

async def shutdown_celery_workers() -> None:
    """Celery worker'ları durdur"""
    from app.core.celery_app import celery_app
    try:
        celery_app.control.shutdown()
    except Exception as e:
        logger.error(f"Celery shutdown error: {str(e)}")

async def check_port_availability() -> None:
    """Port kullanılabilirlik kontrolü"""
    import socket

    required_ports = {
        'http': 80,
        'https': 443,
        'elastic': 9200
    }

    for service, port in required_ports.items():
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(('', port))
            sock.close()
            logger.info(f"Port {port} ({service}) is available")
        except OSError:
            logger.warning(f"Port {port} ({service}) is already in use")
            ERROR_COUNT.labels(error_type=f'port_{service}').inc()

async def configure_ports() -> None:
    """Port yapılandırması"""
    from app.core.config import settings
    
    settings.ALLOWED_INCOMING_PORTS = [80, 443]
    settings.ALLOWED_OUTGOING_PORTS = [9200]
    
    logger.info("Port configuration completed", extra={
        "incoming_ports": settings.ALLOWED_INCOMING_PORTS,
        "outgoing_ports": settings.ALLOWED_OUTGOING_PORTS
    })

async def check_hosting_limits():
    """Hosting limitleri kontrolü"""
    try:
        # CPU ve RAM kullanımı kontrolü
        cpu_usage = psutil.cpu_percent()
        memory_usage = psutil.virtual_memory().percent
        
        # IO ve INODE kontrolü
        io_counter = psutil.disk_io_counters()
        inode_usage = psutil.disk_usage('/').inode_percent
        
        # Metrikleri kaydet
        SYSTEM_RESOURCES.labels('cpu').set(cpu_usage)
        SYSTEM_RESOURCES.labels('memory').set(memory_usage)
        SYSTEM_RESOURCES.labels('io').set(io_counter.read_bytes + io_counter.write_bytes)
        SYSTEM_RESOURCES.labels('inodes').set(inode_usage)
        
        # Limit aşımı kontrolü
        if any([
            cpu_usage > 90,
            memory_usage > 90,
            inode_usage > 90
        ]):
            logger.warning("Resource usage approaching limits", extra={
                "cpu": cpu_usage,
                "memory": memory_usage,
                "inodes": inode_usage
            })
            
    except Exception as e:
        logger.error(f"Hosting limits check failed: {str(e)}")
        ERROR_COUNT.labels(error_type='hosting_check').inc() 