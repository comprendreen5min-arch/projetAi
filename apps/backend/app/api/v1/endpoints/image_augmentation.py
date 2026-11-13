from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.image_augmentation_service import image_augmentation_service

router = APIRouter()


@router.get("/{dataset_id}/recipe")
def get_recipe(
    dataset_id: str,
    version_hash: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> Any:
    """Returns the image augmentation recipe, split configuration, target balance, techniques, preview cards, and guardrails."""
    return image_augmentation_service.get_augmentation_recipe(dataset_id, db, version_hash)


@router.post("/{dataset_id}/compare")
def compare_models(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    """Runs a quick evaluation comparing model performance without augmentation (v2) vs with augmentation (v3)."""
    return image_augmentation_service.run_comparison(dataset_id, payload, db)


@router.post("/{dataset_id}/save-v3")
def save_v3(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    """Applies augmentation and creates a new DatasetVersion v3 with lineage tracking."""
    return image_augmentation_service.save_v3(dataset_id, payload, db)

