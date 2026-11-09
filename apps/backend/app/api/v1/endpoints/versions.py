from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.schemas.version import DatasetVersionRead, DatasetVersionDetail
from app.services.parquet_service import parquet_service
from app.services.diff_service import diff_service
from app.services.profiling_service import profiling_service

router = APIRouter()


@router.get("/dataset/{dataset_id}", response_model=List[DatasetVersionRead])
def list_versions_for_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    """List all immutable versions of a dataset, ordered from newest to oldest."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset non trouvé.",
        )
    return dataset.versions


@router.get("/hash/{version_hash}", response_model=DatasetVersionDetail)
def get_version_by_hash(
    version_hash: str,
    preview_limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get metadata and sample rows for a specific immutable version hash."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version '{version_hash}' introuvable.",
        )

    storage_path = Path(version.storage_path)
    sample_rows = parquet_service.read_sample(storage_path, limit=preview_limit)

    return DatasetVersionDetail(
        id=version.id,
        dataset_id=version.dataset_id,
        version_hash=version.version_hash,
        parent_version_id=version.parent_version_id,
        storage_path=version.storage_path,
        row_count=version.row_count,
        size_bytes=version.size_bytes,
        schema_metadata=version.schema_metadata,
        created_at=version.created_at,
        transformation_produced=version.transformation_produced,
        sample_rows=sample_rows,
    )


class TargetUpdateRequest(BaseModel):
    target_column: Optional[str] = None


@router.get("/{version_hash}/profile", response_model=Dict[str, Any])
def get_version_profile(
    version_hash: str,
    target_column: Optional[str] = Query(None, description="Colonne cible optionnelle"),
    db: Session = Depends(get_db),
):
    """Retrieves or computes the stored profiling metrics of an immutable version
    (zero recalculation on repeat calls).
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version '{version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet introuvable sur le disque.",
        )

    # Extract original source filename from transformation parameters
    original_filename = None
    if version.transformation_produced and version.transformation_produced.parameters:
        original_filename = version.transformation_produced.parameters.get("filename")
    if not original_filename:
        original_filename = f"{version.dataset.name}.csv"

    profile = profiling_service.get_or_create_profile(
        dataset_id=str(version.dataset_id),
        version_hash=version.version_hash,
        parquet_path=file_path,
        target_column=target_column,
        original_filename=original_filename,
    )
    profile["dataset_name"] = version.dataset.name
    profile["original_filename"] = original_filename
    return profile


@router.put("/{version_hash}/target", response_model=Dict[str, Any])
def update_version_target(
    version_hash: str,
    payload: TargetUpdateRequest,
    db: Session = Depends(get_db),
):
    """Updates and memorizes the target column selection for this version profile."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version '{version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet introuvable sur le disque.",
        )

    original_filename = None
    if version.transformation_produced and version.transformation_produced.parameters:
        original_filename = version.transformation_produced.parameters.get("filename")
    if not original_filename:
        original_filename = f"{version.dataset.name}.csv"

    # Recompute and memorize the updated target in the version cache
    profile = profiling_service.get_or_create_profile(
        dataset_id=str(version.dataset_id),
        version_hash=version.version_hash,
        parquet_path=file_path,
        target_column=payload.target_column,
        original_filename=original_filename,
        force_recompute=True,
    )
    profile["dataset_name"] = version.dataset.name
    profile["original_filename"] = original_filename
    return profile


@router.get("/diff", response_model=Dict[str, Any])
def compare_two_versions(
    base_hash: str = Query(..., description="Hash de la version de référence (parent/before)"),
    target_hash: str = Query(..., description="Hash de la version cible (child/after)"),
    db: Session = Depends(get_db),
):
    """Detects schema drift, row count deltas, and statistical shifts between two immutable versions."""
    version_base = db.query(DatasetVersion).filter(DatasetVersion.version_hash == base_hash).first()
    if not version_base:
        raise HTTPException(status_code=404, detail=f"Version de base '{base_hash}' introuvable.")

    version_target = db.query(DatasetVersion).filter(DatasetVersion.version_hash == target_hash).first()
    if not version_target:
        raise HTTPException(status_code=404, detail=f"Version cible '{target_hash}' introuvable.")

    path_base = Path(version_base.storage_path)
    path_target = Path(version_target.storage_path)

    if not path_base.exists() or not path_target.exists():
        raise HTTPException(status_code=404, detail="Un ou plusieurs fichiers Parquet sont introuvables sur le disque.")

    diff_report = diff_service.compare_parquet_versions(path_base, path_target)
    diff_report["base_version_hash"] = base_hash
    diff_report["target_version_hash"] = target_hash
    return diff_report


@router.get("/download/{version_hash}")
def download_parquet_file(version_hash: str, db: Session = Depends(get_db)):
    """Download the raw Parquet artifact for a specific immutable version."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version '{version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Le fichier Parquet physique est introuvable sur le disque.",
        )

    return FileResponse(
        path=file_path,
        filename=f"{version.dataset.name}_{version.version_hash[:8]}.parquet",
        media_type="application/octet-stream",
    )
