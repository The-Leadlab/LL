import os
from typing import Generator, Dict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.base  # noqa: F401 — register models on the shared metadata
from app.models.base import Base
from main import app
from app.api.deps import get_db

DEFAULT_MYSQL_TEST_URL = "mysql+pymysql://httpdvic1_test:JVI~dEtn6#gs@localhost:3306/httpdvic1_test"
SQLITE_TEST_URL = "sqlite://"


def _make_engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(url)


def _reachable_test_engine():
    configured = os.environ.get("TEST_DATABASE_URL", DEFAULT_MYSQL_TEST_URL)
    try:
        engine = _make_engine(configured)
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        return engine
    except Exception:
        if configured.startswith("sqlite"):
            raise
        return _make_engine(SQLITE_TEST_URL)


engine = _reachable_test_engine()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
if engine.url.get_backend_name() == "sqlite":
    os.environ.setdefault("TEST_DATABASE_URL", SQLITE_TEST_URL)

@pytest.fixture(scope="session")
def db() -> Generator:
    # Database oluştur
    Base.metadata.create_all(bind=engine)
    
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()
        # Test database'ini temizle
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="module")
def client() -> Generator:
    def _get_db() -> Generator:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture(scope="module")
def test_user() -> Dict[str, str]:
    return {
        "email": "test@the-leadlab.com",
        "username": "testuser",
        "password": "test123",
        "first_name": "Test",
        "last_name": "User"
    }

@pytest.fixture(scope="module")
def test_admin() -> Dict[str, str]:
    return {
        "email": "admin@the-leadlab.com",
        "username": "admin",
        "password": "admin123",
        "first_name": "Admin",
        "last_name": "User",
        "is_admin": True
    }

@pytest.fixture(scope="module")
def test_lead() -> Dict[str, str]:
    return {
        "firstname": "John",
        "lastname": "Doe",
        "company": "Test Company",
        "job_title": "CEO",
        "location": "Istanbul",
        "sector": "Technology",
        "email": "john@testcompany.com",
        "mobile": "+905551234567"
    }
