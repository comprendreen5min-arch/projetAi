from typing import Any, Dict
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.image_versioning_service import image_versioning_service

router = APIRouter()


@router.get("/{dataset_id}/data", response_model=Dict[str, Any])
def get_image_versioning_data(
    dataset_id: str,
    db: Session = Depends(get_db)
) -> Any:
    return image_versioning_service.get_versioning_data(dataset_id=dataset_id, db=db)


@router.post("/{dataset_id}/tag-production", response_model=Dict[str, Any])
def tag_image_version_production(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    version_hash = payload.get("version_hash", "v3")
    return image_versioning_service.tag_production(dataset_id=dataset_id, version_hash=version_hash, db=db)


@router.post("/{dataset_id}/restore", response_model=Dict[str, Any])
def restore_image_version(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    version_hash = payload.get("version_hash", "v1")
    return image_versioning_service.restore_version(dataset_id=dataset_id, version_hash=version_hash, db=db)

