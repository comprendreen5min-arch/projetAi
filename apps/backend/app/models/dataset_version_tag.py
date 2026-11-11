import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class DatasetVersionTag(Base):
    """Represents a mutable tag assigned to an immutable DatasetVersion.
    E.g.: 'production', 'baseline', 'archived', or user-defined labels.
    """
    __tablename__ = "dataset_version_tags"
    __table_args__ = (
        UniqueConstraint("version_id", "tag", name="uq_version_tag"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    version_id = Column(GUID(), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    tag = Column(String(50), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship
    version = relationship("DatasetVersion", back_populates="tags")

    def __repr__(self):
        return f"<DatasetVersionTag(tag='{self.tag}', version_id={self.version_id})>"

