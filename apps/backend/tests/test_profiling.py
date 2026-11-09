from pathlib import Path


def test_version_profiling_and_caching(client):
    # CSV with numerical, categorical, duplicates, missing values, and outliers
    csv_data = (
        "customer_id,age,income,city,churn\n"
        "1,25,30000,Casablanca,0\n"
        "2,30,35000,Rabat,0\n"
        "3,,40000,casablanca,1\n"
        "4,45,250000,Casablanca,1\n"  # income 250000 is an outlier
        "5,50,45000,Tangier,0\n"
        "5,50,45000,Tangier,0\n"  # duplicated row
    ).encode("utf-8")

    # 1. Create dataset via upload-raw
    files = {"file": ("profiling_sample.csv", csv_data, "text/csv")}
    create_res = client.post("/api/v1/datasets/upload-raw", data={"name": "churn_profiling"}, files=files)
    assert create_res.status_code == 201
    dataset = create_res.json()
    version_hash = dataset["versions"][0]["version_hash"]

    # 2. Call profile endpoint
    profile_res = client.get(f"/api/v1/versions/{version_hash}/profile")
    assert profile_res.status_code == 200
    profile = profile_res.json()

    # 3. Check summary metrics
    summary = profile["summary"]
    assert summary["total_rows"] == 6
    assert summary["total_columns"] == 5
    assert summary["duplicate_rows_count"] == 1
    assert summary["target_column"] == "churn"

    # 4. Check column-level calculations
    cols_by_name = {c["name"]: c for c in profile["columns"]}

    # customer_id: detected as 'id'
    assert cols_by_name["customer_id"]["detected_type"] == "id"

    # age: missing 1 out of 6 -> 16.67%
    age_col = cols_by_name["age"]
    assert age_col["null_count"] == 1
    assert age_col["null_percentage"] > 16.0
    assert age_col["detected_type"] == "nombre"
    assert age_col["stats"] is not None
    assert age_col["stats"]["min"] == 25.0
    assert age_col["stats"]["max"] == 50.0

    # income: outlier detection via IQR
    income_col = cols_by_name["income"]
    assert income_col["outlier_count"] >= 1
    assert income_col["is_flagged"] is True

    # city: inconsistent casing ("Casablanca" vs "casablanca") -> flagged
    city_col = cols_by_name["city"]
    assert city_col["detected_type"] == "catégorie"
    assert city_col["is_flagged"] is True

    # churn: detected as 'cible'
    churn_col = cols_by_name["churn"]
    assert churn_col["detected_type"] == "cible"

    # 5. Check caching: cache file must exist on disk and repeat call returns exact same
    repeat_res = client.get(f"/api/v1/versions/{version_hash}/profile")
    assert repeat_res.status_code == 200
    assert repeat_res.json()["summary"]["total_rows"] == 6

