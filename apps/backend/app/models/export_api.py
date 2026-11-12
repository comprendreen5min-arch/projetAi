import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID


class ExportApiRun(Base):
    __tablename__ = "export_api_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_model_name = Column(String(100), nullable=False, default="")
    production_model_name = Column(String(100), nullable=False, default="")
    model_format = Column(String(50), default="docker", nullable=False)
    data_format = Column(String(50), default="parquet", nullable=False)
    deploy_target = Column(String(50), default="hosted", nullable=False)
    export_options = Column(JSON, default=dict, nullable=False)
    api_keys = Column(JSON, default=list, nullable=False)
    webhooks = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    dataset = relationship("Dataset")
