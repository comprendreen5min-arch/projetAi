from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.dataset_version import DatasetVersion
from app.schemas.cleaning import (
    CleaningApplyRequest,
    CleaningApplyResponse,
    CleaningPreviewRequest,
    CleaningPreviewResponse,
)
from app.services.cleaning_service import cleaning_service
from app.services.profiling_service import profiling_service

router = APIRouter()


@router.post("/preview", response_model=CleaningPreviewResponse)
def preview_cleaning_pipeline(
    payload: CleaningPreviewRequest,
    db: Session = Depends(get_db),
):
    """Simulates one or several cleaning operations without persisting anything to disk or DB.
    Returns the affected row count, sample before/after, and target impact warnings.
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.source_version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version source '{payload.source_version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet source introuvable sur le disque.",
        )

    try:
        raw_ops = [op.model_dump() for op in payload.operations]
        result = cleaning_service.preview_cleaning(
            parquet_path=file_path,
            operations=raw_ops,
            target_column=payload.target_column,
        )
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la prévisualisation du nettoyage: {str(exc)}",
        )


@router.post("/apply", response_model=CleaningApplyResponse, status_code=status.HTTP_201_CREATED)
def apply_cleaning_pipeline(
    payload: CleaningApplyRequest,
    db: Session = Depends(get_db),
):
    """Executes the cleaning operations server-side, verifies no-op and target protection,
    atomically writes the immutable Parquet artifact, creates a new DatasetVersion and Transformation,
    and returns before/after profiles with health score deltas.
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.source_version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version source '{payload.source_version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet source introuvable sur le disque.",
        )

    raw_ops = [op.model_dump() for op in payload.operations]

    try:
        res = cleaning_service.apply_cleaning_and_create_version(
            db=db,
            source_version=version,
            operations=raw_ops,
            target_column=payload.target_column,
            confirm_target_modification=payload.confirm_target_modification,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'application du nettoyage: {str(exc)}",
        )

    new_version = res["new_version"]
    transformation = res["transformation"]
    before_prof = res["before_profile"]
    after_prof = res["after_profile"]
    pipe_res = res["pipeline_result"]

    # Compute deltas
    before_summary = before_prof.get("summary", {})
    after_summary = after_prof.get("summary", {})

    b_score = before_summary.get("health_score", 0)
    a_score = after_summary.get("health_score", 0)
    health_delta = int(a_score - b_score)

    b_sub = before_summary.get("sub_scores", {}) or {}
    a_sub = after_summary.get("sub_scores", {}) or {}
    sub_deltas = {}
    for metric in ["completeness", "uniqueness", "validity", "consistency", "class_balance"]:
        b_val = b_sub.get(metric)
        a_val = a_sub.get(metric)
        if b_val is not None and a_val is not None:
            sub_deltas[metric] = round(float(a_val - b_val), 1)
        elif a_val is not None:
            sub_deltas[metric] = round(float(a_val), 1)
        else:
            sub_deltas[metric] = 0.0

    return CleaningApplyResponse(
        new_version_hash=new_version.version_hash,
        new_version_id=str(new_version.id),
        parent_version_hash=version.version_hash,
        rows_before=pipe_res["rows_before"],
        rows_after=pipe_res["rows_after"],
        rows_affected=pipe_res["rows_affected"],
        transformation_name=transformation.name if transformation else "CLEANING_PIPELINE",
        parameters=transformation.parameters if transformation else {},
        before_profile=before_prof,
        after_profile=after_prof,
        health_score_delta=health_delta,
        sub_scores_delta=sub_deltas,
    )


@router.get("/categories", response_model=Dict[str, Any])
def get_column_categories(
    version_hash: str = Query(..., description="Hash de la version"),
    column: str = Query(..., description="Nom de la colonne"),
    normalized: bool = Query(False, description="Normaliser les valeurs préalablement"),
    db: Session = Depends(get_db),
):
    """Returns the unique categories and counts for a column of a version,
    optionally normalized (lowercase, trimmed, diacritics stripped).
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == version_hash).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version introuvable.")

    import pyarrow.parquet as pq
    import pandas as pd

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier Parquet introuvable.")

    table = pq.read_table(file_path, columns=[column])
    df = table.to_pandas()
    series = df[column].dropna()

    if normalized:
        series = series.apply(cleaning_service.normalize_text_value)

    vc = series.value_counts().head(50)

    # Compute deterministic safe mappings and uncertain mappings for this column
    raw_series = df[column].dropna().astype(str)
    raw_series = raw_series[raw_series.str.strip() != ""]
    val_counts = raw_series.value_counts().to_dict()

    norm_groups: Dict[str, List[tuple]] = {}
    for val, count in val_counts.items():
        norm = cleaning_service.normalize_text_value(val)
        if norm not in norm_groups:
            norm_groups[norm] = []
        norm_groups[norm].append((val, count))

    safe_mappings: List[Dict[str, Any]] = []
    auto_mapping_dict: Dict[str, str] = {}
    for norm, members in norm_groups.items():
        if len(members) > 1:
            # Sort by count descending, canonical is the majority variant
            sorted_m = sorted(members, key=lambda x: x[1], reverse=True)
            canonical = sorted_m[0][0].strip()
            for variant, cnt in sorted_m[1:]:
                safe_mappings.append({
                    "column": column,
                    "from": variant,
                    "to": canonical,
                    "rows": int(cnt),
                    "is_uncertain": False,
                })
                auto_mapping_dict[variant] = canonical

    uncertain_mappings = cleaning_service.detect_uncertain_category_mappings(df, column)

    return {
        "column": column,
        "normalized": normalized,
        "categories": [{"value": str(k), "count": int(v)} for k, v in vc.items()],
        "total_unique": int(series.nunique()),
        "safe_mappings": safe_mappings,
        "auto_mapping_dict": auto_mapping_dict,
        "uncertain_mappings": uncertain_mappings,
    }

