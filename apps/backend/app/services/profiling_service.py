import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
import pyarrow.parquet as pq


class ProfilingService:
    @staticmethod
    def detect_column_type(col_name: str, series: pd.Series, total_rows: int) -> str:
        """Detects the functional semantic type of a column:
        'id', 'nombre', 'catégorie', 'date', 'cible'
        """
        col_lower = col_name.lower().strip()
        non_null_series = series.dropna()
        unique_count = non_null_series.nunique()

        # 1. Target candidate
        if col_lower in ["target", "label", "churn", "churned", "is_churn", "y", "default", "outcome"]:
            return "cible"

        # 2. Identifier (ID)
        if col_lower in ["id", "uuid", "pk", "_id"] or col_lower.endswith(("_id", ".id", "_pk")):
            return "id"
        if unique_count == total_rows and total_rows > 1 and not pd.api.types.is_float_dtype(series):
            return "id"

        # 3. Date / Time
        if pd.api.types.is_datetime64_any_dtype(series):
            return "date"
        if "date" in col_lower or "time" in col_lower or "timestamp" in col_lower:
            # Check if parseable as dates
            try:
                if len(non_null_series) > 0 and pd.to_datetime(non_null_series.iloc[:10], errors="coerce").notnull().all():
                    return "date"
            except Exception:
                pass

        # 4. Numerical (float or integer)
        if pd.api.types.is_numeric_dtype(series):
            return "nombre"

        # 5. Categorical (default for strings, booleans, objects)
        return "catégorie"

    @staticmethod
    def compute_histogram_bins(series: pd.Series, num_bins: int = 10) -> List[Dict[str, Any]]:
        """Computes histogram distribution bars for numeric series."""
        clean_series = series.dropna()
        if len(clean_series) == 0:
            return []

        counts, bin_edges = np.histogram(clean_series, bins=num_bins)
        max_count = int(counts.max()) if len(counts) > 0 and counts.max() > 0 else 1

        histogram = []
        for i in range(len(counts)):
            histogram.append({
                "bin_index": i,
                "bin_start": round(float(bin_edges[i]), 2),
                "bin_end": round(float(bin_edges[i + 1]), 2),
                "count": int(counts[i]),
                "height_percentage": round((int(counts[i]) / max_count) * 100, 1),
            })
        return histogram

    @staticmethod
    def compute_categorical_distribution(series: pd.Series, max_bars: int = 10) -> List[Dict[str, Any]]:
        """Computes frequency bars for categorical or string columns."""
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
            })
        return histogram

    def profile_parquet_file(self, parquet_path: Path) -> Dict[str, Any]:
        """Calculates comprehensive profiling metrics on a Parquet file."""
        if not parquet_path.exists():
            raise FileNotFoundError(f"Fichier Parquet introuvable: {parquet_path}")

        table = pq.read_table(parquet_path)
        df = table.to_pandas()

        total_rows = len(df)
        total_columns = len(df.columns)
        file_size_bytes = parquet_path.stat().st_size
        duplicate_rows_count = int(df.duplicated().sum())

        columns_profile = []
        flagged_count = 0
        numeric_count = 0
        category_count = 0

        target_column_name: Optional[str] = None

        for col_name in df.columns:
            series = df[col_name]
            col_type = self.detect_column_type(col_name, series, total_rows)

            if col_type == "cible" and not target_column_name:
                target_column_name = col_name

            if col_type == "nombre":
                numeric_count += 1
            elif col_type in ["catégorie", "cible", "date"]:
                category_count += 1

            null_count = int(series.isnull().sum())
            null_percentage = round((null_count / total_rows * 100), 2) if total_rows > 0 else 0.0

            unique_count = int(series.nunique(dropna=True))
            unique_percentage = round((unique_count / total_rows * 100), 2) if total_rows > 0 else 0.0

            # Numerical statistics & IQR outliers
            stats = None
            outlier_count = 0
            outlier_percentage = 0.0
            histogram = []

            is_flagged = False
            flag_reasons = []

            if pd.api.types.is_numeric_dtype(series):
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
                    histogram = self.compute_histogram_bins(clean_s)
            else:
                histogram = self.compute_categorical_distribution(series)

            # Check problem flags (triggering the amber corner & FLAGGED filter)
            if null_percentage > 5.0:
                is_flagged = True
                flag_reasons.append(f"{null_percentage}% de valeurs manquantes")

            if outlier_count > 0:
                is_flagged = True
                flag_reasons.append(f"{outlier_count} outliers (IQR)")

            if col_type == "id" and duplicate_rows_count > 0:
                is_flagged = True
                flag_reasons.append(f"{duplicate_rows_count} lignes dupliquées")

            # Check casing inconsistencies for strings (e.g. "Casablanca" vs "casablanca")
            if col_type == "catégorie":
                non_null_str = series.dropna().astype(str)
                lower_unique = non_null_str.str.lower().str.strip().nunique()
                raw_unique = non_null_str.nunique()
                if raw_unique > lower_unique:
                    is_flagged = True
                    flag_reasons.append("Catégories incohérentes (casse/espaces)")

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
            })

        return {
            "summary": {
                "total_rows": total_rows,
                "total_columns": total_columns,
                "file_size_bytes": file_size_bytes,
                "duplicate_rows_count": duplicate_rows_count,
                "target_column": target_column_name,
                "flagged_columns_count": flagged_count,
                "numeric_columns_count": numeric_count,
                "category_columns_count": category_count,
            },
            "columns": columns_profile,
        }

    def get_or_create_profile(self, dataset_id: str, version_hash: str, parquet_path: Path) -> Dict[str, Any]:
        """Returns the stored profile JSON if already computed, otherwise computes,
        persists on disk, and returns the result (zero recalculation).
        """
        profile_cache_file = parquet_path.parent / f"{version_hash}_profile.json"
        
        if profile_cache_file.exists():
            try:
                with open(profile_cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        profile_data = self.profile_parquet_file(parquet_path)
        profile_data["dataset_id"] = str(dataset_id)
        profile_data["version_hash"] = version_hash

        # Store result so it is never recomputed
        try:
            with open(profile_cache_file, "w", encoding="utf-8") as f:
                json.dump(profile_data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        return profile_data


profiling_service = ProfilingService()

