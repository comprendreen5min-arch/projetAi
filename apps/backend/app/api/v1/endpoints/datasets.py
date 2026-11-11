import time
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.schemas.dataset import DatasetCreate, DatasetRead, DatasetDetail, DatasetUpdate
from app.schemas.version import (
    DatasetVersionRead,
    LineageGraphResponse,
    VersioningHeaderMetrics,
    CurrentVersionUpdate,
    BaselineVersionUpdate,
)
from app.services.parquet_service import parquet_service
from app.services.storage_service import storage_service
from app.services.lineage_service import lineage_service
from app.services.versioning_service import versioning_service


router = APIRouter()


@router.post("/", response_model=DatasetRead, status_code=status.HTTP_201_CREATED)
def create_dataset(dataset_in: DatasetCreate, db: Session = Depends(get_db)):
    """Create a new dataset container."""
    existing = db.query(Dataset).filter(Dataset.name == dataset_in.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un dataset avec le nom '{dataset_in.name}' existe déjà.",
        )
    dataset = Dataset(name=dataset_in.name, description=dataset_in.description)
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("/", response_model=List[DatasetRead])
def list_datasets(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List all datasets with latest version and version count."""
    datasets = db.query(Dataset).offset(skip).limit(limit).all()
    
    results = []
    for ds in datasets:
        version_count = len(ds.versions)
        latest_version = ds.versions[0] if ds.versions else None
        
        # Build DatasetRead with counts and latest version
        ds_read = DatasetRead(
            id=ds.id,
            name=ds.name,
            description=ds.description,
            created_at=ds.created_at,
            updated_at=ds.updated_at,
            version_count=version_count,
            latest_version=DatasetVersionRead.model_validate(latest_version) if latest_version else None,
        )
        results.append(ds_read)
    return results


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    """Get detailed information about a dataset and its versions."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset non trouvé.",
        )
    
    return DatasetDetail(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
        version_count=len(dataset.versions),
        latest_version=DatasetVersionRead.model_validate(dataset.versions[0]) if dataset.versions else None,
        versions=[DatasetVersionRead.model_validate(v) for v in dataset.versions],
    )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    """Delete a dataset and all associated versions."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset non trouvé.",
        )
    db.delete(dataset)
    db.commit()
    return None


@router.post("/{dataset_id}/upload", response_model=DatasetVersionRead, status_code=status.HTTP_201_CREATED)
async def upload_csv_for_dataset(
    dataset_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a CSV file for an existing dataset, converts it to Parquet,
    calculates cryptographic version hash, and creates an immutable DatasetVersion.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset non trouvé.",
        )

    if not file.filename or not file.filename.lower().endswith((".csv", ".tsv", ".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le fichier fourni doit être au format CSV (.csv, .tsv, .txt).",
        )

    start_time = time.time()
    csv_bytes = await file.read()
    if not csv_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le fichier CSV uploadé est vide.",
        )

    try:
        parquet_bytes, metadata, row_count = parquet_service.convert_csv_to_parquet_bytes(csv_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Erreur de conversion CSV vers Parquet: {str(e)}",
        )

    data_hash = parquet_service.calculate_bytes_hash(parquet_bytes)

    # Lineage parameters
    transformation_name = "CSV_INGESTION"
    parameters = {
        "filename": file.filename,
        "csv_size_bytes": len(csv_bytes),
        "compression": "snappy",
    }

    # Latest version as parent if one exists
    parent_version = dataset.versions[0] if dataset.versions else None
    parent_hash = parent_version.version_hash if parent_version else None

    # Compute deterministic immutable version hash scoped to this dataset
    version_hash = lineage_service.generate_version_hash(
        dataset_id=dataset_id,
        parent_version_hash=parent_hash,
        transformation_name=transformation_name,
        parameters=parameters,
        data_hash=data_hash,
    )

    # Check if this exact immutable version already exists for this dataset
    existing_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.version_hash == version_hash,
    ).first()
    if existing_version:
        return existing_version

    # Save Parquet file to dedicated storage path
    target_path = storage_service.get_version_parquet_path(dataset_id, version_hash)
    try:
        file_size = parquet_service.save_parquet(parquet_bytes, target_path)

        new_version = DatasetVersion(
            dataset_id=dataset_id,
            version_hash=version_hash,
            parent_version_id=parent_version.id if parent_version else None,
            storage_path=str(target_path),
            row_count=row_count,
            size_bytes=file_size,
            schema_metadata=metadata,
        )
        db.add(new_version)
        db.flush()

        execution_time_ms = (time.time() - start_time) * 1000.0

        transformation = Transformation(
            name=transformation_name,
            parameters=parameters,
            source_version_id=parent_version.id if parent_version else None,
            target_version_id=new_version.id,
            execution_time_ms=execution_time_ms,
        )
        db.add(transformation)
        db.commit()
        db.refresh(new_version)

        return new_version
    except Exception as exc:
        db.rollback()
        if target_path.exists():
            try:
                target_path.unlink()
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'enregistrement de la version: {str(exc)}",
        )


@router.post("/upload-raw", response_model=DatasetDetail, status_code=status.HTTP_201_CREATED)
async def upload_raw_csv_and_create_dataset(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Convenience endpoint: atomically creates a Dataset and uploads its initial CSV version in one step.
    If the upload fails, the dataset is NOT created, preventing orphaned empty datasets.
    """
    cleaned_name = name.strip()
    if not cleaned_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le nom du dataset ne peut pas être vide.",
        )

    existing = db.query(Dataset).filter(Dataset.name == cleaned_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un dataset avec le nom '{cleaned_name}' existe déjà.",
        )

    # 1. Validate file extension before modifying the database
    if not file.filename or not file.filename.lower().endswith((".csv", ".tsv", ".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le fichier fourni doit être au format CSV (.csv, .tsv, .txt).",
        )

    # 2. Read and validate CSV content
    csv_bytes = await file.read()
    if not csv_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le fichier CSV uploadé est vide.",
        )

    # 3. Test conversion to Parquet BEFORE creating the dataset in the database
    try:
        parquet_bytes, metadata, row_count = parquet_service.convert_csv_to_parquet_bytes(csv_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Erreur de conversion CSV vers Parquet: {str(e)}",
        )

    # 4. Atomic database transaction: create Dataset + initial DatasetVersion + Transformation
    dataset = Dataset(name=cleaned_name, description=description)
    db.add(dataset)
    db.flush()  # Generates dataset.id without permanent commit

    target_path = None
    try:
        start_time = time.time()
        data_hash = parquet_service.calculate_bytes_hash(parquet_bytes)

        transformation_name = "CSV_INGESTION"
        parameters = {
            "filename": file.filename,
            "csv_size_bytes": len(csv_bytes),
            "compression": "snappy",
        }

        # Deterministic version hash scoped to this dataset
        version_hash = lineage_service.generate_version_hash(
            dataset_id=dataset.id,
            parent_version_hash=None,
            transformation_name=transformation_name,
            parameters=parameters,
            data_hash=data_hash,
        )

        target_path = storage_service.get_version_parquet_path(dataset.id, version_hash)
        file_size = parquet_service.save_parquet(parquet_bytes, target_path)

        new_version = DatasetVersion(
            dataset_id=dataset.id,
            version_hash=version_hash,
            parent_version_id=None,
            storage_path=str(target_path),
            row_count=row_count,
            size_bytes=file_size,
            schema_metadata=metadata,
        )
        db.add(new_version)
        db.flush()

        execution_time_ms = (time.time() - start_time) * 1000.0

        transformation = Transformation(
            name=transformation_name,
            parameters=parameters,
            source_version_id=None,
            target_version_id=new_version.id,
            execution_time_ms=execution_time_ms,
        )
        db.add(transformation)
        db.commit()
        db.refresh(dataset)
    except Exception as exc:
        db.rollback()
        if target_path and target_path.exists():
            try:
                target_path.unlink()
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Échec lors de la création atomique du dataset et de sa version: {str(exc)}",
        )

    return get_dataset(dataset_id=dataset.id, db=db)


@router.get("/{dataset_id}/lineage", response_model=LineageGraphResponse)
def get_dataset_lineage(dataset_id: UUID, db: Session = Depends(get_db)):
    """Returns the DAG lineage graph of versions for a dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset non trouvé.")
    return versioning_service.get_lineage_graph(dataset, db)


@router.get("/{dataset_id}/versioning-header", response_model=VersioningHeaderMetrics)
def get_dataset_versioning_header(dataset_id: UUID, db: Session = Depends(get_db)):
    """Returns top KPI metrics for dataset versioning page."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset non trouvé.")
    return versioning_service.get_versioning_header(dataset, db)


@router.put("/{dataset_id}/current-version")
def update_current_version(dataset_id: UUID, payload: CurrentVersionUpdate, db: Session = Depends(get_db)):
    """Sets current active version of dataset without modifying data."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset non trouvé.")
    version = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset_id, DatasetVersion.version_hash == payload.version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{payload.version_hash}' introuvable pour ce dataset.")
    versioning_service.set_current_version(dataset, version, db)
    return {"success": True, "current_version_hash": version.version_hash}


@router.put("/{dataset_id}/baseline-version")
def update_baseline_version(dataset_id: UUID, payload: BaselineVersionUpdate, db: Session = Depends(get_db)):
    """Sets baseline reference version of dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset non trouvé.")
    version = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset_id, DatasetVersion.version_hash == payload.version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{payload.version_hash}' introuvable pour ce dataset.")
    versioning_service.set_baseline_version(dataset, version, db)
    return {"success": True, "baseline_version_hash": version.version_hash}

