import uuid
from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID, TimestampMixin


class Dataset(Base, TimestampMixin):
    __tablename__ = "datasets"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)

    # Pointers to current active version and baseline reference version
    current_version_id = Column(
        GUID(),
        ForeignKey("dataset_versions.id", ondelete="SET NULL", use_alter=True, name="fk_dataset_current_version"),
        nullable=True,
    )
    baseline_version_id = Column(
        GUID(),
        ForeignKey("dataset_versions.id", ondelete="SET NULL", use_alter=True, name="fk_dataset_baseline_version"),
        nullable=True,
    )

    # Relationship to immutable versions
    versions = relationship(
        "DatasetVersion",
        back_populates="dataset",
        cascade="all, delete-orphan",
        order_by="desc(DatasetVersion.created_at)",
        foreign_keys="[DatasetVersion.dataset_id]",
    )

    current_version = relationship(
        "DatasetVersion",
        foreign_keys=[current_version_id],
        post_update=True,
    )
    baseline_version = relationship(
        "DatasetVersion",
        foreign_keys=[baseline_version_id],
        post_update=True,
    )

    def __repr__(self):
        return f"<Dataset(id={self.id}, name='{self.name}')>"


