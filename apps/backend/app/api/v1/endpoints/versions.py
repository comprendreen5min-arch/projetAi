from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.schemas.version import (
    DatasetVersionRead,
    DatasetVersionDetail,
    TagCreate,
    TagRead,
    BranchCreate,
    CompareRequest,
    CompareResponse,
    RowDiffPage,
    ViewQueryResponse,
    GuardrailItem,
    DatasetCardResponse,
    LineageGraphResponse,
    VersioningHeaderMetrics,
)
from app.services.parquet_service import parquet_service
from app.services.diff_service import diff_service
from app.services.profiling_service import profiling_service
from app.services.versioning_service import versioning_service


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


def resolve_original_filename(version: DatasetVersion) -> str:
    """Finds the true uploaded source filename by inspecting current version's
    transformation or traversing parent lineage up to the root ingestion.
    """
    curr = version
    while curr:
        if curr.transformation_produced and curr.transformation_produced.parameters:
            fn = curr.transformation_produced.parameters.get("filename") or curr.transformation_produced.parameters.get("original_filename")
            if fn:
                return fn
        if not curr.parent_version_id:
            break
        curr = curr.parent_version

    if version.dataset and version.dataset.versions:
        for v in version.dataset.versions:
            if v.parent_version_id is None and v.transformation_produced and v.transformation_produced.parameters:
                fn = v.transformation_produced.parameters.get("filename") or v.transformation_produced.parameters.get("original_filename")
                if fn:
                    return fn

    if version.dataset and version.dataset.name:
        name = version.dataset.name
        return name if name.endswith(".csv") else f"{name}.csv"
    return "dataset.csv"


def resolve_version_depth(version: DatasetVersion) -> int:
    """Calculates 1-based lineage depth of an immutable version (root ingestion = 1)."""
    depth = 1
    curr = version
    visited = set()
    while curr and curr.parent_version_id and curr.id not in visited:
        visited.add(curr.id)
        depth += 1
        curr = curr.parent_version
    return depth


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

    # Extract original source filename from transformation parameters or lineage
    original_filename = resolve_original_filename(version)
    version_number = resolve_version_depth(version)

    profile = profiling_service.get_or_create_profile(
        dataset_id=str(version.dataset_id),
        version_hash=version.version_hash,
        parquet_path=file_path,
        target_column=target_column,
        original_filename=original_filename,
    )
    profile["dataset_name"] = version.dataset.name if version.dataset else None
    profile["original_filename"] = original_filename
    profile["version_number"] = version_number
    if "summary" in profile:
        profile["summary"]["version_number"] = version_number
        profile["summary"]["original_filename"] = original_filename
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

    original_filename = resolve_original_filename(version)

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


@router.get("/dataset/{dataset_id}/lineage", response_model=LineageGraphResponse)
def get_dataset_lineage_via_versions(dataset_id: UUID, db: Session = Depends(get_db)):
    """Returns the DAG lineage graph for a dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset non trouvé.")
    return versioning_service.get_lineage_graph(dataset, db)


@router.get("/dataset/{dataset_id}/versioning-header", response_model=VersioningHeaderMetrics)
def get_dataset_versioning_header_via_versions(dataset_id: UUID, db: Session = Depends(get_db)):
    """Returns top KPI header metrics for the versioning page."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset non trouvé.")
    return versioning_service.get_versioning_header(dataset, db)


@router.post("/compare", response_model=CompareResponse)
def compare_versions_endpoint(payload: CompareRequest, db: Session = Depends(get_db)):
    """Compares two immutable versions with distribution shifts, row deltas, and test set check."""
    v_base = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.base_version_hash).first()
    if not v_base:
        raise HTTPException(status_code=404, detail=f"Version de base '{payload.base_version_hash}' introuvable.")

    v_target = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.target_version_hash).first()
    if not v_target:
        raise HTTPException(status_code=404, detail=f"Version cible '{payload.target_version_hash}' introuvable.")

    return versioning_service.compare_versions(v_base, v_target, row_key=payload.row_key)


@router.get("/diff/rows", response_model=RowDiffPage)
def get_row_diff_page_endpoint(
    base_hash: str = Query(...),
    target_hash: str = Query(...),
    filter: str = Query("all", pattern="^(all|added|removed|modified)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    row_key: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Returns paginated row diffs with filters (all, added, removed, modified)."""
    v_base = db.query(DatasetVersion).filter(DatasetVersion.version_hash == base_hash).first()
    if not v_base:
        raise HTTPException(status_code=404, detail=f"Version de base '{base_hash}' introuvable.")

    v_target = db.query(DatasetVersion).filter(DatasetVersion.version_hash == target_hash).first()
    if not v_target:
        raise HTTPException(status_code=404, detail=f"Version cible '{target_hash}' introuvable.")

    return versioning_service.get_row_diff_page(
        base_version=v_base,
        target_version=v_target,
        filter_type=filter,
        page=page,
        page_size=page_size,
        row_key=row_key,
    )


@router.post("/{version_hash}/tags", response_model=TagRead)
def add_tag_endpoint(version_hash: str, payload: TagCreate, db: Session = Depends(get_db)):
    """Attaches a tag (e.g. production, baseline, or custom) to an immutable version."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    return versioning_service.add_tag(version, payload.tag, db)


@router.delete("/{version_hash}/tags/{tag}")
def remove_tag_endpoint(version_hash: str, tag: str, db: Session = Depends(get_db)):
    """Removes a tag from an immutable version."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    versioning_service.remove_tag(version, tag, db)
    return {"success": True, "message": f"Tag '{tag}' supprimé de la version {version_hash[:8]}."}


@router.post("/{version_hash}/restore")
def restore_version_endpoint(version_hash: str, db: Session = Depends(get_db)):
    """Restores version as current active version. Nothing is deleted."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    versioning_service.set_current_version(version.dataset, version, db)
    return {
        "success": True,
        "message": f"Version {version_hash[:8]} restaurée comme version courante. Aucune donnée n'a été supprimée.",
        "current_version_hash": version_hash,
    }


@router.post("/{version_hash}/branch", response_model=DatasetVersionRead)
def branch_from_version_endpoint(version_hash: str, payload: BranchCreate, db: Session = Depends(get_db)):
    """Creates a draft branch from this version with a 30-day inactivity expiration."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    return versioning_service.create_branch(version, payload.branch_name or "brouillon", payload.description, db)


@router.delete("/{version_hash}")
def delete_version_endpoint(version_hash: str, db: Session = Depends(get_db)):
    """Safely deletes an immutable version if guardrails pass."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    return versioning_service.delete_version_guarded(version, db)


@router.get("/{version_hash}/views/query", response_model=ViewQueryResponse)
def query_view_endpoint(
    version_hash: str,
    split: Optional[str] = Query(None),
    origin: Optional[str] = Query(None),
    is_synthetic: Optional[bool] = Query(None),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Virtual view without duplicating data: filters on the fly and returns counts and sample rows."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    return versioning_service.query_view(
        version=version,
        split=split,
        origin=origin,
        is_synthetic=is_synthetic,
        limit=limit,
        offset=offset,
    )


@router.get("/{version_hash}/download-view")
def download_view_endpoint(
    version_hash: str,
    split: Optional[str] = Query(None),
    origin: Optional[str] = Query(None),
    is_synthetic: Optional[bool] = Query(None),
    format: str = Query("csv", pattern="^(csv|parquet|jsonl)$"),
    db: Session = Depends(get_db),
):
    """Exports a filtered view on the fly without duplicating storage."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    data_bytes, filename, media_type = versioning_service.download_view(
        version=version,
        split=split,
        origin=origin,
        is_synthetic=is_synthetic,
        file_format=format,
    )
    return Response(
        content=data_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{version_hash}/replay")
async def replay_recipe_endpoint(
    version_hash: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Replays the recorded recipe chain of this version on a newly uploaded CSV file."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")

    content = await file.read()
    return versioning_service.replay_recipe(
        target_version=version,
        new_file_bytes=content,
        new_filename=file.filename or "replayed.csv",
        db=db,
    )


@router.get("/{version_hash}/guardrails", response_model=List[GuardrailItem])
def get_version_guardrails_endpoint(version_hash: str, db: Session = Depends(get_db)):
    """Evaluates the 6 guardrails in real time against the selected version."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    return versioning_service.evaluate_guardrails(version, db)


@router.get("/{version_hash}/card", response_model=DatasetCardResponse)
def get_dataset_card_endpoint(version_hash: str, db: Session = Depends(get_db)):
    """Generates an exportable dataset card (Markdown + JSON) for this immutable version."""
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail=f"Version '{version_hash}' introuvable.")
    return versioning_service.generate_dataset_card(version, db)

