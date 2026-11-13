from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.image_cleaning_service import image_cleaning_service

router = APIRouter()


@router.get("/{dataset_id}/recipe")
def get_recipe(
    dataset_id: str,
    version_hash: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> Any:
    """Returns the image cleaning recipe, visual preview pairs and before/after quality impact."""
    return image_cleaning_service.get_cleaning_recipe(dataset_id, db, version_hash)


@router.post("/{dataset_id}/dry-run")
def dry_run(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    """Executes a dry-run of the recipe on up to 500 images without saving."""
    return image_cleaning_service.dry_run_cleaning_recipe(dataset_id, payload, db)


@router.post("/{dataset_id}/apply")
def apply_recipe(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Any:
    """Applies the image cleaning recipe, producing a new DatasetVersion v2."""
    return image_cleaning_service.apply_cleaning_recipe(dataset_id, payload, db)

