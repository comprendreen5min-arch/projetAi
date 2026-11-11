import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import unicodedata
import numpy as np
import pandas as pd
import pyarrow.parquet as pq


class ProfilingService:
    @staticmethod
    def normalize_text(text: str) -> str:
        """Normalizes a string by stripping whitespace, converting to lower case,
        and stripping diacritics / accents.
        """
        if not isinstance(text, str):
            text = str(text)
        text = text.strip().lower()
        # Remove accents
        text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
        return text

    @classmethod
    def detect_inconsistent_categories(cls, series: pd.Series) -> Tuple[bool, List[str], int]:
        """Detects if a categorical column has inconsistent entries due to
        casing, accents, or superfluous spacing (e.g. 'Casablanca', 'casablanca', ' Casablanca ').
        Returns (has_inconsistencies, list_of_example_variants, count_of_inconsistent_rows).
        """
        non_null = series.dropna().astype(str)
        non_null = non_null[non_null.str.strip() != ""]
        if len(non_null) == 0:
            return False, [], 0

        # Group raw values by normalized value
        normalized_groups: Dict[str, set] = {}
        for val in non_null:
            norm = cls.normalize_text(val)
            if norm not in normalized_groups:
                normalized_groups[norm] = set()
            normalized_groups[norm].add(val)

        inconsistent_examples = []
        inconsistent_rows_count = 0

        for norm_key, variants in normalized_groups.items():
            if len(variants) > 1:
                # Multiple raw variants for the same normalized concept
                variant_list = sorted(list(variants))
                inconsistent_examples.extend(variant_list)
                # Count rows for non-canonical variants
                variant_counts = non_null[non_null.isin(variants)].value_counts()
                # Majority variant is considered canonical, others are inconsistent
                inconsistent_rows_count += int(variant_counts.iloc[1:].sum())

        return len(inconsistent_examples) > 0, inconsistent_examples[:5], inconsistent_rows_count

    @staticmethod
    def detect_column_type(col_name: str, series: pd.Series, total_rows: int, target_col: Optional[str] = None) -> str:
        """Detects the functional semantic type of a column:
        'id', 'nombre', 'catégorie', 'date', 'cible'
        """
        col_lower = col_name.lower().strip()
        non_null_series = series.dropna()
        unique_count = non_null_series.nunique()

        # 1. Target match (explicit or candidate)
        if target_col and col_name == target_col:
            return "cible"
        if not target_col and col_lower in ["target", "label", "churn", "churned", "is_churn", "y", "default", "outcome"]:
            return "cible"

        # 2. Identifier (ID)
        if col_lower in ["id", "uuid", "pk", "_id"] or col_lower.endswith(("_id", ".id", "_pk")):
            return "id"
        if unique_count == total_rows and total_rows > 1 and pd.api.types.is_integer_dtype(series) and col_lower not in ["age", "year", "month", "day", "count"]:
            return "id"

        # 3. Date / Time
        if pd.api.types.is_datetime64_any_dtype(series):
            return "date"
        if "date" in col_lower or "time" in col_lower or "timestamp" in col_lower:
            try:
                if len(non_null_series) > 0 and pd.to_datetime(non_null_series.iloc[:10], errors="coerce").notnull().all():
                    return "date"
            except Exception:
                pass

        # 4. Boolean (treated as category)
        if pd.api.types.is_bool_dtype(series):
            return "catégorie"

        # 5. Numerical (float or integer)
        if pd.api.types.is_numeric_dtype(series):
            return "nombre"

        # 6. Categorical
        return "catégorie"

    @staticmethod
    def compute_histogram_with_outliers(
        series: pd.Series,
        lower_bound: Optional[float] = None,
        upper_bound: Optional[float] = None,
        num_bins: int = 10,
    ) -> List[Dict[str, Any]]:
        """Computes histogram distribution bars for numeric series.
        If outliers exist beyond upper_bound or lower_bound, the last bar specifically
        groups the upper outliers and is marked with is_outlier=True.
        """
        clean_series = series.dropna()
        if len(clean_series) == 0:
            return []

        has_outliers = False
        outlier_count = 0
        normal_series = clean_series

        if lower_bound is not None and upper_bound is not None:
            outliers = clean_series[(clean_series < lower_bound) | (clean_series > upper_bound)]
            outlier_count = len(outliers)
            if outlier_count > 0:
                has_outliers = True
                # Clip or filter normal data for the first bins
                normal_series = clean_series[(clean_series >= lower_bound) & (clean_series <= upper_bound)]
                if len(normal_series) == 0:
                    normal_series = clean_series
                    has_outliers = False

        bins_count = (num_bins - 1) if has_outliers else num_bins
        if len(normal_series) > 0:
            counts, bin_edges = np.histogram(normal_series, bins=bins_count)
        else:
            counts, bin_edges = np.histogram(clean_series, bins=num_bins)
            has_outliers = False

        histogram = []
        max_count = int(counts.max()) if len(counts) > 0 and counts.max() > 0 else 1
        if has_outliers and outlier_count > max_count:
            max_count = outlier_count

        for i in range(len(counts)):
            histogram.append({
                "bin_index": i,
                "bin_start": round(float(bin_edges[i]), 2),
                "bin_end": round(float(bin_edges[i + 1]), 2),
                "count": int(counts[i]),
                "height_percentage": round((int(counts[i]) / max_count) * 100, 1),
                "is_outlier": False,
            })

        # Append dedicated outlier bar in red if outliers exist
        if has_outliers:
            histogram.append({
                "bin_index": len(histogram),
                "bin_start": round(float(upper_bound if upper_bound is not None else bin_edges[-1]), 2),
                "bin_end": round(float(clean_series.max()), 2),
                "count": int(outlier_count),
                "height_percentage": round((int(outlier_count) / max_count) * 100, 1),
                "is_outlier": True,
            })

        return histogram

    @staticmethod
    def compute_categorical_distribution(series: pd.Series, max_bars: int = 10) -> List[Dict[str, Any]]:
        """Computes frequency bars for categorical columns."""
        clean_series = series.dropna().astype(str)
        if len(clean_series) == 0:
            return []

        value_counts = clean_series.value_counts().head(max_bars)
        max_count = int(value_counts.max()) if len(value_counts) > 0 and value_counts.max() > 0 else 1

        histogram = []
        for i, (val, count) in enumerate(value_counts.items()):
            histogram.append({
                "bin_index": i,
                "label": str(val),
                "count": int(count),
                "height_percentage": round((int(count) / max_count) * 100, 1),
                "is_outlier": False,
            })
        return histogram

    @staticmethod
    def calculate_class_balance(series: pd.Series) -> Optional[float]:
        """Calculates normalized Shannon Entropy for class balance:
        H = - sum(p_i * log_K(p_i)) in [0, 1], multiplied by 100.
        Returns None if column is continuous or has <= 1 class or > 20 classes.
        """
        clean = series.dropna()
        if len(clean) == 0:
            return None

        val_counts = clean.value_counts()
        num_classes = len(val_counts)

        # Only applicable for discrete targets with 2 to 20 classes
        if num_classes < 2 or num_classes > 20:
            return None

        probs = val_counts / len(clean)
        # Shannon entropy normalized by log(K)
        entropy = -sum(p * math.log(p, num_classes) for p in probs if p > 0)
        return round(float(entropy * 100), 1)

    def calculate_sub_scores(
        self,
        df: pd.DataFrame,
        total_rows: int,
        duplicate_rows_count: int,
        columns_profile: List[Dict[str, Any]],
        target_col: Optional[str],
    ) -> Dict[str, Any]:
        """Calculates the 5 sub-scores (0-100) and the overall weighted health score (0-100):
        1. Complétude (25%)
        2. Unicité (20%)
        3. Validité (20%)
        4. Cohérence (20%)
        5. Équilibre des classes (15%)
        """
        # Exclure les métadonnées d'augmentation du calcul du score de santé
        metadata_cols = {"split", "is_synthetic", "origin", "parent_ids"}
        feature_profiles = [c for c in columns_profile if c["name"] not in metadata_cols]

        total_cells = total_rows * len(feature_profiles)
        total_nulls = sum(c["null_count"] for c in feature_profiles)

        # 1. Complétude (25%)
        if total_cells > 0:
            completeness = max(0.0, min(100.0, (1.0 - (total_nulls / total_cells)) * 100.0))
        else:
            completeness = 100.0

        # 2. Unicité (20%)
        if total_rows > 0:
            uniqueness = max(0.0, min(100.0, (1.0 - (duplicate_rows_count / total_rows)) * 100.0))
        else:
            uniqueness = 100.0

        # 3. Validité (20%): Proportion of non-outlier rows in numeric columns
        numeric_cols = [c for c in feature_profiles if c["detected_type"] == "nombre" and c["stats"]]
        if len(numeric_cols) > 0:
            total_numeric_values = sum(total_rows - c["null_count"] for c in numeric_cols)
            total_outliers = sum(c["outlier_count"] for c in numeric_cols)
            if total_numeric_values > 0:
                validity = max(0.0, min(100.0, (1.0 - (total_outliers / total_numeric_values)) * 100.0))
            else:
                validity = 100.0
        else:
            validity = 100.0

        # 4. Cohérence (20%): Proportion of syntactically consistent rows in categorical columns
        cat_cols = [c for c in feature_profiles if c["detected_type"] == "catégorie"]
        if len(cat_cols) > 0 and total_rows > 0:
            total_inconsistent = sum(c.get("inconsistent_rows_count", 0) for c in cat_cols)
            total_cat_values = total_rows * len(cat_cols)
            consistency = max(0.0, min(100.0, (1.0 - (total_inconsistent / total_cat_values)) * 100.0))
        else:
            consistency = 100.0

        # 5. Équilibre des classes (15%)
        class_balance = None
        if target_col and target_col in df.columns:
            class_balance = self.calculate_class_balance(df[target_col])

        # Overall Health Score (Weighted average)
        # Weights: completeness 25%, uniqueness 20%, validity 20%, consistency 20%, class_balance 15%
        if class_balance is not None:
            health_score = round(
                0.25 * completeness +
                0.20 * uniqueness +
                0.20 * validity +
                0.20 * consistency +
                0.15 * class_balance
            )
        else:
            # Re-normalize weights over 85% if no target class balance is applicable
            health_score = round(
                (0.25 * completeness + 0.20 * uniqueness + 0.20 * validity + 0.20 * consistency) / 0.85
            )

        return {
            "health_score": int(health_score),
            "sub_scores": {
                "completeness": round(completeness, 1),
                "uniqueness": round(uniqueness, 1),
                "validity": round(validity, 1),
                "consistency": round(consistency, 1),
                "class_balance": class_balance,
            },
            "weights": {
                "completeness": 0.25,
                "uniqueness": 0.20,
                "validity": 0.20,
                "consistency": 0.20,
                "class_balance": 0.15 if class_balance is not None else 0.0,
            }
        }

    def generate_findings(
        self,
        df: pd.DataFrame,
        total_rows: int,
        duplicate_rows_count: int,
        columns_profile: List[Dict[str, Any]],
        target_col: Optional[str],
        class_balance: Optional[float],
    ) -> List[Dict[str, Any]]:
        """Generates sorted findings 'Ce qui demande votre attention'
        classified by severity: HIGH, MEDIUM, LOW.
        """
        findings = []

        # 1. Target Imbalance (HIGH if class balance < 60%)
        if target_col and target_col in df.columns and class_balance is not None:
            if class_balance < 60.0:
                vc = df[target_col].dropna().value_counts()
                minority_class = vc.index[-1]
                minority_pct = round((vc.iloc[-1] / len(df[target_col].dropna())) * 100, 1)
                findings.append({
                    "severity": "HIGH",
                    "title": f"Déséquilibre sur la cible ({target_col})",
                    "description": f"{target_col} = '{minority_class}' dans seulement {minority_pct}% des lignes",
                    "action_label": "Voir les options →",
                    "action_type": "options",
                    "column": target_col,
                })

        # 2. Missing Values (HIGH if any col > 10% or total cols > 2)
        missing_cols = [c for c in columns_profile if c["null_percentage"] > 0]
        if missing_cols:
            worst_col = max(missing_cols, key=lambda x: x["null_percentage"])
            if worst_col["null_percentage"] >= 10.0 or len(missing_cols) >= 3:
                severity = "HIGH"
            else:
                severity = "MEDIUM"

            findings.append({
                "severity": severity,
                "title": f"Valeurs manquantes dans {len(missing_cols)} colonne{'s' if len(missing_cols) > 1 else ''}",
                "description": f"{worst_col['name']} présente le plus de lacunes ({worst_col['null_percentage']}%)",
                "action_label": "Corriger →",
                "action_type": "fix",
                "column": worst_col["name"],
            })

        # 3. Outliers (MEDIUM if outliers exist)
        outlier_cols = [c for c in columns_profile if c.get("outlier_count", 0) > 0]
        for c in outlier_cols:
            findings.append({
                "severity": "MEDIUM",
                "title": f"Valeurs aberrantes dans {c['name']}",
                "description": f"{c['outlier_count']:,} valeurs au-delà de l'intervalle IQR habituel".replace(",", " "),
                "action_label": "Examiner →",
                "action_type": "review",
                "column": c["name"],
            })

        # 4. Inconsistent Categories (MEDIUM)
        for c in columns_profile:
            if c.get("inconsistent_examples"):
                examples_str = ", ".join(f'"{ex}"' for ex in c["inconsistent_examples"][:3])
                findings.append({
                    "severity": "MEDIUM",
                    "title": f"Catégories incohérentes dans {c['name']}",
                    "description": f"Variantes détectées : {examples_str}",
                    "action_label": "Fusionner →",
                    "action_type": "merge",
                    "column": c["name"],
                })

        # 5. Duplicate Rows (LOW)
        if duplicate_rows_count > 0:
            id_cols = [c["name"] for c in columns_profile if c["detected_type"] == "id"]
            id_info = f"Mêmes identifiants ({', '.join(id_cols)}) et valeurs identiques" if id_cols else "Mêmes valeurs sur l'ensemble des colonnes"
            findings.append({
                "severity": "LOW",
                "title": f"{duplicate_rows_count} ligne{'s' if duplicate_rows_count > 1 else ''} dupliquée{'s' if duplicate_rows_count > 1 else ''}",
                "description": id_info,
                "action_label": "Supprimer →",
                "action_type": "remove",
                "column": None,
            })

        # Sort order: HIGH first, then MEDIUM, then LOW
        severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        findings.sort(key=lambda x: severity_order.get(x["severity"], 3))

        # Add index numbers
        for idx, f in enumerate(findings):
            f["number"] = f"{idx + 1:02d}"

        return findings

    def profile_dataframe(
        self,
        df: pd.DataFrame,
        target_column: Optional[str] = None,
        original_filename: Optional[str] = None,
        file_size_bytes: int = 0,
    ) -> Dict[str, Any]:
        """Calculates comprehensive Phase A + Phase B profiling metrics directly on a DataFrame."""
        working_df = df.copy()
        # Treat empty strings and whitespace-only strings as missing values (NaN) for textual columns
        for col in working_df.columns:
            if working_df[col].dtype == "object" or pd.api.types.is_string_dtype(working_df[col]):
                working_df[col] = working_df[col].replace(r"^\s*$", np.nan, regex=True)

        total_rows = len(working_df)
        total_columns = len(working_df.columns)
        duplicate_rows_count = int(working_df.duplicated().sum())

        # Determine target column: use explicit selection or auto-detect
        if not target_column:
            for col in working_df.columns:
                if col.lower().strip() in ["target", "label", "churn", "churned", "is_churn", "y", "default", "outcome"]:
                    target_column = col
                    break

        columns_profile = []
        flagged_count = 0
        numeric_count = 0
        category_count = 0

        for col_name in working_df.columns:
            series = working_df[col_name]
            col_type = self.detect_column_type(col_name, series, total_rows, target_col=target_column)

            if col_type == "nombre":
                numeric_count += 1
            elif col_type in ["catégorie", "cible", "date"]:
                category_count += 1

            null_count = int(series.isnull().sum())
            null_percentage = round((null_count / total_rows * 100), 2) if total_rows > 0 else 0.0

            unique_count = int(series.nunique(dropna=True))
            unique_percentage = round((unique_count / total_rows * 100), 2) if total_rows > 0 else 0.0

            stats = None
            outlier_count = 0
            outlier_percentage = 0.0
            histogram = []

            is_flagged = False
            flag_reasons = []
            has_inconsistent = False
            inconsistent_examples = []
            inconsistent_rows_count = 0

            if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
                clean_s = series.dropna()
                if len(clean_s) > 0:
                    q1 = float(clean_s.quantile(0.25))
                    q3 = float(clean_s.quantile(0.75))
                    iqr = q3 - q1

                    lower_bound = q1 - 1.5 * iqr
                    upper_bound = q3 + 1.5 * iqr

                    outliers = clean_s[(clean_s < lower_bound) | (clean_s > upper_bound)]
                    outlier_count = int(len(outliers))
                    outlier_percentage = round((outlier_count / len(clean_s) * 100), 2)

                    stats = {
                        "min": round(float(clean_s.min()), 2),
                        "max": round(float(clean_s.max()), 2),
                        "mean": round(float(clean_s.mean()), 2),
                        "median": round(float(clean_s.median()), 2),
                        "std": round(float(clean_s.std()), 2) if len(clean_s) > 1 else 0.0,
                        "q1": round(q1, 2),
                        "q3": round(q3, 2),
                        "iqr": round(iqr, 2),
                    }
                    # Outliers are grouped into the last bar with is_outlier=True
                    histogram = self.compute_histogram_with_outliers(
                        series=clean_s,
                        lower_bound=lower_bound,
                        upper_bound=upper_bound,
                    )
            else:
                histogram = self.compute_categorical_distribution(series)

            # Inconsistent categories detection (casse, accents, espaces)
            if col_type in ["catégorie", "cible"] or not pd.api.types.is_numeric_dtype(series):
                has_inconsistent, inconsistent_examples, inconsistent_rows_count = self.detect_inconsistent_categories(series)
                if has_inconsistent:
                    is_flagged = True
                    flag_reasons.append("Catégories incohérentes (casse/accents)")

            if null_percentage > 5.0:
                is_flagged = True
                flag_reasons.append(f"{null_percentage}% de valeurs manquantes")

            if outlier_count > 0:
                is_flagged = True
                flag_reasons.append(f"{outlier_count} outliers (IQR)")

            if col_type == "id" and duplicate_rows_count > 0:
                is_flagged = True
                flag_reasons.append(f"{duplicate_rows_count} doublons")

            if is_flagged:
                flagged_count += 1

            columns_profile.append({
                "name": col_name,
                "detected_type": col_type,
                "null_count": null_count,
                "null_percentage": null_percentage,
                "unique_count": unique_count,
                "unique_percentage": unique_percentage,
                "stats": stats,
                "outlier_count": outlier_count,
                "outlier_percentage": outlier_percentage,
                "histogram": histogram,
                "is_flagged": is_flagged,
                "flag_reasons": flag_reasons,
                "inconsistent_examples": inconsistent_examples,
                "inconsistent_rows_count": inconsistent_rows_count,
            })

        # Calculate Phase B Scores
        scores_data = self.calculate_sub_scores(
            df=working_df,
            total_rows=total_rows,
            duplicate_rows_count=duplicate_rows_count,
            columns_profile=columns_profile,
            target_col=target_column,
        )

        # Generate Phase B Findings
        findings = self.generate_findings(
            df=working_df,
            total_rows=total_rows,
            duplicate_rows_count=duplicate_rows_count,
            columns_profile=columns_profile,
            target_col=target_column,
            class_balance=scores_data["sub_scores"]["class_balance"],
        )

        return {
            "summary": {
                "total_rows": total_rows,
                "total_columns": total_columns,
                "file_size_bytes": file_size_bytes,
                "duplicate_rows_count": duplicate_rows_count,
                "target_column": target_column,
                "original_filename": original_filename,
                "flagged_columns_count": flagged_count,
                "numeric_columns_count": numeric_count,
                "category_columns_count": category_count,
                "health_score": scores_data["health_score"],
                "sub_scores": scores_data["sub_scores"],
                "score_weights": scores_data["weights"],
                "schema_version": 2,
            },
            "findings": findings,
            "columns": columns_profile,
            "original_filename": original_filename,
        }

    def profile_parquet_file(
        self,
        parquet_path: Path,
        target_column: Optional[str] = None,
        original_filename: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Calculates comprehensive Phase A + Phase B profiling metrics on a Parquet file."""
        if not parquet_path.exists():
            raise FileNotFoundError(f"Fichier Parquet introuvable: {parquet_path}")

        table = pq.read_table(parquet_path)
        df = table.to_pandas()
        file_size_bytes = parquet_path.stat().st_size
        return self.profile_dataframe(
            df=df,
            target_column=target_column,
            original_filename=original_filename,
            file_size_bytes=file_size_bytes,
        )

    def get_or_create_profile(
        self,
        dataset_id: str,
        version_hash: str,
        parquet_path: Path,
        target_column: Optional[str] = None,
        original_filename: Optional[str] = None,
        force_recompute: bool = False,
    ) -> Dict[str, Any]:
        """Returns the stored profile JSON if already computed, otherwise computes,
        persists on disk, and returns the result (zero recalculation).
        If target_column is specified, it recalculates and updates the stored profile.
        """
        profile_cache_file = parquet_path.parent / f"{version_hash}_profile.json"

        if not force_recompute and profile_cache_file.exists():
            try:
                with open(profile_cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                    
                    # Ensure cached data contains full Phase B diagnostic fields and schema_version 2 (empty strings fix)
                    has_phase_b = (
                        "findings" in cached_data
                        and isinstance(cached_data.get("findings"), list)
                        and "health_score" in cached_data.get("summary", {})
                        and "sub_scores" in cached_data.get("summary", {})
                        and cached_data.get("summary", {}).get("schema_version") == 2
                    )
                    
                    if has_phase_b:
                        cached_target = cached_data.get("summary", {}).get("target_column")
                        if target_column is None or target_column == cached_target:
                            if original_filename:
                                cached_data["summary"]["original_filename"] = original_filename
                                cached_data["original_filename"] = original_filename
                            return cached_data
            except Exception:
                pass

        profile_data = self.profile_parquet_file(
            parquet_path=parquet_path,
            target_column=target_column,
            original_filename=original_filename,
        )
        profile_data["dataset_id"] = str(dataset_id)
        profile_data["version_hash"] = version_hash

        try:
            with open(profile_cache_file, "w", encoding="utf-8") as f:
                json.dump(profile_data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        return profile_data


profiling_service = ProfilingService()
