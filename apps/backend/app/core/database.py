from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

db_url = settings.sync_database_url

connect_args = {}
if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # Import all models to ensure they are registered on Base.metadata
    from app.models import Dataset, DatasetVersion, Transformation, DatasetVersionTag  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Safe dynamic column migrations for existing databases
    with engine.connect() as conn:
        dialect_name = engine.dialect.name
        if dialect_name == "postgresql":
            conn.execute(text("ALTER TABLE datasets ADD COLUMN IF NOT EXISTS current_version_id UUID;"))
            conn.execute(text("ALTER TABLE datasets ADD COLUMN IF NOT EXISTS baseline_version_id UUID;"))
            conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE NOT NULL;"))
            conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN IF NOT EXISTS branch_name VARCHAR(100);"))
            conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;"))
            conn.commit()
        elif dialect_name == "sqlite":
            # For SQLite, check if column exists before trying to add it
            def column_exists(table, col):
                cursor = conn.execute(text(f"PRAGMA table_info({table})"))
                return any(row[1] == col for row in cursor.fetchall())

            if not column_exists("datasets", "current_version_id"):
                conn.execute(text("ALTER TABLE datasets ADD COLUMN current_version_id CHAR(36);"))
            if not column_exists("datasets", "baseline_version_id"):
                conn.execute(text("ALTER TABLE datasets ADD COLUMN baseline_version_id CHAR(36);"))
            if not column_exists("dataset_versions", "is_draft"):
                conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN is_draft BOOLEAN DEFAULT 0 NOT NULL;"))
            if not column_exists("dataset_versions", "branch_name"):
                conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN branch_name VARCHAR(100);"))
            if not column_exists("dataset_versions", "expires_at"):
                conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN expires_at DATETIME;"))
            conn.commit()


