from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.export_api import (
    ExportApiStateResponse,
    UpdateExportSettingsRequest,
    DeployToStagingResponse,
    CreateApiKeyResponse,
)
from app.services.export_api_service import export_api_service

router = APIRouter()


@router.get("/{dataset_id}/state", response_model=ExportApiStateResponse)
def get_export_state(dataset_id: str, db: Session = Depends(get_db)):
    return export_api_service.get_state(dataset_id, db)


@router.put("/{dataset_id}/settings", response_model=ExportApiStateResponse)
def update_export_settings(
    dataset_id: str,
    req: UpdateExportSettingsRequest,
    db: Session = Depends(get_db),
):
    return export_api_service.update_settings(dataset_id, req, db)


@router.post("/{dataset_id}/deploy-staging", response_model=DeployToStagingResponse)
def deploy_to_staging(dataset_id: str, db: Session = Depends(get_db)):
    return export_api_service.deploy_to_staging(dataset_id, db)


@router.post("/{dataset_id}/api-keys")
def create_api_key(
    dataset_id: str,
    body: dict,
    db: Session = Depends(get_db),
):
    name = body.get("name", "New key")
    scope = body.get("scope", "predict")
    return export_api_service.create_api_key(dataset_id, name, scope, db)

