from typing import Dict, Any
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.image_export_api_service import image_export_api_service

router = APIRouter()


@router.get("/{dataset_id}/state")
def get_state(dataset_id: str, db: Session = Depends(get_db)):
    """Retrieve complete Export / API dashboard state for image dataset."""
    return image_export_api_service.get_state(dataset_id, db)


@router.post("/{dataset_id}/download")
def download_dataset(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Generate image dataset archive download link in requested format."""
    return image_export_api_service.download_dataset(dataset_id, payload, db)


@router.post("/{dataset_id}/build-package")
def build_package(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Compile model package for edge deployment (OpenVINO, ONNX, Docker, etc.)."""
    return image_export_api_service.build_package(dataset_id, payload, db)


@router.post("/{dataset_id}/start-shadow")
def start_shadow(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Launch candidate model in shadow mode on target device."""
    return image_export_api_service.start_shadow(dataset_id, payload, db)


@router.post("/{dataset_id}/create-key")
def create_api_key(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Generate a new scoped API key."""
    return image_export_api_service.create_api_key(dataset_id, payload, db)


@router.post("/{dataset_id}/add-webhook")
def add_webhook(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Register a new webhook subscription."""
    return image_export_api_service.add_webhook(dataset_id, payload, db)


@router.post("/{dataset_id}/rollback")
def rollback_model(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Initiate offline rollback to previous model version."""
    return image_export_api_service.rollback_model(dataset_id, payload, db)

