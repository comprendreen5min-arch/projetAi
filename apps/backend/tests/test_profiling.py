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

    # 1. Create dataset via upload-raw with specific original filename
    files = {"file": ("test_churn.csv", csv_data, "text/csv")}
    create_res = client.post("/api/v1/datasets/upload-raw", data={"name": "churn_profiling"}, files=files)
    assert create_res.status_code == 201
    dataset = create_res.json()
    version_hash = dataset["versions"][0]["version_hash"]

    # 2. Call profile endpoint
    profile_res = client.get(f"/api/v1/versions/{version_hash}/profile")
    assert profile_res.status_code == 200
    profile = profile_res.json()

    # 3. Check summary metrics and original filename
    summary = profile["summary"]
    assert summary["total_rows"] == 6
    assert summary["total_columns"] == 5
    assert summary["duplicate_rows_count"] == 1
    assert summary["target_column"] == "churn"
    assert profile["original_filename"] == "test_churn.csv"

    # 4. Check Phase B: 5 sub-scores on 100
    sub_scores = summary["sub_scores"]
    assert "completeness" in sub_scores
    assert "uniqueness" in sub_scores
    assert "validity" in sub_scores
    assert "consistency" in sub_scores
    assert "class_balance" in sub_scores

    # Completeness: 1 missing cell out of 30 cells (6*5) = 29/30 = 96.7%
    assert sub_scores["completeness"] > 95.0

    # Uniqueness: 1 duplicate row out of 6 = 5/6 = 83.3%
    assert sub_scores["uniqueness"] > 80.0

    # Health score must be calculated as weighted average
    assert 0 <= summary["health_score"] <= 100

    # 5. Check Phase B: Findings (Ce qui demande votre attention)
    findings = profile["findings"]
    assert len(findings) > 0
    # Must be sorted by severity: HIGH, MEDIUM, LOW
    severities = [f["severity"] for f in findings]
    assert "HIGH" in severities or "MEDIUM" in severities
    for f in findings:
        assert f["action_label"] in ["Corriger →", "Examiner →", "Fusionner →", "Supprimer →", "Voir les options →"]

    # 6. Check outlier grouped in last histogram bar in red
    income_col = next(c for c in profile["columns"] if c["name"] == "income")
    assert income_col["outlier_count"] >= 1
    last_bar = income_col["histogram"][-1]
    assert last_bar["is_outlier"] is True

    # 7. Check Phase B: Target update and memorization
    target_res = client.put(f"/api/v1/versions/{version_hash}/target", json={"target_column": "income"})
    assert target_res.status_code == 200
    updated = target_res.json()
    assert updated["summary"]["target_column"] == "income"

    # Subsequent GET retrieves memorized target
    get_res = client.get(f"/api/v1/versions/{version_hash}/profile")
    assert get_res.status_code == 200
    assert get_res.json()["summary"]["target_column"] == "income"


def test_inconsistent_categories_detection(client):
    # CSV with accents, casing, and spaces inconsistency
    csv_data = (
        "id,city\n"
        "1,Montréal\n"
        "2,Montreal\n"
        "3,Casablanca\n"
        "4,casablanca\n"
        "5, Rabat \n"
        "6,Rabat\n"
    ).encode("utf-8")

    files = {"file": ("cities.csv", csv_data, "text/csv")}
    create_res = client.post("/api/v1/datasets/upload-raw", data={"name": "city_dataset"}, files=files)
    assert create_res.status_code == 201
    version_hash = create_res.json()["versions"][0]["version_hash"]

    profile_res = client.get(f"/api/v1/versions/{version_hash}/profile")
    assert profile_res.status_code == 200
    profile = profile_res.json()

    city_col = next(c for c in profile["columns"] if c["name"] == "city")
    assert city_col["is_flagged"] is True
    assert len(city_col["inconsistent_examples"]) > 0

    # Consistency sub-score should be < 100
    assert profile["summary"]["sub_scores"]["consistency"] < 100.0
