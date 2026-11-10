import hashlib
import io
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple
import unicodedata

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy.orm import Session

from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.services.lineage_service import lineage_service
from app.services.parquet_service import parquet_service
from app.services.profiling_service import profiling_service
from app.services.storage_service import storage_service


class CleaningService:
    # Fixed documented execution order
    PRIORITY_MAP = {
        "TEXT_NORMALIZE": 1,
        "CATEGORIES_NORMALIZE": 1,
        "CATEGORY_MERGE": 2,
        "CATEGORIES_MERGE": 2,
        "HANDLE_MISSING": 3,
        "HANDLE_OUTLIERS": 4,
        "DROP_DUPLICATES": 5,
    }

    @staticmethod
    def calculate_logical_data_hash(df: pd.DataFrame) -> str:
        """Computes a deterministic cryptographic SHA-256 hash of the logical data
        (column names, ordering, cell values) independent of parquet storage/compression bytes.
        """
        hasher = hashlib.sha256()
        # Header: column names in fixed order
        hasher.update(",".join(df.columns).encode("utf-8"))
        hasher.update(b"\n")
        # Canonical CSV content (fixed LF, float precision, no index)
        csv_bytes = df.to_csv(index=False, lineterminator="\n", float_format="%.10g").encode("utf-8")
        hasher.update(csv_bytes)
        return hasher.hexdigest()

    @staticmethod
    def normalize_text_value(val: Any, lowercase: bool = True, strip: bool = True, remove_accents: bool = True) -> Any:
        """Applies string normalization to a single cell value."""
        if pd.isna(val) or val is None:
            return val
        s = str(val)
        if strip:
            s = s.strip()
        if lowercase:
            s = s.lower()
        if remove_accents:
            s = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("utf-8")
        return s

    def detect_uncertain_category_mappings(self, df: pd.DataFrame, col: str) -> List[Dict[str, Any]]:
        """Detects uncertain mappings such as abbreviations or prefix matches
        (e.g. 'casa' for 'Casablanca') with their exact row counts.
        These are NEVER applied automatically and require explicit user validation.
        """
        if col not in df.columns:
            return []

        series = df[col].dropna().astype(str)
        series = series[series.str.strip() != ""]
        if len(series) == 0:
            return []

        val_counts = series.value_counts().to_dict()
        # Find dominant canonical names (clean, stripped, with significant representation)
        raw_canonical = {}
        for val, count in val_counts.items():
            clean = val.strip()
            if len(clean) >= 5 and count >= 5:
                # Keep the cleanly capitalized variant with highest count
                if clean not in raw_canonical or count > raw_canonical[clean][1]:
                    raw_canonical[clean] = (val, count)

        canonical_candidates = list(raw_canonical.keys())

        uncertain_mappings = []
        seen_from = set()
        for val, count in val_counts.items():
            clean_v = val.strip()
            norm_v = self.normalize_text_value(clean_v)
            if len(norm_v) < 3 or clean_v in seen_from:
                continue

            for candidate in canonical_candidates:
                clean_c = candidate.strip()
                norm_c = self.normalize_text_value(clean_c)
                if norm_c == norm_v:
                    continue

                # Strict prefix match where candidate is notably longer (e.g. 'casa' -> 'Casablanca')
                if norm_c.startswith(norm_v) and len(norm_c) >= len(norm_v) + 3:
                    seen_from.add(clean_v)
                    uncertain_mappings.append({
                        "column": col,
                        "from": val,
                        "to": clean_c,
                        "rows": int(count),
                        "reason": f"Abréviation ou préfixe probable de '{clean_c}'",
                        "is_uncertain": True,
                        "applied_by_default": False,
                    })
                    break
        return uncertain_mappings

    def sort_operations(self, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sorts operations into the fixed documented pipeline sequence:
        1. normalisation des textes
        2. fusion manuelle
        3. valeurs manquantes
        4. outliers
        5. doublons en dernier
        """
        return sorted(
            operations,
            key=lambda op: self.PRIORITY_MAP.get(op.get("type", "").upper(), 99),
        )

    def execute_cleaning_pipeline(
        self,
        df: pd.DataFrame,
        operations: List[Dict[str, Any]],
        target_column: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Core unified execution engine used by both /preview and /apply.
        Executes operations in deterministic order, records exact computed values,
        and computes before/after metrics.
        """
        working_df = df.copy()
        initial_row_count = len(working_df)
        sorted_ops = self.sort_operations(operations)

        executed_ops: List[Dict[str, Any]] = []
        columns_affected_set = set()
        total_rows_affected = 0
        total_cells_changed = 0
        target_affected = False
        target_warning = None
        step_diffs: Dict[str, List[Dict[str, Any]]] = {
            "duplicates": [],
            "missing": [],
            "categories": [],
            "outliers": [],
        }

        # Record target column initial distribution for protection check
        initial_target_dist = None
        if target_column and target_column in working_df.columns:
            initial_target_dist = working_df[target_column].value_counts(dropna=False).to_dict()

        for op in sorted_ops:
            op_type = op.get("type", "").upper()
            col = op.get("column")
            params = op.get("parameters", {}) or {}

            # Check if this operation explicitly targets the target column
            if target_column and col == target_column:
                target_affected = True

            # ----------------------------------------------------
            # 1. TEXT_NORMALIZE
            # ----------------------------------------------------
            if op_type in ["TEXT_NORMALIZE", "CATEGORIES_NORMALIZE"]:
                if not col or col not in working_df.columns:
                    raise ValueError(f"Colonne '{col}' inexistante dans le jeu de données.")

                lowercase = bool(params.get("lowercase", True))
                strip = bool(params.get("strip", True))
                remove_accents = bool(params.get("remove_accents", True))

                old_col = working_df[col].copy()
                # Apply normalization cell-by-cell on non-nulls
                new_col = working_df[col].apply(
                    lambda v: self.normalize_text_value(v, lowercase, strip, remove_accents)
                )

                # Count rows where string representation changed
                changed_mask = old_col.astype(str) != new_col.astype(str)
                # Exclude rows that were already NaN before and after
                changed_mask = changed_mask & ~(old_col.isna() & new_col.isna())
                cells_modified = int(changed_mask.sum())

                working_df[col] = new_col
                if cells_modified > 0:
                    columns_affected_set.add(col)
                total_rows_affected += cells_modified
                total_cells_changed += cells_modified

                if cells_modified > 0:
                    diff_pairs = pd.DataFrame({"before": old_col[changed_mask], "after": new_col[changed_mask]})
                    for (b_val, a_val), cnt in diff_pairs.value_counts().items():
                        step_diffs["categories"].append({
                            "column": col,
                            "before": str(b_val),
                            "after": str(a_val),
                            "rows": int(cnt),
                        })

                executed_ops.append({
                    "type": "TEXT_NORMALIZE",
                    "column": col,
                    "parameters": {
                        "lowercase": lowercase,
                        "strip": strip,
                        "remove_accents": remove_accents,
                        "cells_modified": cells_modified,
                        "rows_affected": cells_modified,
                    },
                    "rows_affected": cells_modified,
                })

            # ----------------------------------------------------
            # 2. CATEGORY_MERGE
            # ----------------------------------------------------
            elif op_type in ["CATEGORY_MERGE", "CATEGORIES_MERGE"]:
                if not col or col not in working_df.columns:
                    raise ValueError(f"Colonne '{col}' inexistante dans le jeu de données.")

                mapping = params.get("mapping", {}) or {}
                if not isinstance(mapping, dict):
                    raise ValueError("Le paramètre 'mapping' doit être un dictionnaire de type {valeur_source: valeur_cible}.")

                # Capture categories as they exist at the moment of fusion (post-normalization if text normalize ran)
                categories_before_merge = sorted([str(x) for x in working_df[col].dropna().unique()])

                # Prepare mapping with normalized key fallbacks so keys match regardless of casing/spacing
                effective_mapping = {}
                for k, v in mapping.items():
                    effective_mapping[str(k)] = str(v)
                    norm_k = self.normalize_text_value(k)
                    if norm_k != str(k):
                        effective_mapping[norm_k] = str(v)

                old_col = working_df[col].copy()
                working_df[col] = working_df[col].replace(effective_mapping)
                categories_after_merge = sorted([str(x) for x in working_df[col].dropna().unique()])

                cells_modified = int((old_col.astype(str) != working_df[col].astype(str)).sum())

                if cells_modified > 0:
                    columns_affected_set.add(col)
                total_rows_affected += cells_modified
                total_cells_changed += cells_modified

                if cells_modified > 0:
                    changed_m = old_col.astype(str) != working_df[col].astype(str)
                    diff_pairs = pd.DataFrame({"before": old_col[changed_m], "after": working_df[col][changed_m]})
                    for (b_val, a_val), cnt in diff_pairs.value_counts().items():
                        step_diffs["categories"].append({
                            "column": col,
                            "before": str(b_val),
                            "after": str(a_val),
                            "rows": int(cnt),
                        })

                executed_ops.append({
                    "type": "CATEGORY_MERGE",
                    "column": col,
                    "parameters": {
                        "mapping": mapping,
                        "categories_before": categories_before_merge,
                        "categories_after": categories_after_merge,
                        "cells_modified": cells_modified,
                        "rows_affected": cells_modified,
                    },
                    "rows_affected": cells_modified,
                })

            # ----------------------------------------------------
            # 3. HANDLE_MISSING
            # ----------------------------------------------------
            elif op_type == "HANDLE_MISSING":
                if not col or col not in working_df.columns:
                    raise ValueError(f"Colonne '{col}' inexistante dans le jeu de données.")

                strategy = params.get("strategy", "drop").lower()
                fill_value = params.get("fill_value")

                # Validation: mean & median strictly forbidden on non-numeric columns
                is_numeric = pd.api.types.is_numeric_dtype(working_df[col])
                if strategy in ["mean", "median"] and not is_numeric:
                    raise ValueError(
                        f"L'imputation par '{strategy}' est strictement réservée aux colonnes numériques. "
                        f"La colonne '{col}' n'est pas numérique."
                    )

                # Identify missing values: NaN or empty/whitespace strings
                is_missing = working_df[col].isnull()
                if working_df[col].dtype == "object" or pd.api.types.is_string_dtype(working_df[col]):
                    is_missing = is_missing | (working_df[col].astype(str).str.strip() == "")

                missing_count = int(is_missing.sum())
                computed_val = None

                if missing_count > 0:
                    columns_affected_set.add(col)

                if strategy == "drop":
                    working_df = working_df[~is_missing].reset_index(drop=True)
                    rows_affected = missing_count
                elif strategy == "mean":
                    clean_series = working_df.loc[~is_missing, col].astype(float)
                    computed_val = round(float(clean_series.mean()), 4) if len(clean_series) > 0 else 0.0
                    working_df.loc[is_missing, col] = computed_val
                    rows_affected = missing_count
                elif strategy == "median":
                    clean_series = working_df.loc[~is_missing, col].astype(float)
                    computed_val = round(float(clean_series.median()), 4) if len(clean_series) > 0 else 0.0
                    working_df.loc[is_missing, col] = computed_val
                    rows_affected = missing_count
                elif strategy == "mode":
                    clean_series = working_df.loc[~is_missing, col]
                    modes = clean_series.mode()
                    computed_val = modes.iloc[0] if len(modes) > 0 else ""
                    working_df.loc[is_missing, col] = computed_val
                    rows_affected = missing_count
                elif strategy == "constant":
                    computed_val = fill_value if fill_value is not None else ""
                    # Convert fill_value to numeric if series is numeric
                    if is_numeric and computed_val != "":
                        try:
                            computed_val = float(computed_val) if "." in str(computed_val) else int(computed_val)
                        except Exception:
                            pass
                    working_df.loc[is_missing, col] = computed_val
                    rows_affected = missing_count
                else:
                    raise ValueError(f"Stratégie de valeurs manquantes non reconnue: '{strategy}'.")

                total_rows_affected += rows_affected
                total_cells_changed += (rows_affected * (len(working_df.columns) if strategy == "drop" else 1))

                if missing_count > 0:
                    after_desc = "— (supprimé)" if strategy == "drop" else str(computed_val)
                    step_diffs["missing"].append({
                        "column": col,
                        "before": "null / vide",
                        "after": after_desc,
                        "rows": missing_count,
                    })

                executed_ops.append({
                    "type": "HANDLE_MISSING",
                    "column": col,
                    "parameters": {
                        "strategy": strategy,
                        "fill_value": fill_value,
                        "computed_value": computed_val,
                        "missing_detected": missing_count,
                        "rows_affected": rows_affected,
                    },
                    "rows_affected": rows_affected,
                })

            # ----------------------------------------------------
            # 4. HANDLE_OUTLIERS (IQR)
            # ----------------------------------------------------
            elif op_type == "HANDLE_OUTLIERS":
                if not col or col not in working_df.columns:
                    raise ValueError(f"Colonne '{col}' inexistante dans le jeu de données.")

                if not pd.api.types.is_numeric_dtype(working_df[col]):
                    raise ValueError(
                        f"Le traitement des outliers IQR requiert une colonne numérique. "
                        f"La colonne '{col}' n'est pas numérique."
                    )

                strategy = params.get("strategy", "clip").lower()
                clean_s = working_df[col].dropna()

                if len(clean_s) > 0:
                    q1 = float(clean_s.quantile(0.25))
                    q3 = float(clean_s.quantile(0.75))
                    iqr = float(q3 - q1)
                    lower_bound = float(q1 - 1.5 * iqr)
                    upper_bound = float(q3 + 1.5 * iqr)
                    outlier_mask = (working_df[col] < lower_bound) | (working_df[col] > upper_bound)
                    outliers_count = int(outlier_mask.sum())
                else:
                    q1, q3, iqr, lower_bound, upper_bound = 0.0, 0.0, 0.0, 0.0, 0.0
                    outlier_mask = pd.Series(False, index=working_df.index)
                    outliers_count = 0

                computed_bounds = {
                    "q1": round(q1, 4),
                    "q3": round(q3, 4),
                    "iqr": round(iqr, 4),
                    "lower_bound": round(lower_bound, 4),
                    "upper_bound": round(upper_bound, 4),
                }

                if strategy == "drop":
                    working_df = working_df[~outlier_mask].reset_index(drop=True)
                    rows_affected = outliers_count
                elif strategy == "clip":
                    working_df[col] = working_df[col].clip(lower=lower_bound, upper=upper_bound)
                    rows_affected = outliers_count
                elif strategy == "keep":
                    rows_affected = 0
                else:
                    raise ValueError(f"Stratégie outliers non reconnue: '{strategy}'.")

                if rows_affected > 0:
                    columns_affected_set.add(col)
                total_rows_affected += rows_affected
                total_cells_changed += (rows_affected * (len(working_df.columns) if strategy == "drop" else 1))

                if outliers_count > 0:
                    if strategy == "clip":
                        step_diffs["outliers"].append({
                            "column": col,
                            "before": f"valeurs < {lower_bound:.2f} ou > {upper_bound:.2f}",
                            "after": f"borné à [{lower_bound:.2f} ; {upper_bound:.2f}]",
                            "rows": outliers_count,
                        })
                    elif strategy == "drop":
                        step_diffs["outliers"].append({
                            "column": col,
                            "before": f"{outliers_count} outliers IQR",
                            "after": "— (supprimé)",
                            "rows": outliers_count,
                        })

                executed_ops.append({
                    "type": "HANDLE_OUTLIERS",
                    "column": col,
                    "parameters": {
                        "strategy": strategy,
                        "computed_bounds": computed_bounds,
                        "outliers_detected": outliers_count,
                        "rows_affected": rows_affected,
                    },
                    "rows_affected": rows_affected,
                })

            # ----------------------------------------------------
            # 5. DROP_DUPLICATES (Last position)
            # ----------------------------------------------------
            elif op_type == "DROP_DUPLICATES":
                keep = params.get("keep", "first")
                if keep not in ["first", "last"]:
                    keep = "first"

                # A duplicate is defined as identical across ALL columns
                dup_mask = working_df.duplicated(keep=keep)
                duplicates_count = int(dup_mask.sum())

                working_df = working_df[~dup_mask].reset_index(drop=True)
                total_rows_affected += duplicates_count
                total_cells_changed += (duplicates_count * len(working_df.columns))

                if duplicates_count > 0:
                    columns_affected_set.update(list(working_df.columns))
                    step_diffs["duplicates"].append({
                        "column": "Toutes",
                        "before": f"{duplicates_count} lignes en doublon",
                        "after": f"Occurrence '{keep}' conservée",
                        "rows": duplicates_count,
                    })

                executed_ops.append({
                    "type": "DROP_DUPLICATES",
                    "column": None,
                    "parameters": {
                        "keep": keep,
                        "columns": "all",
                        "rows_dropped": duplicates_count,
                        "rows_affected": duplicates_count,
                    },
                    "rows_affected": duplicates_count,
                })

            else:
                raise ValueError(f"Type d'opération non supporté: '{op_type}'.")

        # Check target column protection after all operations
        if target_column and target_column in working_df.columns:
            final_target_dist = working_df[target_column].value_counts(dropna=False).to_dict()
            if initial_target_dist and final_target_dist != initial_target_dist:
                target_affected = True
                target_warning = (
                    f"Attention : la colonne cible '{target_column}' est modifiée par ce nettoyage "
                    f"(changement de distribution des classes ou suppression de lignes)."
                )

        final_row_count = len(working_df)
        is_noop = (total_rows_affected == 0) and (final_row_count == initial_row_count)

        # Build clean JSON-safe samples
        sample_before = df.head(10).replace({np.nan: None}).to_dict(orient="records")
        sample_after = working_df.head(10).replace({np.nan: None}).to_dict(orient="records")

        return {
            "df_cleaned": working_df,
            "rows_before": initial_row_count,
            "rows_after": final_row_count,
            "rows_affected": total_rows_affected,
            "total_cells_changed": total_cells_changed,
            "is_noop": is_noop,
            "target_affected": target_affected,
            "target_warning": target_warning,
            "columns_affected": sorted(list(columns_affected_set)),
            "operations_executed": executed_ops,
            "sample_before": sample_before,
            "sample_after": sample_after,
            "step_diffs": step_diffs,
        }

    def preview_cleaning(
        self,
        parquet_path: Path,
        operations: List[Dict[str, Any]],
        target_column: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Simulates the cleaning operations on the dataset without modifying files or database."""
        if not parquet_path.exists():
            raise FileNotFoundError(f"Fichier Parquet introuvable: {parquet_path}")

        table = pq.read_table(parquet_path)
        df = table.to_pandas()

        result = self.execute_cleaning_pipeline(df, operations, target_column)
        working_df = result["df_cleaned"]

        # Calculate predicted health score & subscores on the cleaned DataFrame
        pred_profile = profiling_service.profile_dataframe(working_df, target_column=target_column)

        total_table_cells = max(result["rows_before"] * len(df.columns), 1)
        cells_changed = result["total_cells_changed"]
        cells_changed_pct = round((cells_changed / total_table_cells) * 100, 1)

        # Detect real uncertain mappings on categorical columns (e.g. 'casa' for 'Casablanca')
        # These are never applied automatically
        uncertain_mappings = []
        for col_name in df.columns:
            if df[col_name].dtype == "object" or pd.api.types.is_string_dtype(df[col_name]):
                col_uncertain = self.detect_uncertain_category_mappings(df, col_name)
                uncertain_mappings.extend(col_uncertain)

        result["cells_changed"] = cells_changed
        result["cells_changed_percentage"] = cells_changed_pct
        result["predicted_health_score"] = pred_profile["summary"]["health_score"]
        result["predicted_sub_scores"] = pred_profile["summary"]["sub_scores"]
        result["uncertain_mappings"] = uncertain_mappings

        # Drop DataFrame from result to return pure JSON metadata
        del result["df_cleaned"]
        del result["total_cells_changed"]
        return result

    def apply_cleaning_and_create_version(
        self,
        db: Session,
        source_version: DatasetVersion,
        operations: List[Dict[str, Any]],
        target_column: Optional[str] = None,
        confirm_target_modification: bool = False,
    ) -> Dict[str, Any]:
        """Applies the cleaning pipeline server-side from the source Parquet file,
        verifies no-op, calculates deterministic logical data hash, atomically saves
        the Parquet artifact, creates DatasetVersion + Transformation, and precomputes
        the new profile.
        """
        source_path = Path(source_version.storage_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Fichier Parquet source introuvable: {source_path}")

        table = pq.read_table(source_path)
        df = table.to_pandas()

        start_time = time.time()
        pipeline_result = self.execute_cleaning_pipeline(df, operations, target_column)

        # 1. No-op verification
        if pipeline_result["is_noop"] or pipeline_result["rows_affected"] == 0:
            raise ValueError(
                "Aucune donnée modifiée (0 ligne affectée). "
                "Cette opération ne change rien aux données ; aucune nouvelle version n'a été créée."
            )

        # 2. Target column protection
        if pipeline_result["target_affected"] and not confirm_target_modification:
            raise ValueError(
                f"La colonne cible '{target_column}' est modifiée par ce nettoyage. "
                "Vous devez confirmer explicitement cette action (confirm_target_modification=True)."
            )

        df_cleaned = pipeline_result["df_cleaned"]
        row_count = len(df_cleaned)

        # 3. Calculate deterministic logical data hash (independent of Parquet metadata)
        logical_data_hash = self.calculate_logical_data_hash(df_cleaned)

        # Canonical parameters recording all executed operations with their computed values
        transformation_params = {
            "operations": pipeline_result["operations_executed"],
            "rows_affected": pipeline_result["rows_affected"],
            "initial_row_count": pipeline_result["rows_before"],
            "final_row_count": pipeline_result["rows_after"],
            "columns_affected": pipeline_result["columns_affected"],
            "target_column": target_column,
        }

        # Deterministic version hash based on dataset, parent hash, params, and logical data
        new_version_hash = lineage_service.generate_version_hash(
            dataset_id=source_version.dataset_id,
            parent_version_hash=source_version.version_hash,
            transformation_name="CLEANING_PIPELINE",
            parameters=transformation_params,
            data_hash=logical_data_hash,
        )

        # Check if identical immutable version already exists
        existing_version = db.query(DatasetVersion).filter(
            DatasetVersion.dataset_id == source_version.dataset_id,
            DatasetVersion.version_hash == new_version_hash,
        ).first()
        if existing_version:
            # Already exists: return existing version and profile
            after_profile = profiling_service.get_or_create_profile(
                dataset_id=str(source_version.dataset_id),
                version_hash=existing_version.version_hash,
                parquet_path=Path(existing_version.storage_path),
                target_column=target_column,
            )
            before_profile = profiling_service.get_or_create_profile(
                dataset_id=str(source_version.dataset_id),
                version_hash=source_version.version_hash,
                parquet_path=source_path,
                target_column=target_column,
            )
            return {
                "new_version": existing_version,
                "transformation": existing_version.transformation_produced,
                "before_profile": before_profile,
                "after_profile": after_profile,
                "pipeline_result": pipeline_result,
            }

        # 4. Convert cleaned DataFrame to Parquet
        cleaned_table = pa.Table.from_pandas(df_cleaned, preserve_index=False)
        metadata = parquet_service.extract_table_metadata(cleaned_table)
        target_path = storage_service.get_version_parquet_path(source_version.dataset_id, new_version_hash)

        # Atomic file + database write
        target_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            pq.write_table(cleaned_table, target_path, compression="snappy")
            file_size = target_path.stat().st_size

            # Create DatasetVersion
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

            # Create Transformation
            transformation = Transformation(
                name="CLEANING_PIPELINE",
                parameters=transformation_params,
                source_version_id=source_version.id,
                target_version_id=new_version.id,
                execution_time_ms=execution_time_ms,
            )
            db.add(transformation)
            db.commit()
            db.refresh(new_version)
        except Exception as exc:
            db.rollback()
            if target_path.exists():
                try:
                    target_path.unlink()
                except Exception:
                    pass
            raise exc

        # 5. Precompute and store profile for the new version
        # Walk lineage to find original filename
        original_filename = None
        curr = source_version
        while curr:
            if curr.transformation_produced and curr.transformation_produced.parameters:
                original_filename = (
                    curr.transformation_produced.parameters.get("filename")
                    or curr.transformation_produced.parameters.get("original_filename")
                )
                if original_filename:
                    break
            if not curr.parent_version_id:
                break
            curr = curr.parent_version

        if not original_filename and source_version.dataset and source_version.dataset.versions:
            for v in source_version.dataset.versions:
                if v.parent_version_id is None and v.transformation_produced and v.transformation_produced.parameters:
                    original_filename = (
                        v.transformation_produced.parameters.get("filename")
                        or v.transformation_produced.parameters.get("original_filename")
                    )
                    if original_filename:
                        break

        if not original_filename:
            original_filename = f"{source_version.dataset.name}.csv" if source_version.dataset else "dataset.csv"

        after_profile = profiling_service.get_or_create_profile(
            dataset_id=str(source_version.dataset_id),
            version_hash=new_version_hash,
            parquet_path=target_path,
            target_column=target_column,
            original_filename=original_filename,
            force_recompute=True,
        )

        before_profile = profiling_service.get_or_create_profile(
            dataset_id=str(source_version.dataset_id),
            version_hash=source_version.version_hash,
            parquet_path=source_path,
            target_column=target_column,
            original_filename=original_filename,
        )

        return {
            "new_version": new_version,
            "transformation": transformation,
            "before_profile": before_profile,
            "after_profile": after_profile,
            "pipeline_result": pipeline_result,
        }


cleaning_service = CleaningService()
