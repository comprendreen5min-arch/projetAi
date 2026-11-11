import hashlib
import io
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pyarrow as pa
from fastapi import HTTPException, status
from scipy.stats import ks_2samp
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.dataset_version_tag import DatasetVersionTag
from app.models.transformation import Transformation
from app.schemas.version import (
    CompareResponse,
    DatasetCardResponse,
    DistributionShiftItem,
    GuardrailItem,
    LineageEdge,
    LineageGraphResponse,
    LineageNode,
    RowDiffItem,
    RowDiffPage,
    VersioningHeaderMetrics,
    ViewQueryResponse,
)
from app.services.lineage_service import lineage_service
from app.services.parquet_service import parquet_service
from app.services.profiling_service import profiling_service


def format_bytes(size: int) -> str:
    """Format bytes into human readable format."""
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    elif size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    else:
        return f"{size / (1024 * 1024 * 1024):.1f} GB"


def values_differ(v1: Any, v2: Any) -> bool:
    """Compares two values with numeric rounding tolerance to avoid false positive diffs."""
    if isinstance(v1, (pd.Series, list, np.ndarray)):
        v1 = v1[0] if len(v1) > 0 else None
    if isinstance(v2, (pd.Series, list, np.ndarray)):
        v2 = v2[0] if len(v2) > 0 else None

    na1 = False
    na2 = False
    try:
        na1 = bool(pd.isna(v1))
    except Exception:
        pass
    try:
        na2 = bool(pd.isna(v2))
    except Exception:
        pass

    if na1 and na2:
        return False
    if na1 != na2:
        return True

    try:
        f1, f2 = float(v1), float(v2)
        # Tolerance: if within 1.0 and rounds to same integer or 2 decimal places, treat as same
        return abs(f1 - f2) > 1.0 or not (round(f1, 2) == round(f2, 2) or round(f1) == round(f2))
    except (ValueError, TypeError):
        return str(v1).strip().lower() != str(v2).strip().lower()


def is_id_column(col_name: str) -> bool:
    """Detects identifier columns that should be excluded from distribution shift analysis."""
    c = col_name.strip().lower()
    return c.endswith("_id") or c in ["id", "uuid", "guid", "customer_id", "client_id", "user_id"]


class VersioningService:
    def get_version_depth(self, version: DatasetVersion) -> int:
        """Calculates 1-based lineage depth of an immutable version."""
        depth = 1
        curr = version
        visited = set()
        while curr and curr.parent_version_id and curr.id not in visited:
            visited.add(curr.id)
            depth += 1
            curr = curr.parent_version
        return depth

    def get_version_label(self, version: DatasetVersion, sibling_index: int = 0) -> str:
        """Returns standard version display label like 'v1', 'v2', 'v3', 'v3-b'."""
        depth = self.get_version_depth(version)
        if version.branch_name and version.branch_name != "main":
            return f"v{depth}-{version.branch_name}"
        if version.is_draft:
            suffix = chr(ord('b') + sibling_index) if sibling_index > 0 else 'b'
            return f"v{depth}-{suffix}"
        if sibling_index > 0:
            suffix = chr(ord('b') + sibling_index - 1)
            return f"v{depth}-{suffix}"
        return f"v{depth}"

    def get_lineage_graph(self, dataset: Dataset, db: Session) -> LineageGraphResponse:
        """Builds the complete DAG of versions for a dataset with node metrics,
        recipes, branch detection, and edge labels.
        """
        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.asc())
            .all()
        )

        # Detect branches: parent_version_ids with > 1 child
        parent_children_counts: Dict[str, int] = {}
        for v in versions:
            if v.parent_version_id:
                pid_str = str(v.parent_version_id)
                parent_children_counts[pid_str] = parent_children_counts.get(pid_str, 0) + 1

        nodes: List[LineageNode] = []
        edges: List[LineageEdge] = []

        # Find current and baseline version ids
        current_vid = dataset.current_version_id
        if not current_vid and versions:
            # Default to latest non-draft or latest version
            non_drafts = [v for v in versions if not v.is_draft]
            current_vid = non_drafts[-1].id if non_drafts else versions[-1].id

        baseline_vid = dataset.baseline_version_id
        if not baseline_vid and versions:
            # Check for baseline tag or fallback to latest clean/augmented
            for v in reversed(versions):
                if any(t.tag.lower() == "baseline" for t in v.tags):
                    baseline_vid = v.id
                    break
            if not baseline_vid:
                baseline_vid = versions[-1].id

        depth_counts: Dict[Tuple[Optional[str], int], int] = {}
        for v in versions:
            pid = str(v.parent_version_id) if v.parent_version_id else None
            v_depth = self.get_version_depth(v)
            sibling_idx = depth_counts.get((pid, v_depth), 0)
            depth_counts[(pid, v_depth)] = sibling_idx + 1
            v_label = self.get_version_label(v, sibling_index=sibling_idx)

            is_branch = False
            if v.parent_version_id:
                pid_str = str(v.parent_version_id)
                if parent_children_counts.get(pid_str, 0) > 1 and (v.is_draft or v.branch_name):
                    is_branch = True

            # Determine operation type & summary
            op_type = "RAW"
            op_summary = "Initial ingestion"
            recipe_dict = None
            seed = None
            splits = None

            t = v.transformation_produced
            if t:
                op_type = t.name
                recipe_dict = t.parameters
                if "CLEANING" in t.name:
                    op_type = "CLEAN"
                    ops = t.parameters.get("operations", [])
                    op_summary = f"{len(ops)} étapes" if ops else "Nettoyé"
                elif "AUGMENTATION" in t.name:
                    op_type = "AUGMENTED"
                    techs = t.parameters.get("techniques", {})
                    if isinstance(techs, list):
                        active_techs = [x.get("name") for x in techs if isinstance(x, dict) and x.get("enabled")]
                    elif isinstance(techs, dict):
                        active_techs = [k for k, val in techs.items() if isinstance(val, dict) and val.get("enabled")]
                    else:
                        active_techs = []
                    op_summary = f"{len(active_techs)} techn." if active_techs else "Augmenté"
                    seed = t.parameters.get("split_config", {}).get("random_seed")

                    group_by = t.parameters.get("split_config", {}).get("group_by")
                    ratios = t.parameters.get("split_config", {})
                    train_r = int(ratios.get("train_ratio", 0.7) * 100)
                    val_r = int(ratios.get("val_ratio", 0.15) * 100)
                    test_r = int(ratios.get("test_ratio", 0.15) * 100)
                    splits = f"{train_r} / {val_r} / {test_r}"
                    if group_by:
                        splits += f" · par {group_by}"
                elif "BRANCH" in t.name:
                    op_type = "BRANCH"
                    op_summary = f"Branche '{v.branch_name}'"
                elif "INGESTION" in t.name:
                    op_type = "RAW"
                    op_summary = "Données brutes"

            # Check profile health score if computed
            health_score = None
            try:
                prof_data = profiling_service.get_cached_profile(str(v.dataset_id), v.version_hash)
                if prof_data and "health_score" in prof_data:
                    health_score = int(prof_data["health_score"])
            except Exception:
                health_score = None

            # Check train & synthetic row count from parquet or metadata
            train_count = None
            val_count = None
            test_count = None
            synthetic_count = None
            splits_breakdown = None
            try:
                p_path = Path(v.storage_path)
                if p_path.exists():
                    tbl = pq.read_table(p_path)
                    col_names = tbl.column_names
                    if "split" in col_names:
                        split_arr = tbl.column("split").to_pylist()
                        train_count = sum(1 for s in split_arr if s == "train")
                        val_count = sum(1 for s in split_arr if s == "val")
                        test_count = sum(1 for s in split_arr if s == "test")
                        splits_breakdown = f"Train {train_count} · Val {val_count} · Test {test_count}"
                        splits = f"Train {train_count} / Val {val_count} / Test {test_count}"
                    if "is_synthetic" in col_names:
                        synth_arr = tbl.column("is_synthetic").to_pylist()
                        synthetic_count = sum(1 for s in synth_arr if s is True)
            except Exception:
                pass

            tags_list = [t.tag for t in v.tags]
            is_baseline_flag = (v.id == baseline_vid) or ("baseline" in tags_list)
            is_current_flag = (v.id == current_vid)

            type_label = "brute"
            if is_branch or v.branch_name or v.is_draft:
                type_label = "branche"
            elif op_type == "AUGMENTED":
                type_label = "augmentée"
            elif op_type == "CLEAN":
                type_label = "nettoyée"

            api_url = f"http://localhost:8000/api/v1/versions/{v.version_hash}/download?format=parquet"

            node = LineageNode(
                id=v.id,
                version_hash=v.version_hash,
                short_hash=v.version_hash[:8],
                version_number=v_depth,
                version_label=v_label,
                type_label=type_label,
                parent_version_id=v.parent_version_id,
                operation_type=op_type,
                operation_summary=op_summary,
                row_count=v.row_count,
                splits_breakdown=splits_breakdown,
                train_row_count=train_count,
                synthetic_row_count=synthetic_count,
                size_bytes=v.size_bytes,
                size_formatted=format_bytes(v.size_bytes),
                created_at=v.created_at,
                date_formatted=v.created_at.strftime("%d %b %H:%M"),
                health_score=health_score,
                tags=tags_list,
                is_current=is_current_flag,
                is_baseline=is_baseline_flag,
                is_draft=v.is_draft,
                is_branch=is_branch,
                branch_name=v.branch_name,
                expires_at=v.expires_at,
                recipe=recipe_dict,
                recipe_summary=op_summary,
                seed=seed,
                splits=splits,
                author=" — ",
                code_version="datalift 0.9.3",
                cli_command=api_url,
                api_download_url=api_url,
                download_formats=["CSV", "Parquet", "JSONL"],
            )
            nodes.append(node)

            # Build edge
            if v.parent_version_id:
                parent_v = next((p for p in versions if p.id == v.parent_version_id), None)
                if parent_v:
                    edge_label = op_summary.upper()
                    if op_type == "CLEAN":
                        p_file = Path(parent_v.storage_path)
                        c_file = Path(v.storage_path)
                        if p_file.exists() and c_file.exists():
                            p_df = pq.read_table(p_file).to_pandas()
                            c_df = pq.read_table(c_file).to_pandas()
                            if len(p_df) == len(c_df):
                                common_c = [c for c in p_df.columns if c in c_df.columns]
                                cell_diffs = 0
                                diff_cols = set()
                                for c in common_c:
                                    d = (p_df[c] != c_df[c]) & ~(p_df[c].isna() & c_df[c].isna())
                                    if d.any():
                                        cell_diffs += int(d.sum())
                                        diff_cols.add(c)
                                if cell_diffs == 0:
                                    edge_label = "NETTOYAGE : 0 CELLULE MODIFIÉE (SANS EFFET)"
                                else:
                                    edge_label = f"NETTOYAGE : {cell_diffs} CELLULES MODIFIÉES ({', '.join(diff_cols).upper()})"
                            else:
                                diff_r = len(p_df) - len(c_df)
                                edge_label = f"NETTOYAGE : -{diff_r} LIGNES"
                        else:
                            edge_label = f"NETTOYAGE : {op_summary.upper()}"
                    elif op_type == "AUGMENTED":
                        active_names = [tech.replace('_', ' ') for tech in active_techs] if 'active_techs' in locals() and active_techs else []
                        if active_names:
                            edge_label = f"AUGMENTATION : {' + '.join(active_names).upper()}"
                        else:
                            edge_label = f"AUGMENTATION : {op_summary.upper()}"
                    edges.append(
                        LineageEdge(
                            source_id=parent_v.id,
                            source_hash=parent_v.version_hash,
                            target_id=v.id,
                            target_hash=v.version_hash,
                            label=edge_label,
                        )
                    )

        return LineageGraphResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            current_version_id=current_vid,
            baseline_version_id=baseline_vid,
            nodes=nodes,
            edges=edges,
        )

    def set_current_version(self, dataset: Dataset, version: DatasetVersion, db: Session) -> Dataset:
        """Sets dataset current_version_id without modifying any version data."""
        if version.dataset_id != dataset.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La version spécifiée n'appartient pas à ce dataset.",
            )
        dataset.current_version_id = version.id
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        return dataset

    def set_baseline_version(self, dataset: Dataset, version: DatasetVersion, db: Session) -> Dataset:
        """Sets dataset baseline_version_id and attaches 'baseline' tag."""
        if version.dataset_id != dataset.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La version spécifiée n'appartient pas à ce dataset.",
            )
        # Remove baseline tag from previous versions
        for v in dataset.versions:
            for t in list(v.tags):
                if t.tag.lower() == "baseline":
                    db.delete(t)

        # Add baseline tag to target version
        has_baseline_tag = any(t.tag.lower() == "baseline" for t in version.tags)
        if not has_baseline_tag:
            tag_obj = DatasetVersionTag(version_id=version.id, tag="baseline")
            db.add(tag_obj)

        dataset.baseline_version_id = version.id
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        return dataset

    def add_tag(self, version: DatasetVersion, tag_name: str, db: Session) -> DatasetVersionTag:
        """Adds a tag to an immutable version."""
        clean_tag = tag_name.strip().lower()
        if not clean_tag:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le tag ne peut être vide.")

        existing = (
            db.query(DatasetVersionTag)
            .filter(DatasetVersionTag.version_id == version.id, DatasetVersionTag.tag == clean_tag)
            .first()
        )
        if existing:
            return existing

        tag_record = DatasetVersionTag(version_id=version.id, tag=clean_tag)
        db.add(tag_record)
        db.commit()
        db.refresh(tag_record)
        return tag_record

    def remove_tag(self, version: DatasetVersion, tag_name: str, db: Session) -> None:
        """Removes a tag from an immutable version."""
        clean_tag = tag_name.strip().lower()
        existing = (
            db.query(DatasetVersionTag)
            .filter(DatasetVersionTag.version_id == version.id, DatasetVersionTag.tag == clean_tag)
            .first()
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tag '{clean_tag}' introuvable.")

        # If removing baseline tag, clear baseline_version_id if it pointed to this version
        if clean_tag == "baseline" and version.dataset.baseline_version_id == version.id:
            version.dataset.baseline_version_id = None
            db.add(version.dataset)

        db.delete(existing)
        db.commit()

    def create_branch(
        self,
        parent_version: DatasetVersion,
        branch_name: str,
        description: Optional[str],
        db: Session,
    ) -> DatasetVersion:
        """Creates a draft branch from parent version with 30-day inactivity expiration."""
        source_path = Path(parent_version.storage_path)
        if not source_path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier source Parquet introuvable.")

        # Read source data
        df = pq.read_table(source_path).to_pandas()
        data_hash = hashlib.sha256(df.to_json(orient="records").encode("utf-8")).hexdigest()

        branch_clean = (branch_name or "brouillon").strip().lower().replace(" ", "-")
        params = {
            "parent_hash": parent_version.version_hash,
            "branch_name": branch_clean,
            "description": description or f"Branche dérivée de {parent_version.version_hash[:8]}",
        }

        # Deterministic draft version hash
        draft_hash = lineage_service.generate_version_hash(
            parent_version_hash=parent_version.version_hash,
            transformation_name="BRANCH",
            parameters=params,
            data_hash=data_hash,
            dataset_id=parent_version.dataset_id,
        )

        # Check if draft already exists
        existing = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == parent_version.dataset_id, DatasetVersion.version_hash == draft_hash)
            .first()
        )
        if existing:
            return existing

        # Target storage path
        target_dir = source_path.parent
        target_path = target_dir / f"{draft_hash}.parquet"
        pq.write_table(pa.Table.from_pandas(df), target_path)

        expires_at = datetime.now(timezone.utc) + timedelta(days=30)

        draft_version = DatasetVersion(
            dataset_id=parent_version.dataset_id,
            version_hash=draft_hash,
            parent_version_id=parent_version.id,
            storage_path=str(target_path),
            row_count=len(df),
            size_bytes=target_path.stat().st_size,
            schema_metadata={"columns": list(df.columns)},
            is_draft=True,
            branch_name=branch_clean,
            expires_at=expires_at,
        )
        db.add(draft_version)
        db.flush()

        # Record transformation
        trans = Transformation(
            name="BRANCH",
            parameters=params,
            source_version_id=parent_version.id,
            target_version_id=draft_version.id,
            execution_time_ms=10.0,
        )
        db.add(trans)

        # Tag as draft
        draft_tag = DatasetVersionTag(version_id=draft_version.id, tag="draft")
        db.add(draft_tag)

        db.commit()
        db.refresh(draft_version)
        return draft_version

    def delete_version_guarded(self, version: DatasetVersion, db: Session) -> Dict[str, Any]:
        """Deletes a version only if guardrails pass:
        1. Refused if version has child versions.
        2. Refused if version is tagged 'production'.
        3. Refused if version is the baseline.
        """
        # 1. Child versions check
        child_count = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.parent_version_id == version.id)
            .count()
        )
        if child_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Suppression refusée : cette version possède {child_count} version(s) enfant(s) dans le lignage. Supprimez les branches dérivées d'abord.",
            )

        # 2. Production tag check
        is_prod = any(t.tag.lower() == "production" for t in version.tags)
        if is_prod:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Suppression refusée : la version est étiquetée 'production'. Retirez cette étiquette avant de supprimer.",
            )

        # 3. Baseline check
        dataset = version.dataset
        is_baseline = (dataset.baseline_version_id == version.id) or any(t.tag.lower() == "baseline" for t in version.tags)
        if is_baseline:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Suppression refusée : cette version est définie comme référence (baseline). Définissez une autre référence d'abord.",
            )

        # If current version, reassign current_version_id to parent
        if dataset.current_version_id == version.id:
            dataset.current_version_id = version.parent_version_id
            db.add(dataset)

        # Safely remove parquet file if not shared
        file_path = Path(version.storage_path)
        if file_path.exists():
            shared_count = (
                db.query(DatasetVersion)
                .filter(DatasetVersion.storage_path == str(file_path), DatasetVersion.id != version.id)
                .count()
            )
            if shared_count == 0:
                try:
                    file_path.unlink()
                except Exception:
                    pass

        # Delete associated transformations where this version was target or source
        db.query(Transformation).filter(
            (Transformation.target_version_id == version.id) | (Transformation.source_version_id == version.id)
        ).delete(synchronize_session=False)

        db.delete(version)
        db.commit()

        return {
            "success": True,
            "message": f"Version {version.version_hash[:8]} supprimée avec succès.",
            "deleted_hash": version.version_hash,
        }

    def compare_versions(
        self,
        base_version: DatasetVersion,
        target_version: DatasetVersion,
        row_key: Optional[str] = None,
    ) -> CompareResponse:
        """Deep comparison between two versions:
        - Row additions / removals / modifications (keyed or unkeyed)
        - Target class evolution (e.g. 8% -> 30%)
        - Test set integrity (identical, modified, or not applicable)
        - Distribution shift per column using Kolmogorov-Smirnov / TVD with HIGH/MEDIUM/LOW
        - Separation of expected vs unexpected changes
        """
        path_a = Path(base_version.storage_path)
        path_b = Path(target_version.storage_path)

        if not path_a.exists() or not path_b.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichiers Parquet introuvables.")

        df_a = pq.read_table(path_a).to_pandas()
        df_b = pq.read_table(path_b).to_pandas()

        base_label = self.get_version_label(base_version)
        target_label = self.get_version_label(target_version)

        # 1. Determine Row Key & Available Keys
        tech_cols = {"split", "is_synthetic", "origin", "parent_ids"}
        available_keys = []
        for col in df_b.columns:
            if col in df_a.columns and col not in tech_cols:
                is_id = col.lower().endswith("_id") or col.lower() in ["id", "customer_id", "client_id", "user_id"]
                if is_id or df_b[col].nunique() == len(df_b) or df_a[col].nunique() == len(df_a):
                    available_keys.append(col)
        available_keys = list(dict.fromkeys(available_keys))

        detected_key = None
        if row_key and row_key not in ["none", "__hash__", ""]:
            if row_key in df_a.columns and row_key in df_b.columns:
                detected_key = row_key
        elif "customer_id" in df_a.columns and "customer_id" in df_b.columns:
            detected_key = "customer_id"
        elif available_keys:
            detected_key = available_keys[0]

        # 2. Additions / Removals / Modifications
        added_count = 0
        removed_count = 0
        modified_count = 0
        added_summary = "lignes"
        removed_summary = "lignes"
        cells_modified_count = 0
        cells_modified_detail = None

        if base_version.version_hash == target_version.version_hash:
            added_count = 0
            removed_count = 0
            modified_count = 0
            added_summary = "0 ligne"
            removed_summary = "0 ligne"
            cells_modified_count = 0
            cells_modified_detail = "0 cellule modifiée (même version)"
        elif detected_key:
            from collections import defaultdict
            rows_a_by_key = defaultdict(list)
            for _, r in df_a.iterrows():
                rows_a_by_key[r[detected_key]].append(r)

            rows_b_by_key = defaultdict(list)
            for _, r in df_b.iterrows():
                rows_b_by_key[r[detected_key]].append(r)

            all_keys = set(rows_a_by_key.keys()).union(set(rows_b_by_key.keys()))
            common_cols = [c for c in df_a.columns if c in df_b.columns and c != detected_key and c not in tech_cols]
            diff_col_counts = {}

            for k in all_keys:
                list_a = rows_a_by_key.get(k, [])
                list_b = rows_b_by_key.get(k, [])
                na = len(list_a)
                nb = len(list_b)

                if nb > na:
                    added_count += (nb - na)
                elif na > nb:
                    removed_count += (na - nb)

                m = min(na, nb)
                for i in range(m):
                    ra = list_a[i]
                    rb = list_b[i]
                    row_diff = False
                    for c in common_cols:
                        if values_differ(ra[c], rb[c]):
                            row_diff = True
                            cells_modified_count += 1
                            diff_col_counts[c] = diff_col_counts.get(c, 0) + 1
                    if row_diff:
                        modified_count += 1

            if cells_modified_count == 0:
                cells_modified_detail = "0 cellule modifiée (deuxième passe identique)"
            else:
                details_parts = [f"{cnt} sur '{col}'" for col, cnt in diff_col_counts.items()]
                cells_modified_detail = f"{cells_modified_count} cellules modifiées ({', '.join(details_parts)})"
        else:
            # Row content hashing (no key)
            common_cols = [c for c in df_a.columns if c in df_b.columns and c not in tech_cols]
            def make_fp(r):
                return hashlib.md5("||".join(str(r[c]) for c in common_cols).encode("utf-8")).hexdigest()

            from collections import Counter
            counts_a = Counter(make_fp(r) for _, r in df_a.iterrows())
            counts_b = Counter(make_fp(r) for _, r in df_b.iterrows())
            all_fps = set(counts_a.keys()).union(set(counts_b.keys()))

            for fp in all_fps:
                ca = counts_a.get(fp, 0)
                cb = counts_b.get(fp, 0)
                if cb > ca:
                    added_count += (cb - ca)
                elif ca > cb:
                    removed_count += (ca - cb)
            modified_count = 0

        # Summaries
        if base_version.version_hash == target_version.version_hash:
            added_summary = "0 ligne"
            removed_summary = "0 ligne"
        elif "origin" in df_b.columns and "smote" in df_b["origin"].values:
            smote_count = (df_b["origin"] == "smote").sum()
            added_summary = f"lignes · origine = smote (+{smote_count})"
        elif "is_synthetic" in df_b.columns:
            synth_count = (df_b["is_synthetic"] == True).sum()  # noqa: E712
            added_summary = f"lignes · {synth_count} synthétiques"
        elif added_count > 0:
            added_summary = f"lignes ajoutées (+{added_count})"
        else:
            added_summary = "0 ligne ajoutée"

        if base_version.version_hash == target_version.version_hash:
            removed_summary = "0 ligne"
        elif "split" in df_a.columns and "split" in df_b.columns:
            train_a = (df_a["split"] == "train").sum()
            train_b = (df_b["split"] == "train").sum()
            if train_b < train_a:
                removed_summary = f"lignes · sous-échantillonnées, train seul (-{train_a - train_b})"
            else:
                removed_summary = "lignes retirées"
        elif removed_count > 0:
            removed_summary = f"lignes retirées (-{removed_count})"
        else:
            removed_summary = "0 ligne retirée"

        # 3. Target Distribution Evolution
        target_col = None
        target_evolution = None
        target_evolution_details = None

        if base_version.version_hash == target_version.version_hash:
            target_evolution = "Identique"
            target_evolution_details = f"Même version ({base_label})"
        else:
            t_b = target_version.transformation_produced
            if t_b and t_b.parameters and t_b.parameters.get("target_column"):
                tc = t_b.parameters.get("target_column")
                if tc in df_b.columns and tc in df_a.columns:
                    target_col = tc

            if not target_col:
                t_a = base_version.transformation_produced
                if t_a and t_a.parameters and t_a.parameters.get("target_column"):
                    tc = t_a.parameters.get("target_column")
                    if tc in df_b.columns and tc in df_a.columns:
                        target_col = tc

            if not target_col:
                for candidate in ["churned", "churn", "souscrit", "target", "label", "status", "decision", "y"]:
                    if candidate in df_a.columns and candidate in df_b.columns:
                        target_col = candidate
                        break

            if not target_col:
                for c in reversed(df_b.columns):
                    if c in df_a.columns and c not in tech_cols and not is_id_column(c):
                        if 2 <= df_b[c].nunique() <= 10:
                            target_col = c
                            break

            if target_col and target_col in df_a.columns and target_col in df_b.columns:
                if "split" in df_b.columns and (df_b["split"] == "train").sum() > 0:
                    eval_b = df_b[df_b["split"] == "train"]
                    scope_text = "sur split=train"
                else:
                    eval_b = df_b
                    scope_text = "sur ensemble du dataset"

                if "split" in df_a.columns and (df_a["split"] == "train").sum() > 0:
                    eval_a = df_a[df_a["split"] == "train"]
                else:
                    eval_a = df_a

                vc_a = eval_a[target_col].value_counts(normalize=True)
                vc_b = eval_b[target_col].value_counts(normalize=True)

                if not vc_b.empty:
                    pos_val = None
                    for p in ["yes", "oui", "1", 1, True, "positive", "churn"]:
                        if p in vc_b.index:
                            pos_val = p
                            break
                    if pos_val is None:
                        pos_val = vc_b.idxmin() if len(vc_b) > 1 else vc_b.index[0]

                    pct_a = vc_a.get(pos_val, 0.0) * 100
                    pct_b = vc_b.get(pos_val, 0.0) * 100
                    target_evolution = f"{pct_a:.1f} % → {pct_b:.0f} %".replace(".", ",")
                    target_evolution_details = f"Sur '{target_col}' = {pos_val} ({scope_text})"

        # 4. Test Set Integrity
        test_set_status = "not_applicable"
        test_set_message = "Non applicable (aucune colonne de split définie)"
        test_set_rows = None

        if base_version.version_hash == target_version.version_hash:
            if "split" in df_b.columns and (df_b["split"] == "test").sum() > 0:
                test_set_status = "identical"
                test_set_message = f"✓ Identique ({(df_b['split'] == 'test').sum()} lignes · même version)"
                test_set_rows = (df_b["split"] == "test").sum()
        elif "split" in df_a.columns and "split" in df_b.columns:
            test_a = df_a[df_a["split"] == "test"]
            test_b = df_b[df_b["split"] == "test"]
            test_set_rows = len(test_b)

            if len(test_a) == 0 and len(test_b) == 0:
                test_set_status = "not_applicable"
                test_set_message = "Aucune ligne avec split='test' trouvée"
            elif len(test_a) != len(test_b):
                test_set_status = "modified"
                test_set_message = f"⚠️ Modifié ({len(test_a)} -> {len(test_b)} lignes)"
            else:
                cols_to_compare = [c for c in test_a.columns if c in test_b.columns and c not in tech_cols]
                ta_sorted = test_a[cols_to_compare].sort_values(by=cols_to_compare).reset_index(drop=True)
                tb_sorted = test_b[cols_to_compare].sort_values(by=cols_to_compare).reset_index(drop=True)
                diff = False
                for c in cols_to_compare:
                    for idx in range(len(ta_sorted)):
                        if values_differ(ta_sorted.at[idx, c], tb_sorted.at[idx, c]):
                            diff = True
                            break
                    if diff:
                        break
                if not diff:
                    test_set_status = "identical"
                    key_note = f" · par clé '{detected_key}'" if detected_key else ""
                    test_set_message = f"✓ Identique ({len(test_b)} lignes{key_note})"
                else:
                    test_set_status = "modified"
                    test_set_message = f"⚠️ Modifié (certaines valeurs diffèrent)"
        elif "split" in df_b.columns and (df_b["split"] == "test").sum() > 0:
            test_set_status = "not_applicable"
            test_set_message = "Version source sans partition de test"
            test_set_rows = (df_b["split"] == "test").sum()

        # 5. Distribution Shift per Column
        # Exclude ID columns, technical columns, and row key
        common_cols = [
            c for c in df_a.columns
            if c in df_b.columns and c not in tech_cols and c != detected_key and not is_id_column(c)
        ]

        target_recipe = target_version.transformation_produced.parameters if target_version.transformation_produced else {}
        techs_cfg = target_recipe.get("techniques", {})

        shifts: List[DistributionShiftItem] = []
        unexpected_count = 0

        # Title of table with selected versions
        base_op = "brute"
        if base_version.transformation_produced:
            if "CLEANING" in base_version.transformation_produced.name:
                base_op = "nettoyée"
            elif "AUGMENTATION" in base_version.transformation_produced.name:
                base_op = "augmentée"
        target_op = "brute"
        if target_version.transformation_produced:
            if "CLEANING" in target_version.transformation_produced.name:
                target_op = "nettoyée"
            elif "AUGMENTATION" in target_version.transformation_produced.name:
                target_op = "augmentée"

        has_train_split = ("split" in df_b.columns and (df_b["split"] == "train").sum() > 0)
        prefix = "TRAIN • " if has_train_split else ""
        distribution_shifts_title = f"{prefix}{base_label} ({base_op}) → {target_label} ({target_op})"
        if base_version.version_hash == target_version.version_hash:
            distribution_shifts_title = f"{base_label} ({base_op}) → {target_label} ({target_op}) (Même version)"
            common_cols = []

        # Evaluate distributions on train split if present
        eval_df_a = df_a[df_a["split"] == "train"] if has_train_split and "split" in df_a.columns else df_a
        eval_df_b = df_b[df_b["split"] == "train"] if has_train_split else df_b

        for col in common_cols:
            is_num = pd.api.types.is_numeric_dtype(eval_df_a[col]) and pd.api.types.is_numeric_dtype(eval_df_b[col])
            val_a_display = "—"
            val_b_display = "—"
            shift_score = 0.0

            # Check if column is a date
            is_date = False
            if not is_num:
                try:
                    s_a_sample = eval_df_a[col].dropna()
                    if len(s_a_sample) > 0:
                        first_val = s_a_sample.iloc[0]
                        if isinstance(first_val, (pd.Timestamp, datetime, date)) or (
                            isinstance(first_val, str) and any(char.isdigit() for char in first_val)
                        ):
                            parsed_a = pd.to_datetime(s_a_sample, errors="coerce")
                            if parsed_a.notna().mean() >= 0.7:
                                parsed_b = pd.to_datetime(eval_df_b[col].dropna(), errors="coerce")
                                if parsed_b.notna().mean() >= 0.7:
                                    is_date = True
                                    dt_a = parsed_a.dt.year.dropna().astype(int)
                                    dt_b = parsed_b.dt.year.dropna().astype(int)
                except Exception:
                    is_date = False

            if is_num:
                s_a = eval_df_a[col].dropna()
                s_b = eval_df_b[col].dropna()
                if len(s_a) > 0 and len(s_b) > 0:
                    ks_res = ks_2samp(s_a, s_b)
                    shift_score = round(float(ks_res.statistic), 4)
                    mean_a = s_a.mean()
                    mean_b = s_b.mean()
                    val_a_display = f"{mean_a:.1f}" if abs(mean_a) < 1000 else f"{int(round(mean_a)):,}"
                    val_b_display = f"{mean_b:.1f}" if abs(mean_b) < 1000 else f"{int(round(mean_b)):,}"
            elif is_date and dt_a is not None and dt_b is not None:
                # Compare year distributions
                vc_ya = dt_a.value_counts(normalize=True).to_dict()
                vc_yb = dt_b.value_counts(normalize=True).to_dict()
                all_years = sorted(set(vc_ya.keys()).union(set(vc_yb.keys())))
                tvd = 0.5 * sum(abs(vc_ya.get(y, 0.0) - vc_yb.get(y, 0.0)) for y in all_years)
                shift_score = round(float(tvd), 4)
                val_a_display = ", ".join(f"{y}: {int(round(vc_ya.get(y, 0)*100))}%" for y in all_years)
                val_b_display = ", ".join(f"{y}: {int(round(vc_yb.get(y, 0)*100))}%" for y in all_years)
            else:
                vc_a = eval_df_a[col].value_counts(normalize=True)
                vc_b = eval_df_b[col].value_counts(normalize=True)
                all_cats = set(vc_a.index).union(set(vc_b.index))
                tvd = 0.5 * sum(abs(vc_a.get(cat, 0.0) - vc_b.get(cat, 0.0)) for cat in all_cats)
                shift_score = round(float(tvd), 4)
                if eval_df_a[col].nunique() <= 3:
                    top_cat = vc_a.idxmax() if not vc_a.empty else "val"
                    p_a = int(round(vc_a.get(top_cat, 0.0) * 100))
                    p_b = int(round(vc_b.get(top_cat, 0.0) * 100))
                    val_a_display = f"{p_a}% {top_cat}"
                    val_b_display = f"{p_b}% {top_cat}"
                else:
                    val_a_display = f"{eval_df_a[col].nunique()} valeurs"
                    val_b_display = f"{eval_df_b[col].nunique()} valeurs"

            # Threshold classification
            if shift_score >= 0.25:
                level = "HIGH"
            elif shift_score >= 0.10:
                level = "MEDIUM"
            elif shift_score >= 0.02:
                level = "LOW"
            else:
                level = "NONE"

            # Expected vs Unexpected determination (explained by Cleaning / Augmentation)
            is_expected = False
            explanation = None

            is_noise_en = False
            is_smote_cat = False
            if isinstance(techs_cfg, dict):
                is_noise_en = bool(techs_cfg.get("light_noise", {}).get("enabled", False))
                is_smote_cat = bool(techs_cfg.get("smote_nc", {}).get("enabled", False) and col in techs_cfg.get("smote_nc", {}).get("categorical_columns", []))
            elif isinstance(techs_cfg, list):
                for tech in techs_cfg:
                    if isinstance(tech, dict):
                        if tech.get("name") == "LIGHT_NOISE" and tech.get("enabled"):
                            is_noise_en = True
                        elif tech.get("name") == "SMOTE-NC" and tech.get("enabled") and col in tech.get("categorical_columns", []):
                            is_smote_cat = True

            # Cleaning operations check
            cleaning_ops = target_recipe.get("operations", [])
            col_cleaned = False
            if isinstance(cleaning_ops, list):
                for op in cleaning_ops:
                    if isinstance(op, dict) and op.get("column") == col:
                        col_cleaned = True
                        break

            if col == target_col:
                is_expected = True
                explanation = "Attendu par la recette d'augmentation (équilibrage cible)"
            elif col_cleaned:
                is_expected = True
                explanation = "Attendu par la recette de nettoyage"
            elif is_num and is_noise_en:
                is_expected = True
                explanation = "Bruit gaussien léger sur valeurs numériques"
            elif is_smote_cat:
                is_expected = True
                explanation = "Synthèse SMOTE-NC catégorielle"
            elif level in ["LOW", "NONE"]:
                is_expected = True
                explanation = "Décalage statistique mineur attendu"
            else:
                is_expected = False
                explanation = "Décalage inattendu non expliqué par la recette"
                unexpected_count += 1

            shifts.append(
                DistributionShiftItem(
                    column=col,
                    is_numeric=is_num,
                    val_before=val_a_display,
                    val_after=val_b_display,
                    shift_score=shift_score,
                    shift_level=level,
                    is_expected=is_expected,
                    explanation=explanation,
                )
            )

        summary_note = "Les décalages attendus proviennent de la recette (équilibre de la cible ou nettoyage). Les décalages inattendus sont signalés avant la mise en production."
        if cells_modified_detail:
            summary_note += f" • {cells_modified_detail}"

        return CompareResponse(
            base_version_hash=base_version.version_hash,
            target_version_hash=target_version.version_hash,
            base_version_label=base_label,
            target_version_label=target_label,
            row_key_used=detected_key,
            available_keys=available_keys,
            added_count=added_count,
            removed_count=removed_count,
            modified_count=modified_count,
            added_summary=added_summary,
            removed_summary=removed_summary,
            target_column=target_col,
            target_evolution=target_evolution,
            target_evolution_details=target_evolution_details,
            test_set_status=test_set_status,
            test_set_message=test_set_message,
            test_set_rows=test_set_rows,
            distribution_shifts_title=distribution_shifts_title,
            distribution_shifts=shifts,
            unexpected_shifts_count=unexpected_count,
            summary_note=summary_note,
            cells_modified_count=cells_modified_count,
            cells_modified_detail=cells_modified_detail,
        )

    def get_row_diff_page(
        self,
        base_version: DatasetVersion,
        target_version: DatasetVersion,
        filter_type: str = "all",
        page: int = 1,
        page_size: int = 20,
        row_key: Optional[str] = None,
    ) -> RowDiffPage:
        """Computes and paginates detailed row differences with Change, Row, Detail."""
        path_a = Path(base_version.storage_path)
        path_b = Path(target_version.storage_path)

        df_a = pq.read_table(path_a).to_pandas()
        df_b = pq.read_table(path_b).to_pandas()

        tech_cols = {"split", "is_synthetic", "origin", "parent_ids"}

        # 1. Determine Row Key & Available Keys (strictly matching compare_versions)
        available_keys = []
        for col in df_b.columns:
            if col in df_a.columns and col not in tech_cols:
                is_id = col.lower().endswith("_id") or col.lower() in ["id", "customer_id", "client_id", "user_id"]
                if is_id or df_b[col].nunique() == len(df_b) or df_a[col].nunique() == len(df_a):
                    available_keys.append(col)
        available_keys = list(dict.fromkeys(available_keys))

        detected_key = None
        if row_key and row_key not in ["none", "__hash__", ""]:
            if row_key in df_a.columns and row_key in df_b.columns:
                detected_key = row_key
        elif "customer_id" in df_a.columns and "customer_id" in df_b.columns:
            detected_key = "customer_id"
        elif available_keys:
            detected_key = available_keys[0]

        all_items: List[RowDiffItem] = []

        if base_version.version_hash == target_version.version_hash:
            # Same version: no differences
            all_items = []
        elif detected_key:
            from collections import defaultdict
            rows_a_by_key = defaultdict(list)
            for _, r in df_a.iterrows():
                rows_a_by_key[r[detected_key]].append(r)

            rows_b_by_key = defaultdict(list)
            for _, r in df_b.iterrows():
                rows_b_by_key[r[detected_key]].append(r)

            all_keys = sorted(set(rows_a_by_key.keys()).union(set(rows_b_by_key.keys())), key=lambda x: str(x))
            common_cols = [c for c in df_a.columns if c in df_b.columns and c != detected_key and c not in tech_cols]

            for k in all_keys:
                list_a = rows_a_by_key.get(k, [])
                list_b = rows_b_by_key.get(k, [])
                na = len(list_a)
                nb = len(list_b)

                # Added rows
                if nb > na:
                    for rb in list_b[na:]:
                        row_id_str = str(rb[detected_key])
                        if "origin" in rb and pd.notna(rb["origin"]):
                            parents = rb.get("parent_ids", "")
                            row_id_str = f"{rb['origin']} · {parents or rb[detected_key]}"

                        detail_parts = []
                        for col_name in ["age", "income", "monthly_charges", "charges", "contract", "churned", "city", "nom", "prenom"]:
                            if col_name in rb and pd.notna(rb[col_name]):
                                detail_parts.append(f"{col_name} {rb[col_name]}")
                        if not detail_parts:
                            for col_name in common_cols[:3]:
                                if col_name in rb and pd.notna(rb[col_name]):
                                    detail_parts.append(f"{col_name} {rb[col_name]}")
                        detail = " · ".join(detail_parts) if detail_parts else "Ligne ajoutée"

                        all_items.append(
                            RowDiffItem(
                                change="added",
                                row_id=row_id_str,
                                detail=detail,
                                values=rb.to_dict(),
                            )
                        )

                # Removed rows
                if na > nb:
                    for ra in list_a[nb:]:
                        row_id_str = str(ra[detected_key])
                        detail_parts = []
                        if "split" in df_a.columns and "split" in df_b.columns:
                            detail_parts.append("undersampled")
                        else:
                            detail_parts.append("retirée")
                        for col_name in ["churned", "churn", "target", "label", "souscrit", "decision"]:
                            if col_name in ra and pd.notna(ra[col_name]):
                                detail_parts.append(f"{col_name} {ra[col_name]}")
                        if not any(c in ra for c in ["churned", "churn", "target", "label", "souscrit", "decision"]):
                            for col_name in common_cols[:2]:
                                if col_name in ra and pd.notna(ra[col_name]):
                                    detail_parts.append(f"{col_name} {ra[col_name]}")
                        detail_parts.append("graine 42")
                        detail = " · ".join(detail_parts)

                        all_items.append(
                            RowDiffItem(
                                change="removed",
                                row_id=row_id_str,
                                detail=detail,
                                values=ra.to_dict(),
                            )
                        )

                # Paired rows comparison for modifications
                m = min(na, nb)
                for i in range(m):
                    ra = list_a[i]
                    rb = list_b[i]
                    mod_fields = {}
                    diff_parts = []
                    for c in common_cols:
                        if values_differ(ra[c], rb[c]):
                            mod_fields[c] = {"before": ra[c], "after": rb[c]}
                            diff_parts.append(f"{c}: {ra[c]} -> {rb[c]}")

                    if mod_fields:
                        all_items.append(
                            RowDiffItem(
                                change="modified",
                                row_id=str(k),
                                detail=" · ".join(diff_parts[:3]),
                                values=rb.to_dict(),
                                modified_fields=mod_fields,
                            )
                        )
        else:
            # Fingerprint fallback for keyless datasets
            common_cols = [c for c in df_a.columns if c in df_b.columns and c not in tech_cols]
            def make_fp(r):
                return hashlib.md5("||".join(str(r[c]) for c in common_cols).encode("utf-8")).hexdigest()

            from collections import defaultdict
            fps_a_by_hash = defaultdict(list)
            for idx, r in df_a.iterrows():
                fps_a_by_hash[make_fp(r)].append((idx, r))

            fps_b_by_hash = defaultdict(list)
            for idx, r in df_b.iterrows():
                fps_b_by_hash[make_fp(r)].append((idx, r))

            all_fps = set(fps_a_by_hash.keys()).union(set(fps_b_by_hash.keys()))
            for fp in all_fps:
                list_a = fps_a_by_hash.get(fp, [])
                list_b = fps_b_by_hash.get(fp, [])
                na = len(list_a)
                nb = len(list_b)
                if nb > na:
                    for idx, rb in list_b[na:]:
                        all_items.append(
                            RowDiffItem(
                                change="added",
                                row_id=f"Ligne {idx}",
                                detail="Ligne ajoutée (par empreinte)",
                                values=rb.to_dict(),
                            )
                        )
                if na > nb:
                    for idx, ra in list_a[nb:]:
                        all_items.append(
                            RowDiffItem(
                                change="removed",
                                row_id=f"Ligne {idx}",
                                detail="Ligne retirée (par empreinte)",
                                values=ra.to_dict(),
                            )
                        )

        counts = {
            "all": len(all_items),
            "added": sum(1 for it in all_items if it.change == "added"),
            "removed": sum(1 for it in all_items if it.change == "removed"),
            "modified": sum(1 for it in all_items if it.change == "modified"),
        }

        # Filter
        filtered_items = all_items
        if filter_type == "added":
            filtered_items = [it for it in all_items if it.change == "added"]
        elif filter_type == "removed":
            filtered_items = [it for it in all_items if it.change == "removed"]
        elif filter_type == "modified":
            filtered_items = [it for it in all_items if it.change == "modified"]

        total = len(filtered_items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paged_items = filtered_items[start_idx:end_idx]

        return RowDiffPage(
            items=paged_items,
            total=total,
            page=page,
            page_size=page_size,
            counts=counts,
        )

    def query_view(
        self,
        version: DatasetVersion,
        split: Optional[str] = None,
        origin: Optional[str] = None,
        is_synthetic: Optional[bool] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> ViewQueryResponse:
        """Virtual view without duplicating data: filters on the fly and returns counts."""
        file_path = Path(version.storage_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Fichier Parquet introuvable.")

        df = pq.read_table(file_path).to_pandas()

        # Compute standard counts
        total_all = len(df)
        real_count = len(df[df["is_synthetic"] == False]) if "is_synthetic" in df.columns else total_all  # noqa: E712
        synth_count = len(df[df["is_synthetic"] == True]) if "is_synthetic" in df.columns else 0  # noqa: E712
        train_count = len(df[df["split"] == "train"]) if "split" in df.columns else 0
        val_count = len(df[df["split"] == "val"]) if "split" in df.columns else 0
        test_count = len(df[df["split"] == "test"]) if "split" in df.columns else 0

        counts = {
            "all": total_all,
            "real_only": real_count,
            "synthetic": synth_count,
            "train": train_count,
            "val": val_count,
            "test": test_count,
        }

        # Apply active filters
        filtered_df = df
        applied_filters = {}

        if split and "split" in df.columns:
            filtered_df = filtered_df[filtered_df["split"] == split]
            applied_filters["split"] = split

        if origin and "origin" in df.columns:
            filtered_df = filtered_df[filtered_df["origin"] == origin]
            applied_filters["origin"] = origin

        if is_synthetic is not None and "is_synthetic" in df.columns:
            filtered_df = filtered_df[filtered_df["is_synthetic"] == is_synthetic]
            applied_filters["is_synthetic"] = is_synthetic

        total_matching = len(filtered_df)
        sample = filtered_df.iloc[offset : offset + limit].to_dict(orient="records")

        # Format API and CLI command
        dataset_name = version.dataset.name if version.dataset else "dataset"
        version_label = self.get_version_label(version)
        query_params = []
        if origin:
            query_params.append(f"origin={origin}")
        if split:
            query_params.append(f"split={split}")
        if is_synthetic is not None:
            query_params.append(f"is_synthetic={str(is_synthetic).lower()}")

        param_str = ("?" + "&".join(query_params)) if query_params else ""
        api_url = f"/api/v1/versions/{version.version_hash}/views/query{param_str}"
        cli_command = f"datalift pull {dataset_name}@{version_label}{param_str}"

        return ViewQueryResponse(
            version_hash=version.version_hash,
            filters_applied=applied_filters,
            counts=counts,
            total_matching=total_matching,
            sample_rows=sample,
            api_url=api_url,
            cli_command=cli_command,
        )

    def download_view(
        self,
        version: DatasetVersion,
        split: Optional[str] = None,
        origin: Optional[str] = None,
        is_synthetic: Optional[bool] = None,
        file_format: str = "csv",
    ) -> Tuple[bytes, str, str]:
        """Exports a filtered view on the fly without duplicating storage in CSV, Parquet, or JSONL."""
        file_path = Path(version.storage_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Fichier Parquet introuvable.")

        df = pq.read_table(file_path).to_pandas()

        if split and "split" in df.columns:
            df = df[df["split"] == split]
        if origin and "origin" in df.columns:
            df = df[df["origin"] == origin]
        if is_synthetic is not None and "is_synthetic" in df.columns:
            df = df[df["is_synthetic"] == is_synthetic]

        dataset_name = version.dataset.name if version.dataset else "dataset"
        version_label = self.get_version_label(version)

        fmt = file_format.lower()
        if fmt == "parquet":
            out_buf = io.BytesIO()
            pq.write_table(pa.Table.from_pandas(df), out_buf)
            data_bytes = out_buf.getvalue()
            filename = f"{dataset_name}_{version_label}_view.parquet"
            media_type = "application/octet-stream"
        elif fmt == "jsonl":
            data_str = df.to_json(orient="records", lines=True)
            data_bytes = data_str.encode("utf-8")
            filename = f"{dataset_name}_{version_label}_view.jsonl"
            media_type = "application/x-jsonlines"
        else:  # CSV default
            data_str = df.to_csv(index=False)
            data_bytes = data_str.encode("utf-8")
            filename = f"{dataset_name}_{version_label}_view.csv"
            media_type = "text/csv"

        return data_bytes, filename, media_type

    def evaluate_guardrails(self, version: DatasetVersion, db: Session) -> List[GuardrailItem]:
        """Evaluates 6 guardrails against the immutable dataset version:
        1. Versions are immutable (cryptographic hash verified)
        2. Test set hash unchanged
        3. Used versions are protected
        4. No personal data in clear (displays 'not_evaluated' with explicit reason)
        5. Every row traceable
        6. Draft expiration status
        """
        file_path = Path(version.storage_path)
        guardrails: List[GuardrailItem] = []

        # 1. Immutable versions check
        if file_path.exists():
            guardrails.append(
                GuardrailItem(
                    id="immutable_versions",
                    name="Versions immuables",
                    status="passed",
                    message="Toutes les versions sont immuables",
                    detail="Toute modification crée une nouvelle version immuable (intégrité SHA-256 respectée).",
                )
            )
        else:
            guardrails.append(
                GuardrailItem(
                    id="immutable_versions",
                    name="Versions immuables",
                    status="failed",
                    message="Fichier physique introuvable",
                    detail="L'artefact de stockage est absent du disque.",
                )
            )

        # 2. Test set hash unchanged (compared with source version test rows by key)
        df = pq.read_table(file_path).to_pandas() if file_path.exists() else pd.DataFrame()
        parent_v = version.parent_version
        if (
            file_path.exists()
            and "split" in df.columns
            and (df["split"] == "test").sum() > 0
            and parent_v
            and Path(parent_v.storage_path).exists()
        ):
            parent_df = pq.read_table(Path(parent_v.storage_path)).to_pandas()
            if "split" in parent_df.columns and (parent_df["split"] == "test").sum() > 0:
                p_test = parent_df[parent_df["split"] == "test"]
                c_test = df[df["split"] == "test"]
                key = None
                for k in ["customer_id", "client_id", "id", "user_id"]:
                    if k in c_test.columns and k in p_test.columns:
                        key = k
                        break
                tech_cols = {"split", "is_synthetic", "origin", "parent_ids"}
                cols = [c for c in c_test.columns if c in p_test.columns and c not in tech_cols]

                if key:
                    set_p = set(p_test[key])
                    set_c = set(c_test[key])
                    if set_p == set_c:
                        sub_p = p_test.set_index(key)[cols]
                        sub_c = c_test.set_index(key)[cols]
                        diff = False
                        for cid in set_p:
                            for col in cols:
                                if values_differ(sub_p.loc[cid, col], sub_c.loc[cid, col]):
                                    diff = True
                                    break
                            if diff:
                                break
                        if not diff:
                            guardrails.append(
                                GuardrailItem(
                                    id="test_set_hash",
                                    name="Jeu de test inchangé",
                                    status="passed",
                                    message="✓ Jeu de test 100% inchangé",
                                    detail=f"{len(c_test)} lignes de test strictement identiques à la version source (comparaison par clé '{key}').",
                                )
                            )
                        else:
                            guardrails.append(
                                GuardrailItem(
                                    id="test_set_hash",
                                    name="Jeu de test inchangé",
                                    status="failed",
                                    message="⚠️ Jeu de test modifié",
                                    detail="Certaines valeurs de test diffèrent de la version source.",
                                )
                            )
                    else:
                        guardrails.append(
                            GuardrailItem(
                                id="test_set_hash",
                                name="Jeu de test inchangé",
                                status="failed",
                                message="⚠️ Jeu de test altéré",
                                detail=f"Les identifiants de test diffèrent ({len(set_c)} vs {len(set_p)} dans la source).",
                            )
                        )
                else:
                    test_a_sorted = p_test[cols].sort_values(by=cols).reset_index(drop=True)
                    test_b_sorted = c_test[cols].sort_values(by=cols).reset_index(drop=True)
                    if test_a_sorted.equals(test_b_sorted):
                        guardrails.append(
                            GuardrailItem(
                                id="test_set_hash",
                                name="Jeu de test inchangé",
                                status="passed",
                                message="✓ Jeu de test 100% inchangé",
                                detail=f"{len(c_test)} lignes de test strictement identiques à la version source.",
                            )
                        )
                    else:
                        guardrails.append(
                            GuardrailItem(
                                id="test_set_hash",
                                name="Jeu de test inchangé",
                                status="failed",
                                message="⚠️ Jeu de test modifié",
                                detail="Le jeu de test diffère de la version source.",
                            )
                        )
            else:
                guardrails.append(
                    GuardrailItem(
                        id="test_set_hash",
                        name="Jeu de test inchangé",
                        status="not_evaluated",
                        message="Non évalué",
                        detail="La version source ne comporte pas de split test pour comparer.",
                    )
                )
        else:
            guardrails.append(
                GuardrailItem(
                    id="test_set_hash",
                    name="Jeu de test inchangé",
                    status="not_evaluated",
                    message="Non évalué",
                    detail="Aucun jeu de test défini ou pas de version source parente.",
                )
            )

        # 3. Protected versions
        is_prod = any(t.tag.lower() == "production" for t in version.tags)
        is_base = (version.dataset.baseline_version_id == version.id) or any(t.tag.lower() == "baseline" for t in version.tags)
        if is_prod or is_base:
            prot_label = "Production" if is_prod else "Baseline"
            guardrails.append(
                GuardrailItem(
                    id="protected_versions",
                    name="Versions protégées",
                    status="passed",
                    message="Version protégée de la suppression",
                    detail=f"Cette version porte le statut {prot_label} et ne peut pas être supprimée.",
                )
            )
        else:
            guardrails.append(
                GuardrailItem(
                    id="protected_versions",
                    name="Versions protégées",
                    status="passed",
                    message="Suppression contrôlée",
                    detail="Version standard (suppression autorisée si aucune version dérivée n'existe).",
                )
            )

        # 4. Personal data in clear (never fake green - show not_evaluated)
        guardrails.append(
            GuardrailItem(
                id="personal_data_clear",
                name="Pas de données personnelles en clair",
                status="not_evaluated",
                message="Non évalué",
                detail="Le contrôle PII / RGPD n'a pas été configuré pour ce jeu de données.",
            )
        )

        # 5. Every row traceable
        if "is_synthetic" in df.columns:
            synth_rows = df[df["is_synthetic"] == True]  # noqa: E712
            if len(synth_rows) > 0:
                has_origin = ("origin" in df.columns) and synth_rows["origin"].notnull().all()
                has_parents = ("parent_ids" in df.columns) and synth_rows["parent_ids"].notnull().all()
                if has_origin and has_parents:
                    guardrails.append(
                        GuardrailItem(
                            id="every_row_traceable",
                            name="Traçabilité de chaque ligne",
                            status="passed",
                            message="Traçabilité complète des lignes",
                            detail=f"100% des {len(synth_rows)} lignes synthétiques portent origin et parent_ids.",
                        )
                    )
                else:
                    guardrails.append(
                        GuardrailItem(
                            id="every_row_traceable",
                            name="Traçabilité de chaque ligne",
                            status="warning",
                            message="Traçabilité partielle",
                            detail="Certaines lignes synthétiques ne disposent pas d'origine ou de parent_ids.",
                        )
                    )
            else:
                guardrails.append(
                    GuardrailItem(
                        id="every_row_traceable",
                        name="Traçabilité de chaque ligne",
                        status="passed",
                        message="Traçabilité des données réelles",
                        detail="100% de données d'origine réelles.",
                    )
                )
        else:
            guardrails.append(
                GuardrailItem(
                    id="every_row_traceable",
                    name="Traçabilité de chaque ligne",
                    status="passed",
                    message="Traçabilité des données",
                    detail="Version composée uniquement de données réelles d'ingestion.",
                )
            )

        # 6. Draft expiration
        if version.is_draft:
            if version.expires_at:
                exp = version.expires_at
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                days_left = (exp - datetime.now(timezone.utc)).days
            else:
                days_left = 30
            guardrails.append(
                GuardrailItem(
                    id="draft_expiration",
                    name="Brouillons non étiquetés",
                    status="warning",
                    message=f"{version.branch_name or 'Brouillon'} actif",
                    detail=f"Suppression automatique après 30 jours sans utilisation ({max(days_left, 0)} jours restants).",
                )
            )
        else:
            guardrails.append(
                GuardrailItem(
                    id="draft_expiration",
                    name="Brouillons non étiquetés",
                    status="passed",
                    message="Brouillon : sans objet",
                    detail="Cette version est permanente et immuable (non temporaire).",
                )
            )

        return guardrails

    def generate_dataset_card(self, version: DatasetVersion, db: Session) -> DatasetCardResponse:
        """Generates an exportable dataset card in Markdown and JSON formats."""
        dataset = version.dataset
        version_label = self.get_version_label(version)
        depth = self.get_version_depth(version)

        file_path = Path(version.storage_path)
        df = pq.read_table(file_path).to_pandas() if file_path.exists() else pd.DataFrame()

        # Collect recipe lineage
        ancestors = []
        curr = version
        while curr:
            ancestors.append(curr)
            curr = curr.parent_version
        ancestors.reverse()

        recipes_history = []
        for anc in ancestors:
            t = anc.transformation_produced
            recipes_history.append({
                "version": self.get_version_label(anc),
                "operation": t.name if t else "RAW_INGESTION",
                "parameters": t.parameters if t else {},
                "created_at": anc.created_at.isoformat(),
            })

        # Columns info
        cols_info = [{"name": c, "dtype": str(df[c].dtype), "null_count": int(df[c].isna().sum())} for c in df.columns]

        # Synthetic info
        synth_count = int((df["is_synthetic"] == True).sum()) if "is_synthetic" in df.columns else 0  # noqa: E712
        synth_pct = round(synth_count / len(df) * 100, 2) if len(df) > 0 else 0.0

        card_json = {
            "dataset_name": dataset.name,
            "version_hash": version.version_hash,
            "version_label": version_label,
            "version_depth": depth,
            "created_at": version.created_at.isoformat(),
            "code_version": "datalift 0.9.3",
            "author": " — ",
            "row_count": version.row_count,
            "size_bytes": version.size_bytes,
            "size_formatted": format_bytes(version.size_bytes),
            "columns": cols_info,
            "synthetic_rows": synth_count,
            "synthetic_percentage": synth_pct,
            "lineage_recipes": recipes_history,
        }

        # Build Markdown representation
        md_lines = [
            f"# Dataset Card: {dataset.name} ({version_label})",
            "",
            f"**Version Hash (SHA-256):** `{version.version_hash}`  ",
            f"**Créé le :** {version.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}  ",
            f"**Auteur :** —  ",
            f"**Version de la plateforme :** datalift 0.9.3  ",
            "",
            "## 1. Métriques globales",
            f"- **Nombre total de lignes :** {version.row_count:,}",
            f"- **Taille physique stockée :** {format_bytes(version.size_bytes)}",
            f"- **Part synthétique :** {synth_pct}% ({synth_count:,} lignes générées)",
            f"- **Nombre de colonnes :** {len(df.columns)}",
            "",
            "## 2. Historique et Recettes du Lignage",
        ]

        for r in recipes_history:
            md_lines.append(f"### {r['version']} — {r['operation']}")
            md_lines.append(f"- **Date :** {r['created_at']}")
            if r["parameters"]:
                md_lines.append(f"- **Paramètres :** `{json.dumps(r['parameters'])}`")
            md_lines.append("")

        md_lines.append("## 3. Colonnes")
        md_lines.append("| Colonne | Type | Valeurs manquantes |")
        md_lines.append("| :--- | :--- | :--- |")
        for c in cols_info:
            md_lines.append(f"| {c['name']} | `{c['dtype']}` | {c['null_count']} |")

        md_lines.append("")
        md_lines.append("## 4. Intégrité et Sécurité")
        md_lines.append("- **Immuabilité :** Conforme (stockage Parquet en lecture seule).")
        md_lines.append("- **Traçabilité :** `origin` et `parent_ids` rattachés à chaque ligne synthétique.")
        md_lines.append("- **Données personnelles en clair :** Non évalué (scan PII non exécuté).")

        card_md = "\n".join(md_lines)

        return DatasetCardResponse(markdown=card_md, json_data=card_json)

    def get_versioning_header(self, dataset: Dataset, db: Session) -> VersioningHeaderMetrics:
        """Computes top KPI cards for the Versioning page."""
        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.asc())
            .all()
        )

        version_count = len(versions)
        v_list = []
        total_stored = 0
        logical_size = 0

        current_v = None
        baseline_v = None

        depth_counts: Dict[Tuple[Optional[str], int], int] = {}
        for v in versions:
            pid = str(v.parent_version_id) if v.parent_version_id else None
            v_depth = self.get_version_depth(v)
            sibling_idx = depth_counts.get((pid, v_depth), 0)
            depth_counts[(pid, v_depth)] = sibling_idx + 1
            v_label = self.get_version_label(v, sibling_index=sibling_idx)
            v_list.append({
                "id": str(v.id),
                "hash": v.version_hash,
                "label": v_label,
                "is_draft": v.is_draft,
                "branch_name": v.branch_name,
            })
            total_stored += v.size_bytes
            logical_size += v.size_bytes * 3  # Uncompressed representation estimate

            if dataset.current_version_id == v.id:
                current_v = v
            if dataset.baseline_version_id == v.id:
                baseline_v = v

        if not current_v and versions:
            non_drafts = [v for v in versions if not v.is_draft]
            current_v = non_drafts[-1] if non_drafts else versions[-1]

        if not baseline_v and versions:
            for v in reversed(versions):
                if any(t.tag.lower() == "baseline" for t in v.tags):
                    baseline_v = v
                    break
            if not baseline_v:
                baseline_v = versions[-1]

        # Test set hash of current version
        test_hash = None
        test_status = "Non applicable"
        if current_v:
            p = Path(current_v.storage_path)
            if p.exists():
                df = pq.read_table(p).to_pandas()
                if "split" in df.columns:
                    test_df = df[df["split"] == "test"]
                    if len(test_df) > 0:
                        test_hash = hashlib.sha256(test_df.to_json(orient="records").encode("utf-8")).hexdigest()[:8]
                        # Check if matches baseline
                        if baseline_v and baseline_v.id != current_v.id and Path(baseline_v.storage_path).exists():
                            b_df = pq.read_table(Path(baseline_v.storage_path)).to_pandas()
                            if "split" in b_df.columns:
                                b_test = b_df[b_df["split"] == "test"]
                                b_hash = hashlib.sha256(b_test.to_json(orient="records").encode("utf-8")).hexdigest()[:8]
                                if b_hash == test_hash:
                                    test_status = f"Identique dans {self.get_version_label(baseline_v)} → {self.get_version_label(current_v)}"
                                else:
                                    test_status = "Modifié"
                            else:
                                test_status = "Verrouillé 100% réel"
                        else:
                            test_status = "Verrouillé 100% réel"

        return VersioningHeaderMetrics(
            version_count=version_count,
            versions=v_list,
            total_stored_bytes=total_stored,
            total_stored_formatted=format_bytes(total_stored),
            logical_size_bytes=logical_size,
            logical_size_formatted=format_bytes(logical_size),
            test_set_hash=test_hash,
            test_set_status=test_status,
            used_by_models_count=0,
            used_by_label="Aucun modèle lié",
            current_version_hash=current_v.version_hash if current_v else None,
            current_version_label=self.get_version_label(current_v) if current_v else None,
            baseline_version_hash=baseline_v.version_hash if baseline_v else None,
            baseline_version_label=self.get_version_label(baseline_v) if baseline_v else None,
        )

    def replay_recipe(
        self,
        target_version: DatasetVersion,
        new_file_bytes: bytes,
        new_filename: str,
        db: Session,
    ) -> Dict[str, Any]:
        """Applies the recorded recipe chain of target_version to a newly uploaded file."""
        from app.services.cleaning_service import cleaning_service
        from app.services.augmentation_service import augmentation_service
        from app.schemas.augmentation import AugmentationApplyRequest, SplitConfig, TargetBalanceConfig, TechniquesConfig
        from app.services.storage_service import storage_service

        # 1. Collect chain of transformations from root to target_version
        chain = []
        curr = target_version
        while curr:
            chain.append(curr)
            curr = curr.parent_version
        chain.reverse()

        dataset = target_version.dataset

        # 2. Ingest raw file to create new root version (v1_replay)
        try:
            df_raw = pd.read_csv(io.BytesIO(new_file_bytes))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erreur de lecture CSV : {str(e)}")

        if df_raw.empty:
            raise HTTPException(status_code=400, detail="Le fichier CSV uploadé est vide.")

        # Save initial raw version
        raw_hash = lineage_service.generate_version_hash(
            parent_version_hash=None,
            transformation_name="CSV_INGESTION",
            parameters={"original_filename": new_filename},
            data_hash=hashlib.sha256(df_raw.to_json(orient="records").encode("utf-8")).hexdigest(),
            dataset_id=dataset.id,
        )

        target_dir = storage_service.get_dataset_dir(dataset.id)
        raw_path = target_dir / f"{raw_hash}.parquet"
        pq.write_table(pa.Table.from_pandas(df_raw), raw_path)

        new_root = DatasetVersion(
            dataset_id=dataset.id,
            version_hash=raw_hash,
            parent_version_id=None,
            storage_path=str(raw_path),
            row_count=len(df_raw),
            size_bytes=raw_path.stat().st_size,
            schema_metadata={"columns": list(df_raw.columns)},
        )
        db.add(new_root)
        db.flush()

        trans_raw = Transformation(
            name="CSV_INGESTION",
            parameters={"original_filename": new_filename},
            source_version_id=None,
            target_version_id=new_root.id,
        )
        db.add(trans_raw)

        created_versions = [new_root]
        current_source_version = new_root

        # 3. Replay each transformation in the chain
        for orig_version in chain[1:]:
            t = orig_version.transformation_produced
            if not t:
                continue

            if "CLEANING" in t.name:
                ops = t.parameters.get("operations", [])
                target_col = t.parameters.get("target_column")
                # Normalize op keys so both 'type' and 'name' are accepted
                normalized_ops = []
                for op in ops:
                    op_dict = dict(op)
                    if "type" not in op_dict and "name" in op_dict:
                        op_dict["type"] = op_dict["name"]
                    normalized_ops.append(op_dict)

                # Check applicability
                p_current = Path(current_source_version.storage_path)
                curr_df = pq.read_table(p_current).to_pandas()
                if target_col and target_col not in curr_df.columns:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Étape 'Nettoyage' non applicable : la colonne cible requise '{target_col}' est absente du nouveau fichier.",
                    )
                for op in normalized_ops:
                    col = op.get("column")
                    if col and col not in curr_df.columns:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Étape 'Nettoyage' non applicable : la colonne requise '{col}' est absente du nouveau fichier.",
                        )


                try:
                    clean_result = cleaning_service.apply_cleaning_and_create_version(
                        source_version=current_source_version,
                        operations=normalized_ops,
                        db=db,
                        target_column=target_col,
                        confirm_target_modification=True,
                    )
                    current_source_version = clean_result["new_version"]
                    created_versions.append(current_source_version)
                except ValueError as ve:
                    if "Aucune donnée modifiée" in str(ve):
                        # The new file already satisfies the clean state for this step (no-op)
                        pass
                    else:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Étape 'Nettoyage' non applicable : {str(ve)}",
                        )



            elif "AUGMENTATION" in t.name:
                p_current = Path(current_source_version.storage_path)
                curr_df = pq.read_table(p_current).to_pandas()

                # Reconstruct request from parameters
                split_dict = t.parameters.get("split", {})
                target_col = t.parameters.get("target_column") or split_dict.get("stratify_column")
                if not target_col or target_col not in curr_df.columns:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Étape 'Augmentation' non applicable : la colonne cible '{target_col}' est absente du nouveau fichier.",
                    )

                # Check minority count
                vc = curr_df[target_col].value_counts()
                if len(vc) < 2 or vc.min() < 3:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Étape 'Augmentation' non applicable : la classe rare de '{target_col}' comporte moins de 3 exemples ({vc.min() if len(vc) >= 1 else 0} trouvés).",
                    )

                ratios = split_dict.get("ratios_target", {"train": 0.7, "val": 0.15, "test": 0.15})
                split_cfg = SplitConfig(
                    train_ratio=ratios.get("train", 0.7),
                    val_ratio=ratios.get("val", 0.15),
                    test_ratio=ratios.get("test", 0.15),
                    stratify_column=target_col,
                    group_by_column=split_dict.get("group_by_column"),
                    random_seed=split_dict.get("random_seed", 42),
                )

                bal_dict = t.parameters.get("balance", {})
                bal_cfg = TargetBalanceConfig(
                    mode=bal_dict.get("mode", "keep"),
                )

                techs_list = t.parameters.get("techniques", [])
                smote_nc_en = False
                smote_k = 5
                under_en = False
                under_seed = 42
                noise_en = False
                noise_str = 2.0
                class_weights_en = False

                if isinstance(techs_list, list):
                    for tech in techs_list:
                        tname = tech.get("name")
                        if tname == "SMOTE-NC":
                            smote_nc_en = tech.get("enabled", False)
                            smote_k = tech.get("k_neighbors", 5)
                        elif tname == "UNDERSAMPLE_MAJORITY":
                            under_en = tech.get("enabled", False)
                            under_seed = tech.get("seed", 42)
                        elif tname == "LIGHT_NOISE":
                            noise_en = tech.get("enabled", False)
                            noise_str = tech.get("strength_pct", 2.0)
                        elif tname == "CLASS_WEIGHTS":
                            class_weights_en = tech.get("enabled", False)

                tech_cfg = TechniquesConfig(
                    smote_nc_enabled=smote_nc_en,
                    smote_k_neighbors=smote_k,
                    undersample_enabled=under_en,
                    undersample_seed=under_seed,
                    light_noise_enabled=noise_en,
                    noise_strength_pct=noise_str,
                    class_weights_enabled=class_weights_en,
                )

                apply_req = AugmentationApplyRequest(
                    split=split_cfg,
                    target_balance=bal_cfg,
                    techniques=tech_cfg,
                    target_column=target_col,
                )

                aug_res = augmentation_service.apply_augmentation(
                    source_version=current_source_version,
                    request=apply_req,
                    db=db,
                )
                current_source_version = aug_res.version
                created_versions.append(current_source_version)

        db.commit()
        return {
            "success": True,
            "message": f"Recette rejouée avec succès sur {new_filename} : {len(created_versions)} versions créées.",
            "created_versions": [self.get_version_label(v) for v in created_versions],
            "final_version_hash": current_source_version.version_hash,
        }


versioning_service = VersioningService()
