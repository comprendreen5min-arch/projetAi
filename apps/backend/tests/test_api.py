import io


def test_create_and_list_datasets(client):
    response = client.post("/api/v1/datasets/", json={"name": "mnist_features", "description": "Features extraites"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "mnist_features"
    assert "id" in data

    list_response = client.get("/api/v1/datasets/")
    assert list_response.status_code == 200
    datasets = list_response.json()
    assert len(datasets) == 1
    assert datasets[0]["name"] == "mnist_features"


def test_upload_csv_converts_to_parquet_and_diff(client, sample_csv_content):
    # 1. Create dataset
    ds_res = client.post("/api/v1/datasets/", json={"name": "tabular_ai_data", "description": "Benchmark tabular"})
    assert ds_res.status_code == 201
    dataset_id = ds_res.json()["id"]

    # 2. Upload CSV
    files = {"file": ("data.csv", sample_csv_content, "text/csv")}
    upload_res = client.post(f"/api/v1/datasets/{dataset_id}/upload", files=files)
    assert upload_res.status_code == 201
    version_data = upload_res.json()
    
    assert "version_hash" in version_data
    assert len(version_data["version_hash"]) == 64
    assert version_data["row_count"] == 5
    assert version_data["parent_version_id"] is None
    assert version_data["transformation_produced"]["name"] == "CSV_INGESTION"

    version_hash = version_data["version_hash"]
    version_id = version_data["id"]

    # 3. Check version details and preview
    detail_res = client.get(f"/api/v1/versions/hash/{version_hash}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert len(detail_data["sample_rows"]) == 5
    assert detail_data["sample_rows"][0]["feature_a"] == 10.5

    # 4. Apply a transformation (filter rows with query)
    transform_payload = {
        "transformation_name": "FILTER_QUERY",
        "parameters": {"query": "feature_a > 15.0"},
    }
    transform_res = client.post(f"/api/v1/transformations/apply/{version_id}", json=transform_payload)
    assert transform_res.status_code == 201
    new_version = transform_res.json()

    # The new version must be immutable and have a distinct hash
    assert new_version["version_hash"] != version_hash
    assert new_version["parent_version_id"] == version_id
    assert new_version["row_count"] == 4

    # 5. Test version diff / drift detection
    diff_res = client.get(f"/api/v1/versions/diff?base_hash={version_hash}&target_hash={new_version['version_hash']}")
    assert diff_res.status_code == 200
    diff_data = diff_res.json()
    assert diff_data["row_count_before"] == 5
    assert diff_data["row_count_after"] == 4
    assert diff_data["row_count_delta"] == -1

    # 6. Verify download endpoint
    dl_res = client.get(f"/api/v1/versions/download/{version_hash}")
    assert dl_res.status_code == 200
    assert len(dl_res.content) > 0


def test_upload_invalid_file_extension(client):
    ds_res = client.post("/api/v1/datasets/", json={"name": "invalid_test"})
    dataset_id = ds_res.json()["id"]

    files = {"file": ("image.png", b"fake_png_content", "image/png")}
    res = client.post(f"/api/v1/datasets/{dataset_id}/upload", files=files)
    assert res.status_code == 400
    assert "CSV" in res.json()["detail"]


def test_upload_same_csv_to_two_different_datasets_via_raw(client, sample_csv_content):
    """Bug regression test: uploading the exact same CSV into two different datasets
    must succeed for both and must NOT leave either dataset empty.
    """
    # 1. Upload to Dataset 1 via upload-raw
    files_1 = {"file": ("dataset.csv", sample_csv_content, "text/csv")}
    data_1 = {"name": "dataset_alpha", "description": "Premier dataset"}
    res_1 = client.post("/api/v1/datasets/upload-raw", data=data_1, files=files_1)
    assert res_1.status_code == 201
    ds_1 = res_1.json()
    assert ds_1["name"] == "dataset_alpha"
    assert ds_1["version_count"] == 1
    assert len(ds_1["versions"]) == 1
    assert ds_1["versions"][0]["row_count"] == 5

    # 2. Upload the exact same CSV to Dataset 2 via upload-raw
    files_2 = {"file": ("dataset.csv", sample_csv_content, "text/csv")}
    data_2 = {"name": "dataset_beta", "description": "Deuxième dataset avec mêmes données"}
    res_2 = client.post("/api/v1/datasets/upload-raw", data=data_2, files=files_2)
    assert res_2.status_code == 201
    ds_2 = res_2.json()
    assert ds_2["name"] == "dataset_beta"
    assert ds_2["version_count"] == 1
    assert len(ds_2["versions"]) == 1
    assert ds_2["versions"][0]["row_count"] == 5

    # 3. Verify both datasets can be independently queried and have their versions
    get_1 = client.get(f"/api/v1/datasets/{ds_1['id']}")
    assert get_1.status_code == 200
    assert get_1.json()["version_count"] == 1

    get_2 = client.get(f"/api/v1/datasets/{ds_2['id']}")
    assert get_2.status_code == 200
    assert get_2.json()["version_count"] == 1


def test_upload_same_csv_to_two_existing_datasets(client, sample_csv_content):
    """Verify that two independently created datasets can receive the exact same CSV."""
    # Create two datasets
    ds1_res = client.post("/api/v1/datasets/", json={"name": "exp_model_a"})
    assert ds1_res.status_code == 201
    id_1 = ds1_res.json()["id"]

    ds2_res = client.post("/api/v1/datasets/", json={"name": "exp_model_b"})
    assert ds2_res.status_code == 201
    id_2 = ds2_res.json()["id"]

    # Upload same CSV to both
    f1 = {"file": ("training.csv", sample_csv_content, "text/csv")}
    up1 = client.post(f"/api/v1/datasets/{id_1}/upload", files=f1)
    assert up1.status_code == 201
    ver1 = up1.json()

    f2 = {"file": ("training.csv", sample_csv_content, "text/csv")}
    up2 = client.post(f"/api/v1/datasets/{id_2}/upload", files=f2)
    assert up2.status_code == 201
    ver2 = up2.json()

    assert ver1["dataset_id"] == id_1
    assert ver2["dataset_id"] == id_2
    assert ver1["row_count"] == 5
    assert ver2["row_count"] == 5


def test_upload_failure_does_not_leave_empty_dataset(client):
    """When upload-raw fails (e.g. invalid extension or empty file),
    no empty dataset should be left in the database (atomic creation).
    """
    # Attempt upload with invalid file extension
    files = {"file": ("corrupt.pdf", b"%PDF-1.4...", "application/pdf")}
    data = {"name": "ghost_dataset", "description": "Should never exist"}
    res = client.post("/api/v1/datasets/upload-raw", data=data, files=files)
    assert res.status_code == 400

    # Verify that ghost_dataset was NOT created in DB
    list_res = client.get("/api/v1/datasets/")
    assert list_res.status_code == 200
    dataset_names = [d["name"] for d in list_res.json()]
    assert "ghost_dataset" not in dataset_names
