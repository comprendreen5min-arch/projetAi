from typing import Any, Dict
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.text_versioning_service import text_versioning_service

router = APIRouter()


@router.get("/{dataset_id}/data")
def get_versioning_data(
    dataset_id: str,
    db: Session = Depends(get_db)
) -> Any:
    """Returns the text versioning data including lineage, compare diffs, views, models, and guardrails."""
    return text_versioning_service.get_versioning_data(dataset_id, db)


@router.post("/{dataset_id}/tag-production")
def tag_production(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    """Tags a version as production baseline."""
    version_hash = payload.get("version_hash", "v3")
    return text_versioning_service.tag_production(dataset_id, version_hash, db)


@router.post("/{dataset_id}/restore")
def restore_version(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    """Restores an older version as the active baseline."""
    version_hash = payload.get("version_hash", "v2")
    return text_versioning_service.restore_version(dataset_id, version_hash, db)

