import io
from pathlib import Path
import tempfile
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from app.services.cleaning_service import cleaning_service
from app.services.profiling_service import profiling_service


@pytest.fixture
def sample_df():
    return pd.DataFrame({
        "id": [1, 2, 3, 4, 5, 5],
        "name": [" Alice ", "bôb", "Charlie", "alice", " David", " David"],
        "city": ["Casablanca", "casa", "CASABLANCA", "", "Rabat", "Rabat"],
        "age": [25.0, np.nan, 35.0, 40.0, 120.0, 120.0],
        "churn": [0, 1, 0, 1, 0, 0],
    })


def test_logical_data_hash_determinism(sample_df):
    hash1 = cleaning_service.calculate_logical_data_hash(sample_df)
    hash2 = cleaning_service.calculate_logical_data_hash(sample_df.copy())
    assert hash1 == hash2
    assert len(hash1) == 64

    # Modifying a cell value must change the logical hash
    df_modified = sample_df.copy()
    df_modified.loc[0, "age"] = 26.0
    hash_mod = cleaning_service.calculate_logical_data_hash(df_modified)
    assert hash1 != hash_mod


def test_sort_operations_priority():
    ops = [
        {"type": "DROP_DUPLICATES"},
        {"type": "HANDLE_OUTLIERS", "column": "age"},
        {"type": "HANDLE_MISSING", "column": "age"},
        {"type": "CATEGORY_MERGE", "column": "city"},
        {"type": "TEXT_NORMALIZE", "column": "name"},
    ]
    sorted_ops = cleaning_service.sort_operations(ops)
    types_in_order = [op["type"] for op in sorted_ops]
    assert types_in_order == [
        "TEXT_NORMALIZE",
        "CATEGORY_MERGE",
        "HANDLE_MISSING",
        "HANDLE_OUTLIERS",
        "DROP_DUPLICATES",
    ]


def test_drop_duplicates_first_and_last(sample_df):
    # Rows 4 and 5 are completely identical duplicates
    res_first = cleaning_service.execute_cleaning_pipeline(
        sample_df,
        [{"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}}],
    )
    assert res_first["rows_before"] == 6
    assert res_first["rows_after"] == 5
    assert res_first["rows_affected"] == 1
    assert res_first["operations_executed"][0]["parameters"]["rows_dropped"] == 1

    res_last = cleaning_service.execute_cleaning_pipeline(
        sample_df,
        [{"type": "DROP_DUPLICATES", "parameters": {"keep": "last"}}],
    )
    assert res_last["rows_after"] == 5


def test_handle_missing_values_numeric_mean_median():
    df = pd.DataFrame({"val": [10.0, 20.0, np.nan, 30.0]})

    # Mean imputation: mean of [10, 20, 30] = 20.0
    res_mean = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_MISSING", "column": "val", "parameters": {"strategy": "mean"}}],
    )
    assert res_mean["rows_affected"] == 1
    assert res_mean["operations_executed"][0]["parameters"]["computed_value"] == 20.0
    assert res_mean["df_cleaned"]["val"].iloc[2] == 20.0

    # Median imputation: median of [10, 20, 30] = 20.0
    res_median = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_MISSING", "column": "val", "parameters": {"strategy": "median"}}],
    )
    assert res_median["operations_executed"][0]["parameters"]["computed_value"] == 20.0


def test_handle_missing_values_mode_constant_and_drop():
    df = pd.DataFrame({"category": ["A", "B", "A", None, ""]})

    # Mode imputation: mode is "A"
    res_mode = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_MISSING", "column": "category", "parameters": {"strategy": "mode"}}],
    )
    assert res_mode["rows_affected"] == 2  # None and empty string
    assert res_mode["df_cleaned"]["category"].tolist() == ["A", "B", "A", "A", "A"]

    # Constant imputation
    res_const = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_MISSING", "column": "category", "parameters": {"strategy": "constant", "fill_value": "UNKNOWN"}}],
    )
    assert res_const["df_cleaned"]["category"].tolist() == ["A", "B", "A", "UNKNOWN", "UNKNOWN"]

    # Drop strategy
    res_drop = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_MISSING", "column": "category", "parameters": {"strategy": "drop"}}],
    )
    assert len(res_drop["df_cleaned"]) == 3


def test_handle_missing_values_forbids_mean_median_on_strings():
    df = pd.DataFrame({"city": ["Rabat", None, "Casablanca"]})
    with pytest.raises(ValueError, match="strictement réservée aux colonnes numériques"):
        cleaning_service.execute_cleaning_pipeline(
            df,
            [{"type": "HANDLE_MISSING", "column": "city", "parameters": {"strategy": "mean"}}],
        )


def test_handle_outliers_iqr_clip_and_drop():
    # Distribution with an extreme outlier at 1000
    df = pd.DataFrame({"charges": [10.0, 12.0, 11.0, 13.0, 12.0, 11.0, 1000.0]})

    # Clip strategy
    res_clip = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_OUTLIERS", "column": "charges", "parameters": {"strategy": "clip"}}],
    )
    bounds = res_clip["operations_executed"][0]["parameters"]["computed_bounds"]
    assert bounds["upper_bound"] < 100.0
    assert res_clip["df_cleaned"]["charges"].max() <= bounds["upper_bound"]
    assert res_clip["rows_affected"] == 1

    # Drop strategy
    res_drop = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "HANDLE_OUTLIERS", "column": "charges", "parameters": {"strategy": "drop"}}],
    )
    assert len(res_drop["df_cleaned"]) == 6
    assert 1000.0 not in res_drop["df_cleaned"]["charges"].values


def test_categories_normalization_and_merge():
    df = pd.DataFrame({"city": [" Casablanca ", "casa", "CASABLANCA", "Rabat"]})

    # 1. Text normalize (strip, lowercase, unidecode)
    res_norm = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "TEXT_NORMALIZE", "column": "city", "parameters": {"lowercase": True, "strip": True}}],
    )
    assert res_norm["df_cleaned"]["city"].tolist() == ["casablanca", "casa", "casablanca", "rabat"]

    # 2. Category merge
    res_merge = cleaning_service.execute_cleaning_pipeline(
        df,
        [{"type": "CATEGORY_MERGE", "column": "city", "parameters": {"mapping": {"casa": "Casablanca", "CASABLANCA": "Casablanca"}}}],
    )
    assert res_merge["df_cleaned"]["city"].tolist() == [" Casablanca ", "Casablanca", "Casablanca", "Rabat"]


def test_normalization_and_merge_in_same_batch():
    """Point d'attention vérifié :
    La fusion manuelle s'exécute après la normalisation, donc elle doit s'appliquer
    aux valeurs déjà normalisées (ex. 'casa' vers 'casablanca') et la prévisualisation
    doit montrer les valeurs telles qu'elles sont au moment de la fusion.
    """
    df = pd.DataFrame({"city": [" Casablanca ", "casa", "CASABLANCA", "Rabat"]})

    # Note: Even if passed in reverse order, priority map ensures TEXT_NORMALIZE runs first
    ops = [
        {"type": "CATEGORY_MERGE", "column": "city", "parameters": {"mapping": {"casa": "casablanca"}}},
        {"type": "TEXT_NORMALIZE", "column": "city", "parameters": {"lowercase": True, "strip": True, "remove_accents": True}},
    ]

    res = cleaning_service.execute_cleaning_pipeline(df, ops)

    # 1. Text normalize ran first: " Casablanca " and "CASABLANCA" became "casablanca"
    # 2. Category merge ran second on normalized values: "casa" -> "casablanca"
    # Final result: all Casablanca variants are unified
    assert res["df_cleaned"]["city"].tolist() == ["casablanca", "casablanca", "casablanca", "rabat"]

    # Inspect executed operations
    ops_exec = res["operations_executed"]
    assert ops_exec[0]["type"] == "TEXT_NORMALIZE"
    assert ops_exec[1]["type"] == "CATEGORY_MERGE"

    merge_params = ops_exec[1]["parameters"]
    # Categories before merge must show the state at the moment of fusion (post-normalization)
    assert "categories_before" in merge_params
    assert set(merge_params["categories_before"]) == {"casa", "casablanca", "rabat"}
    # Categories after merge
    assert "categories_after" in merge_params
    assert set(merge_params["categories_after"]) == {"casablanca", "rabat"}



def test_empty_strings_handled_as_missing_in_profiling(tmp_path):
    # Test dataset with empty strings in city
    df = pd.DataFrame({
        "id": [1, 2, 3, 4, 5, 6],
        "income": [100.0, np.nan, 300.0, 400.0, 500.0, 600.0],  # 1 null
        "age": [20.0, 30.0, np.nan, 40.0, 50.0, 60.0],          # 1 null
        "city": ["Casablanca", "", "   ", "Rabat", "Tanger", ""], # 3 empty strings
    })

    file_path = tmp_path / "test_missing.parquet"
    table = pa.Table.from_pandas(df)
    pq.write_table(table, file_path)

    profile = profiling_service.profile_parquet_file(file_path)
    cols = {c["name"]: c for c in profile["columns"]}

    # City must have 3 missing values detected from empty strings
    assert cols["city"]["null_count"] == 3
    assert cols["income"]["null_count"] == 1
    assert cols["age"]["null_count"] == 1

    # Findings must report missing values in 3 columns
    missing_finding = next((f for f in profile["findings"] if "Valeurs manquantes" in f["title"]), None)
    assert missing_finding is not None
    assert "3 colonnes" in missing_finding["title"]


def test_noop_detection(sample_df):
    # An operation that changes nothing (e.g. keeping first on a dataset without duplicates)
    df_no_dups = sample_df.iloc[:4].copy()
    res = cleaning_service.execute_cleaning_pipeline(
        df_no_dups,
        [{"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}}],
    )
    assert res["is_noop"] is True
    assert res["rows_affected"] == 0


def test_target_column_protection(sample_df):
    # Operating on the target column directly triggers target_affected
    res = cleaning_service.execute_cleaning_pipeline(
        sample_df,
        [{"type": "HANDLE_MISSING", "column": "churn", "parameters": {"strategy": "mode"}}],
        target_column="churn",
    )
    assert res["target_affected"] is True


def test_apply_cleaning_and_create_version_end_to_end(db_session, tmp_path):
    from app.models.dataset import Dataset
    from app.models.dataset_version import DatasetVersion
    from app.models.transformation import Transformation
    from app.services.parquet_service import parquet_service
    from app.services.storage_service import storage_service
    from app.services.lineage_service import lineage_service

    # 1. Create a Dataset
    dataset = Dataset(name="test_cleaning_ds", description="Dataset pour test de nettoyage")
    db_session.add(dataset)
    db_session.commit()
    db_session.refresh(dataset)

    # 2. Ingest initial version (v1) with duplicates, missing values, and outliers
    csv_content = (
        "id,name,city,charges,churn\n"
        "1, Alice ,Casablanca,50.0,0\n"
        "2,bôb,casa,60.0,1\n"
        "3,Charlie,CASABLANCA,55.0,0\n"
        "4, David,,52.0,1\n"
        "5, David,Rabat,1500.0,0\n"
        "5, David,Rabat,1500.0,0\n"  # Exact duplicate
    )
    parquet_bytes, metadata, row_count = parquet_service.convert_csv_to_parquet_bytes(csv_content.encode("utf-8"))
    data_hash_v1 = parquet_service.calculate_bytes_hash(parquet_bytes)

    v1_hash = lineage_service.generate_version_hash(
        dataset_id=dataset.id,
        parent_version_hash=None,
        transformation_name="CSV_INGESTION",
        parameters={"filename": "test_churn.csv"},
        data_hash=data_hash_v1,
    )
    v1_path = storage_service.get_version_parquet_path(dataset.id, v1_hash)
    parquet_service.save_parquet(parquet_bytes, v1_path)

    v1 = DatasetVersion(
        dataset_id=dataset.id,
        version_hash=v1_hash,
        storage_path=str(v1_path),
        row_count=row_count,
        size_bytes=len(parquet_bytes),
        schema_metadata=metadata,
    )
    db_session.add(v1)
    db_session.flush()

    t1 = Transformation(
        name="CSV_INGESTION",
        parameters={"filename": "test_churn.csv", "compression": "snappy"},
        source_version_id=None,
        target_version_id=v1.id,
        execution_time_ms=10.0,
    )
    db_session.add(t1)
    db_session.commit()
    db_session.refresh(v1)

    # 3. Apply a cleaning pipeline without confirmation when target is affected -> must raise ValueError
    ops = [
        {"type": "TEXT_NORMALIZE", "column": "name", "parameters": {"lowercase": True, "strip": True, "remove_accents": True}},
        {"type": "CATEGORY_MERGE", "column": "city", "parameters": {"mapping": {"casa": "Casablanca", "CASABLANCA": "Casablanca"}}},
        {"type": "HANDLE_MISSING", "column": "city", "parameters": {"strategy": "constant", "fill_value": "Casablanca"}},
        {"type": "HANDLE_OUTLIERS", "column": "charges", "parameters": {"strategy": "clip"}},
        {"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}},
    ]

    with pytest.raises(ValueError, match="colonne cible 'churn' est modifiée"):
        cleaning_service.apply_cleaning_and_create_version(
            db=db_session,
            source_version=v1,
            operations=ops,
            target_column="churn",
            confirm_target_modification=False,
        )

    # 4. Now apply with confirm_target_modification=True -> must succeed
    result = cleaning_service.apply_cleaning_and_create_version(
        db=db_session,
        source_version=v1,
        operations=ops,
        target_column="churn",
        confirm_target_modification=True,
    )

    v2 = result["new_version"]
    assert v2.parent_version_id == v1.id
    assert v2.version_hash != v1.version_hash
    assert v2.row_count == 5  # 1 duplicate dropped
    assert Path(v2.storage_path).exists()

    # Transformation recorded with exact computed values
    trans = result["transformation"]
    assert trans.name == "CLEANING_PIPELINE"
    assert "operations" in trans.parameters
    assert trans.parameters["initial_row_count"] == 6
    assert trans.parameters["final_row_count"] == 5

    # New profile computed and stored immediately
    after_profile = result["after_profile"]
    assert after_profile is not None
    assert after_profile["version_hash"] == v2.version_hash
    assert after_profile["original_filename"] == "test_churn.csv"
    assert after_profile["summary"]["duplicate_rows_count"] == 0

    # 4. Applying no-op on v2 must raise ValueError
    with pytest.raises(ValueError, match="Aucune donnée modifiée"):
        cleaning_service.apply_cleaning_and_create_version(
            db=db_session,
            source_version=v2,
            operations=[{"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}}],
        )


def test_cleaning_api_preview_and_apply_endpoints(client):
    """Integration test for POST /cleaning/preview and POST /cleaning/apply endpoints."""
    # 1. Ingest raw dataset with duplicate and outliers
    csv_data = (
        "id,city,age,churn\n"
        "1, Casablanca ,25,0\n"
        "2,casa,30,1\n"
        "3,CASABLANCA,35,0\n"
        "4,Rabat,150,0\n"
        "4,Rabat,150,0\n"  # Duplicate
    )
    files = {"file": ("test_churn.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    data = {"name": "test_api_cleaning_ds", "description": "API Cleaning Test"}
    upload_resp = client.post("/api/v1/datasets/upload-raw", data=data, files=files)
    assert upload_resp.status_code == 201
    ds_json = upload_resp.json()
    v1_hash = ds_json["versions"][0]["version_hash"]

    # 2. Test GET /cleaning/categories
    cat_resp = client.get(f"/api/v1/cleaning/categories?version_hash={v1_hash}&column=city")
    assert cat_resp.status_code == 200
    assert cat_resp.json()["total_unique"] == 4

    # 3. Test POST /cleaning/preview
    preview_payload = {
        "source_version_hash": v1_hash,
        "target_column": "churn",
        "operations": [
            {"type": "TEXT_NORMALIZE", "column": "city", "parameters": {"lowercase": True, "strip": True, "remove_accents": True}},
            {"type": "CATEGORY_MERGE", "column": "city", "parameters": {"mapping": {"casa": "casablanca"}}},
            {"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}},
        ],
    }
    prev_resp = client.post("/api/v1/cleaning/preview", json=preview_payload)
    assert prev_resp.status_code == 200
    p_data = prev_resp.json()
    assert p_data["rows_before"] == 5
    assert p_data["rows_after"] == 4
    assert p_data["rows_affected"] > 0
    assert p_data["is_noop"] is False
    assert len(p_data["operations_executed"]) == 3
    # Check that merge operation preview shows categories_before at moment of merge
    merge_op = next(op for op in p_data["operations_executed"] if op["type"] == "CATEGORY_MERGE")
    assert set(merge_op["parameters"]["categories_before"]) == {"casa", "casablanca", "rabat"}
    assert set(merge_op["parameters"]["categories_after"]) == {"casablanca", "rabat"}

    # 4. Test POST /cleaning/apply
    apply_payload = {
        "source_version_hash": v1_hash,
        "target_column": "churn",
        "confirm_target_modification": True,
        "operations": [
            {"type": "TEXT_NORMALIZE", "column": "city", "parameters": {"lowercase": True, "strip": True, "remove_accents": True}},
            {"type": "CATEGORY_MERGE", "column": "city", "parameters": {"mapping": {"casa": "casablanca"}}},
            {"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}},
        ],
    }
    apply_resp = client.post("/api/v1/cleaning/apply", json=apply_payload)
    assert apply_resp.status_code == 201
    a_data = apply_resp.json()
    assert a_data["new_version_hash"] is not None
    assert a_data["new_version_hash"] != v1_hash
    assert a_data["rows_before"] == 5
    assert a_data["rows_after"] == 4
    assert a_data["parent_version_hash"] == v1_hash
    assert "health_score_delta" in a_data
    assert "sub_scores_delta" in a_data
    assert "before_profile" in a_data
    assert "after_profile" in a_data

    # Uniqueness should have increased because duplicates were removed
    assert a_data["after_profile"]["summary"]["duplicate_rows_count"] == 0


def test_churn_dataset_numbers_match_api_response(client):
    """Test de vérification stricte sur test_churn.csv :
    - 6 doublons
    - 3 colonnes avec valeurs manquantes (income: 28, city: 5, age: 2)
    - 256 -> 250 lignes après application de la suppression des doublons
    - Cas incertain 'casa' (8 lignes) détecté avec applied_by_default=False
    - Échoue immédiatement si un seul chiffre ne correspond pas à la vérité des données.
    """
    csv_file = Path(__file__).parent / "test_churn.csv"
    assert csv_file.exists(), "Le fichier de test test_churn.csv doit exister."

    # 1. Ingestion de test_churn.csv
    with open(csv_file, "rb") as f:
        upload_resp = client.post(
            "/api/v1/datasets/upload-raw",
            data={"name": "test_churn_strict_verification", "description": "Verification data numbers"},
            files={"file": ("test_churn.csv", f, "text/csv")},
        )
    assert upload_resp.status_code == 201, f"Échec de l'upload: {upload_resp.text}"
    upload_data = upload_resp.json()
    v1_hash = upload_data["versions"][0]["version_hash"]

    # 2. Vérification du profil de v1
    prof_resp = client.get(f"/api/v1/versions/{v1_hash}/profile")
    assert prof_resp.status_code == 200, f"Échec du profil: {prof_resp.text}"
    profile = prof_resp.json()

    # Exactement 256 lignes initiales
    assert profile["summary"]["total_rows"] == 256, (
        f"Attendu 256 lignes, reçu {profile['summary']['total_rows']}"
    )

    # Exactement 6 doublons
    assert profile["summary"]["duplicate_rows_count"] == 6, (
        f"Attendu 6 doublons, reçu {profile['summary']['duplicate_rows_count']}"
    )

    # Exactement 3 colonnes avec valeurs manquantes
    cols = {c["name"]: c for c in profile["columns"]}
    missing_cols = {name: col["null_count"] for name, col in cols.items() if col["null_count"] > 0}
    assert len(missing_cols) == 3, (
        f"Attendu exactement 3 colonnes avec valeurs manquantes, trouvé {len(missing_cols)}: {missing_cols}"
    )
    assert set(missing_cols.keys()) == {"income", "city", "age"}, (
        f"Colonnes avec manquants inattendues: {set(missing_cols.keys())}"
    )
    assert missing_cols["income"] == 28, f"Attendu 28 manquants pour income, reçu {missing_cols['income']}"
    assert missing_cols["city"] == 5, f"Attendu 5 manquants pour city (cases vides), reçu {missing_cols['city']}"
    assert missing_cols["age"] == 2, f"Attendu 2 manquants pour age, reçu {missing_cols['age']}"

    # 3. Vérification des catégories pour la colonne city
    cat_resp = client.get(f"/api/v1/cleaning/categories?version_hash={v1_hash}&column=city")
    assert cat_resp.status_code == 200
    cat_data = cat_resp.json()

    # Vérification du cas incertain 'casa' (8 lignes)
    uncertain = cat_data.get("uncertain_mappings", [])
    casa_uncertain = next((u for u in uncertain if u["from"] == "casa"), None)
    assert casa_uncertain is not None, "Le mapping incertain 'casa' doit être détecté"
    assert casa_uncertain["to"] == "Casablanca"
    assert casa_uncertain["rows"] == 8, f"Attendu 8 lignes pour 'casa', reçu {casa_uncertain['rows']}"
    assert casa_uncertain["is_uncertain"] is True
    assert casa_uncertain["applied_by_default"] is False, "Les cas incertains ne doivent JAMAIS être appliqués par défaut"

    # 4. Prévisualisation /preview de la suppression des doublons
    preview_resp = client.post(
        "/api/v1/cleaning/preview",
        json={
            "source_version_hash": v1_hash,
            "target_column": "churn",
            "operations": [{"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}}],
        },
    )
    assert preview_resp.status_code == 200
    prev_data = preview_resp.json()
    assert prev_data["rows_before"] == 256, f"Attendu rows_before=256, reçu {prev_data['rows_before']}"
    assert prev_data["rows_after"] == 250, f"Attendu rows_after=250, reçu {prev_data['rows_after']}"
    assert prev_data["rows_affected"] == 6, f"Attendu rows_affected=6, reçu {prev_data['rows_affected']}"
    assert prev_data["is_noop"] is False

    # 5. Application /apply et création de la version nettoyée
    apply_resp = client.post(
        "/api/v1/cleaning/apply",
        json={
            "source_version_hash": v1_hash,
            "target_column": "churn",
            "confirm_target_modification": False,
            "operations": [{"type": "DROP_DUPLICATES", "parameters": {"keep": "first"}}],
        },
    )
    assert apply_resp.status_code == 201, f"Échec de l'application: {apply_resp.text}"
    app_data = apply_resp.json()

    assert app_data["rows_before"] == 256, f"Attendu rows_before=256, reçu {app_data['rows_before']}"
    assert app_data["rows_after"] == 250, f"Attendu rows_after=250 (256 -> 250), reçu {app_data['rows_after']}"
    assert app_data["rows_affected"] == 6, f"Attendu rows_affected=6, reçu {app_data['rows_affected']}"
    assert app_data["parent_version_hash"] == v1_hash
    assert app_data["new_version_hash"] != v1_hash

    # Le profil post-nettoyage doit confirmer 250 lignes et 0 doublon
    after_summary = app_data["after_profile"]["summary"]
    assert after_summary["total_rows"] == 250
    assert after_summary["duplicate_rows_count"] == 0



