import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class DatasetVersion(Base):
    """Represents an immutable snapshot of a dataset.
    Once created, this record and its underlying Parquet artifact are read-only.
    """
    __tablename__ = "dataset_versions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "version_hash", name="uq_dataset_version_hash"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Cryptographic SHA-256 hash identifying this immutable version within the dataset
    version_hash = Column(String(64), index=True, nullable=False)
    
    # Lineage: parent version in the DAG (null for initial root version)
    parent_version_id = Column(GUID(), ForeignKey("dataset_versions.id"), nullable=True, index=True)
    
    # Storage URI / path to the physical Parquet file
    storage_path = Column(String(1024), nullable=False)
    
    # Metadata extracted from Parquet
    row_count = Column(BigInteger, default=0, nullable=False)
    size_bytes = Column(BigInteger, default=0, nullable=False)
    schema_metadata = Column(JSON, nullable=True)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    dataset = relationship("Dataset", back_populates="versions")
    parent_version = relationship("DatasetVersion", remote_side=[id], backref="child_versions")
    
    # Transformation relationships
    transformation_produced = relationship(
        "Transformation",
        foreign_keys="Transformation.target_version_id",
        back_populates="target_version",
        uselist=False,
    )
    transformations_consumed = relationship(
        "Transformation",
        foreign_keys="Transformation.source_version_id",
        back_populates="source_version",
    )

    def __repr__(self):
        return f"<DatasetVersion(hash='{self.version_hash[:8]}...', rows={self.row_count}, created_at={self.created_at})>"

