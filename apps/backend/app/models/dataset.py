import uuid
from sqlalchemy import Column, String, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID, TimestampMixin


class Dataset(Base, TimestampMixin):
    __tablename__ = "datasets"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)

    # Relationship to immutable versions
    versions = relationship(
        "DatasetVersion",
        back_populates="dataset",
        cascade="all, delete-orphan",
        order_by="desc(DatasetVersion.created_at)",
    )

    def __repr__(self):
        return f"<Dataset(id={self.id}, name='{self.name}')>"

