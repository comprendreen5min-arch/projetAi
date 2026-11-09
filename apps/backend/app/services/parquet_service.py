import hashlib
import io
from pathlib import Path
from typing import Any, Dict, List, Tuple
import pyarrow as pa
import pyarrow.csv as pcsv
import pyarrow.parquet as pq
import pandas as pd
import numpy as np


class ParquetService:
    @staticmethod
    def calculate_bytes_hash(data: bytes) -> str:
        """Compute SHA-256 hash of raw bytes."""
        hasher = hashlib.sha256()
        hasher.update(data)
        return hasher.hexdigest()

    @staticmethod
    def extract_table_metadata(table: pa.Table) -> Dict[str, Any]:
        """Extract schema metadata, types, and stats from an Apache Arrow table."""
        columns_info = []
        for i, field in enumerate(table.schema):
            col_data = table.column(i)
            columns_info.append({
                "name": field.name,
                "type": str(field.type),
                "nullable": field.nullable,
                "null_count": col_data.null_count,
            })
        return {
            "columns": columns_info,
            "num_columns": table.num_columns,
            "num_rows": table.num_rows,
        }

    def convert_csv_to_parquet_bytes(self, csv_bytes: bytes) -> Tuple[bytes, Dict[str, Any], int]:
        """Parses CSV bytes with PyArrow and returns (parquet_bytes, metadata, row_count)."""
        input_stream = io.BytesIO(csv_bytes)
        table = pcsv.read_csv(input_stream)
        metadata = self.extract_table_metadata(table)
        row_count = table.num_rows

        parquet_buffer = io.BytesIO()
        pq.write_table(table, parquet_buffer, compression="snappy")
        parquet_bytes = parquet_buffer.getvalue()

        return parquet_bytes, metadata, row_count

    def save_parquet(self, parquet_bytes: bytes, target_path: Path) -> int:
        """Write parquet bytes to destination file and return file size in bytes."""
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "wb") as f:
            f.write(parquet_bytes)
        return len(parquet_bytes)

    def read_sample(self, parquet_path: Path, limit: int = 10) -> List[Dict[str, Any]]:
        """Read the first N rows of a Parquet file as python dictionaries."""
        if not parquet_path.exists():
            return []
        
        table = pq.read_table(parquet_path)
        sample_slice = table.slice(0, limit)
        rows = sample_slice.to_pylist()
        formatted_rows = []
        for row in rows:
            formatted_row = {}
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    formatted_row[k] = v.isoformat()
                else:
                    formatted_row[k] = v
            formatted_rows.append(formatted_row)
        return formatted_rows

    def apply_transformation_to_parquet(
        self,
        source_parquet_path: Path,
        transformation_name: str,
        parameters: Dict[str, Any],
    ) -> Tuple[bytes, Dict[str, Any], int]:
        """Apply a deterministic transformation to an existing parquet file and return new parquet bytes."""
        table = pq.read_table(source_parquet_path)
        df = table.to_pandas()

        if transformation_name == "SELECT_COLUMNS":
            columns = parameters.get("columns", [])
            valid_cols = [c for c in columns if c in df.columns]
            if valid_cols:
                df = df[valid_cols]

        elif transformation_name == "DROP_COLUMNS":
            columns = parameters.get("columns", [])
            df = df.drop(columns=[c for c in columns if c in df.columns], errors="ignore")

        elif transformation_name == "FILTER_QUERY":
            query_str = parameters.get("query")
            if query_str:
                df = df.query(query_str)

        elif transformation_name == "DROP_NULLS":
            subset = parameters.get("subset")
            df = df.dropna(subset=subset if subset else None)

        elif transformation_name == "SORT_VALUES":
            by = parameters.get("by")
            ascending = parameters.get("ascending", True)
            if by and by in df.columns:
                df = df.sort_values(by=by, ascending=ascending)

        elif transformation_name == "STANDARDIZE":
            # Z-Score normalization: (x - mean) / std
            cols = parameters.get("columns", [])
            target_cols = [c for c in cols if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
            for col in target_cols:
                std = df[col].std()
                if std > 0:
                    df[col] = (df[col] - df[col].mean()) / std

        elif transformation_name == "MIN_MAX_SCALE":
            # Min-Max normalization to [0, 1]
            cols = parameters.get("columns", [])
            target_cols = [c for c in cols if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
            for col in target_cols:
                min_val = df[col].min()
                max_val = df[col].max()
                if max_val > min_val:
                    df[col] = (df[col] - min_val) / (max_val - min_val)

        elif transformation_name == "FILL_NA":
            # Fill missing values: strategy = 'mean' | 'median' | 'zero' | 'constant'
            strategy = parameters.get("strategy", "zero")
            value = parameters.get("value", 0)
            cols = parameters.get("columns", list(df.columns))

            for col in cols:
                if col in df.columns:
                    if strategy == "mean" and pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].mean())
                    elif strategy == "median" and pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].median())
                    elif strategy == "constant":
                        df[col] = df[col].fillna(value)
                    else:
                        df[col] = df[col].fillna(0)

        elif transformation_name == "ONE_HOT_ENCODE":
            # Dummy encoding of categorical columns
            cols = parameters.get("columns", [])
            target_cols = [c for c in cols if c in df.columns]
            if target_cols:
                df = pd.get_dummies(df, columns=target_cols, dtype=int)

        else:
            raise ValueError(f"Transformation '{transformation_name}' non reconnue.")

        # Convert back to Arrow table
        transformed_table = pa.Table.from_pandas(df, preserve_index=False)
        metadata = self.extract_table_metadata(transformed_table)
        row_count = transformed_table.num_rows

        parquet_buffer = io.BytesIO()
        pq.write_table(transformed_table, parquet_buffer, compression="snappy")
        parquet_bytes = parquet_buffer.getvalue()

        return parquet_bytes, metadata, row_count


parquet_service = ParquetService()
