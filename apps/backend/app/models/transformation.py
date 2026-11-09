import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class Transformation(Base):
    """Represents a deterministic operation executed on a source version
    producing an immutable target version.
    """
    __tablename__ = "transformations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, index=True)
    parameters = Column(JSON, default=dict, nullable=False)
    
    # Source version (can be null for initial ingestions like raw CSV upload)
    source_version_id = Column(GUID(), ForeignKey("dataset_versions.id"), nullable=True, index=True)
    
    # Target version produced by this transformation
    target_version_id = Column(GUID(), ForeignKey("dataset_versions.id"), nullable=False, unique=True, index=True)
    
    execution_time_ms = Column(Float, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    source_version = relationship("DatasetVersion", foreign_keys=[source_version_id], back_populates="transformations_consumed")
    target_version = relationship("DatasetVersion", foreign_keys=[target_version_id], back_populates="transformation_produced")

    def __repr__(self):
        return f"<Transformation(id={self.id}, name='{self.name}', source={self.source_version_id}, target={self.target_version_id})>"

