import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class LabelChange(Base):
    """Represents a human or rule-based labeling decision on a specific row
    of a dataset version. Provides full audit trail and reason tracking.
    """
    __tablename__ = "label_changes"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id = Column(GUID(), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    
    row_identifier = Column(String(100), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)
    previous_label = Column(String(100), nullable=True)
    new_label = Column(String(100), nullable=False)
    decision = Column(String(50), nullable=False)  # 'keep', 'change', 'not_yet', 'unsure'
    reason = Column(String(255), nullable=True)
    author = Column(String(100), default="—", nullable=False)
    reviewed = Column(Boolean, default=False, nullable=False)
    queue_name = Column(String(50), default="suspected_errors", nullable=False)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    dataset = relationship("Dataset")
    version = relationship("DatasetVersion")

    def __repr__(self):
        return f"<LabelChange(row='{self.row_identifier}', decision='{self.decision}', {self.previous_label}->{self.new_label})>"

