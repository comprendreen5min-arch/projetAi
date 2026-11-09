from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class TransformationBase(BaseModel):
    name: str = Field(..., description="Nom de la transformation (ex: CSV_INGESTION, FILTER_ROWS, SELECT_COLUMNS)")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Paramètres déterministes de la transformation")


class TransformationCreate(TransformationBase):
    source_version_id: Optional[UUID] = None
    target_version_id: UUID
    execution_time_ms: Optional[float] = None


class TransformationRead(TransformationBase):
    id: UUID
    source_version_id: Optional[UUID] = None
    target_version_id: UUID
    execution_time_ms: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApplyTransformationRequest(BaseModel):
    transformation_name: str = Field(..., description="Nom de la transformation")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Paramètres d'application")

