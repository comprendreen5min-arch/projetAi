from typing import Any, Dict
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.text_labeling_service import text_labeling_service

router = APIRouter()


@router.get("/{dataset_id}/data", response_model=Dict[str, Any])
def get_text_labeling_data(
    dataset_id: str,
    queue: str = Query("unlabeled", description="ID de la file d'attente"),
    index: int = Query(0, ge=0, description="Index de l'élément à annoter"),
    db: Session = Depends(get_db),
) -> Any:
    return text_labeling_service.get_labeling_data(
        dataset_id=dataset_id,
        queue_id=queue,
        item_index=index,
        db=db,
    )


@router.post("/{dataset_id}/decision", response_model=Dict[str, Any])
def submit_text_label_decision(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> Any:
    return text_labeling_service.submit_decision(
        dataset_id=dataset_id,
        payload=payload,
        db=db,
    )


@router.post("/{dataset_id}/save-v4", response_model=Dict[str, Any])
def save_v4_labeled_version(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> Any:
    return text_labeling_service.save_v4_version(
        dataset_id=dataset_id,
        payload=payload,
        db=db,
    )

