import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import Base, get_db
from app.core.config import settings
from app.main import app

# Use an in-memory SQLite database for test isolation
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment(tmp_path_factory):
    # Override storage directory to temporary test directory
    test_storage = tmp_path_factory.mktemp("storage")
    settings.STORAGE_DIR = test_storage


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_csv_content():
    """Generates synthetic tabular CSV data with numerical and string columns."""
    return (
        "id,feature_a,feature_b,label\n"
        "1,10.5,alpha,0\n"
        "2,20.1,beta,1\n"
        "3,15.7,alpha,0\n"
        "4,33.2,gamma,1\n"
        "5,42.0,beta,1\n"
    ).encode("utf-8")

