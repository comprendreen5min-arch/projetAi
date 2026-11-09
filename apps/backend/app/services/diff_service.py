import io
from pathlib import Path
from typing import Any, Dict, List
import numpy as np
import pandas as pd
import pyarrow.parquet as pq


class DiffService:
    @staticmethod
    def compare_parquet_versions(path_a: Path, path_b: Path) -> Dict[str, Any]:
        """Compares two Parquet files to detect schema drift, row count deltas,
        and statistical distribution shifts across columns.
        """
        table_a = pq.read_table(path_a)
        table_b = pq.read_table(path_b)

        df_a = table_a.to_pandas()
        df_b = table_b.to_pandas()

        cols_a = set(df_a.columns)
        cols_b = set(df_b.columns)

        added_columns = list(cols_b - cols_a)
        removed_columns = list(cols_a - cols_b)
        common_columns = list(cols_a.intersection(cols_b))

        # Check type changes for common columns
        type_changes = []
        for col in common_columns:
            type_a = str(df_a[col].dtype)
            type_b = str(df_b[col].dtype)
            if type_a != type_b:
                type_changes.append({
                    "column": col,
                    "type_before": type_a,
                    "type_after": type_b,
                })

        # Statistics comparison for common numerical columns
        column_metrics = {}
        for col in common_columns:
            if pd.api.types.is_numeric_dtype(df_a[col]) and pd.api.types.is_numeric_dtype(df_b[col]):
                mean_a = float(df_a[col].mean()) if not df_a[col].empty else 0.0
                mean_b = float(df_b[col].mean()) if not df_b[col].empty else 0.0
                std_a = float(df_a[col].std()) if not df_a[col].empty else 0.0
                std_b = float(df_b[col].std()) if not df_b[col].empty else 0.0

                column_metrics[col] = {
                    "is_numeric": True,
                    "mean_before": round(mean_a, 4),
                    "mean_after": round(mean_b, 4),
                    "delta_mean": round(mean_b - mean_a, 4),
                    "std_before": round(std_a, 4),
                    "std_after": round(std_b, 4),
                    "null_count_before": int(df_a[col].isnull().sum()),
                    "null_count_after": int(df_b[col].isnull().sum()),
                }
            else:
                column_metrics[col] = {
                    "is_numeric": False,
                    "null_count_before": int(df_a[col].isnull().sum()),
                    "null_count_after": int(df_b[col].isnull().sum()),
                    "unique_values_before": int(df_a[col].nunique()),
                    "unique_values_after": int(df_b[col].nunique()),
                }

        row_count_a = len(df_a)
        row_count_b = len(df_b)

        return {
            "row_count_before": row_count_a,
            "row_count_after": row_count_b,
            "row_count_delta": row_count_b - row_count_a,
            "row_count_percentage_change": round(((row_count_b - row_count_a) / row_count_a * 100), 2) if row_count_a > 0 else 0.0,
            "added_columns": added_columns,
            "removed_columns": removed_columns,
            "type_changes": type_changes,
            "column_metrics": column_metrics,
        }


diff_service = DiffService()

