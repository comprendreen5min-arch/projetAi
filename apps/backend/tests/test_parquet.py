import io
from pathlib import Path
import pyarrow.parquet as pq
from app.services.parquet_service import parquet_service
from app.services.diff_service import diff_service


def test_convert_csv_to_parquet(sample_csv_content):
    parquet_bytes, metadata, row_count = parquet_service.convert_csv_to_parquet_bytes(sample_csv_content)
    
    assert row_count == 5
    assert len(parquet_bytes) > 0
    assert metadata["num_rows"] == 5
    assert metadata["num_columns"] == 4
    
    col_names = [col["name"] for col in metadata["columns"]]
    assert col_names == ["id", "feature_a", "feature_b", "label"]

    reader = pq.read_table(io.BytesIO(parquet_bytes))
    assert reader.num_rows == 5
    assert reader.column_names == ["id", "feature_a", "feature_b", "label"]


def test_parquet_sample_reading(tmp_path, sample_csv_content):
    parquet_bytes, _, _ = parquet_service.convert_csv_to_parquet_bytes(sample_csv_content)
    test_file = tmp_path / "test_sample.parquet"
    parquet_service.save_parquet(parquet_bytes, test_file)

    sample = parquet_service.read_sample(test_file, limit=2)
    assert len(sample) == 2
    assert sample[0]["feature_b"] == "alpha"
    assert sample[1]["feature_b"] == "beta"


def test_ai_transformations_standardize_and_one_hot(tmp_path, sample_csv_content):
    parquet_bytes, _, _ = parquet_service.convert_csv_to_parquet_bytes(sample_csv_content)
    base_file = tmp_path / "base.parquet"
    parquet_service.save_parquet(parquet_bytes, base_file)

    # 1. Standardize feature_a
    std_bytes, metadata, _ = parquet_service.apply_transformation_to_parquet(
        source_parquet_path=base_file,
        transformation_name="STANDARDIZE",
        parameters={"columns": ["feature_a"]},
    )
    std_file = tmp_path / "std.parquet"
    parquet_service.save_parquet(std_bytes, std_file)

    # 2. Check diff between base and standardized
    diff_report = diff_service.compare_parquet_versions(base_file, std_file)
    assert diff_report["row_count_delta"] == 0
    assert "feature_a" in diff_report["column_metrics"]
    # Standardized mean should be ~0.0
    assert abs(diff_report["column_metrics"]["feature_a"]["mean_after"]) < 1e-4

    # 3. Test One-Hot Encoding
    ohe_bytes, ohe_meta, _ = parquet_service.apply_transformation_to_parquet(
        source_parquet_path=base_file,
        transformation_name="ONE_HOT_ENCODE",
        parameters={"columns": ["feature_b"]},
    )
    cols = [c["name"] for c in ohe_meta["columns"]]
    assert "feature_b_alpha" in cols
    assert "feature_b_beta" in cols
    assert "feature_b_gamma" in cols
