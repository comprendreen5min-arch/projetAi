from pathlib import Path
import time
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.schemas.transformation import ApplyTransformationRequest, TransformationRead
from app.schemas.version import DatasetVersionRead
from app.services.parquet_service import parquet_service
from app.services.storage_service import storage_service
from app.services.lineage_service import lineage_service

router = APIRouter()


@router.post("/apply/{source_version_id}", response_model=DatasetVersionRead, status_code=status.HTTP_201_CREATED)
def apply_transformation(
    source_version_id: UUID,
    payload: ApplyTransformationRequest,
    db: Session = Depends(get_db),
):
    """Applies a deterministic transformation onto a source dataset version.
    Generates a new immutable version identified by a cryptographic hash, preserving full lineage.
    """
    source_version = db.query(DatasetVersion).filter(DatasetVersion.id == source_version_id).first()
    if not source_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version source non trouvée.",
        )

    source_path = Path(source_version.storage_path)
    if not source_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet source introuvable sur le disque.",
        )

    start_time = time.time()

    # Apply transformation via parquet service
    try:
        new_parquet_bytes, metadata, row_count = parquet_service.apply_transformation_to_parquet(
            source_parquet_path=source_path,
            transformation_name=payload.transformation_name,
            parameters=payload.parameters,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Erreur lors de l'exécution de la transformation: {str(e)}",
        )

    data_hash = parquet_service.calculate_bytes_hash(new_parquet_bytes)

    # Compute deterministic version hash scoped to dataset
    new_version_hash = lineage_service.generate_version_hash(
        dataset_id=source_version.dataset_id,
        parent_version_hash=source_version.version_hash,
        transformation_name=payload.transformation_name,
        parameters=payload.parameters,
        data_hash=data_hash,
    )

    # Check if this exact immutable version already exists in this dataset
    existing = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == source_version.dataset_id,
        DatasetVersion.version_hash == new_version_hash,
    ).first()
    if existing:
        return existing

    # Save physical Parquet
    target_path = storage_service.get_version_parquet_path(source_version.dataset_id, new_version_hash)
    file_size = parquet_service.save_parquet(new_parquet_bytes, target_path)

    # Create new immutable DatasetVersion
    new_version = DatasetVersion(
        dataset_id=source_version.dataset_id,
        version_hash=new_version_hash,
        parent_version_id=source_version.id,
        storage_path=str(target_path),
        row_count=row_count,
        size_bytes=file_size,
        schema_metadata=metadata,
    )
    db.add(new_version)
    db.flush()

    execution_time_ms = (time.time() - start_time) * 1000.0

    # Record Transformation
    transformation = Transformation(
        name=payload.transformation_name,
        parameters=payload.parameters,
        source_version_id=source_version.id,
        target_version_id=new_version.id,
        execution_time_ms=execution_time_ms,
    )
    db.add(transformation)
    db.commit()
    db.refresh(new_version)

    return new_version


@router.get("/{transformation_id}", response_model=TransformationRead)
def get_transformation_detail(transformation_id: UUID, db: Session = Depends(get_db)):
    """Retrieve details of a specific transformation."""
    transformation = db.query(Transformation).filter(Transformation.id == transformation_id).first()
    if not transformation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transformation non trouvée.",
        )
    return transformation

