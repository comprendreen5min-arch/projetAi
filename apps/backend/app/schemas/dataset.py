from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.version import DatasetVersionRead


class DatasetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Nom unique du dataset")
    description: Optional[str] = Field(None, description="Description ou objectif pour les modèles IA")


class DatasetCreate(DatasetBase):
    pass


class DatasetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None


class DatasetRead(DatasetBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    version_count: Optional[int] = 0
    latest_version: Optional[DatasetVersionRead] = None

    model_config = ConfigDict(from_attributes=True)


class DatasetDetail(DatasetRead):
    versions: List[DatasetVersionRead] = []

