from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.transformation import TransformationRead


class ColumnMetadata(BaseModel):
    name: str
    type: str
    nullable: bool = True
    null_count: Optional[int] = 0


class DatasetVersionBase(BaseModel):
    dataset_id: UUID
    version_hash: str
    parent_version_id: Optional[UUID] = None
    row_count: int
    size_bytes: int
    schema_metadata: Optional[Dict[str, Any]] = None


class DatasetVersionCreate(DatasetVersionBase):
    storage_path: str


class DatasetVersionRead(DatasetVersionBase):
    id: UUID
    storage_path: str
    created_at: datetime
    transformation_produced: Optional[TransformationRead] = None

    model_config = ConfigDict(from_attributes=True)


class DatasetVersionDetail(DatasetVersionRead):
    sample_rows: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Aperçu des premières lignes")

