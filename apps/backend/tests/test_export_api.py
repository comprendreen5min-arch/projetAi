"""Tests for Step 09: Export / API endpoints."""
import pytest
from fastapi.testclient import TestClient


def test_get_export_state(client: TestClient, db_session):
    """Should return full export state for a valid dataset."""
    # First get a dataset
    datasets_resp = client.get("/api/v1/datasets/")
    assert datasets_resp.status_code == 200
    datasets = datasets_resp.json()
    if not datasets:
        pytest.skip("No datasets in DB")

    ds_id = datasets[0]["id"]
    resp = client.get(f"/api/v1/export-api/{ds_id}/state")
    assert resp.status_code == 200
    data = resp.json()

    # Check required top-level keys
    assert "header" in data
    assert "dataset_versions" in data
    assert "export_options" in data
    assert "dataset_formats" in data
    assert "model_package_formats" in data
    assert "deploy_steps" in data
    assert "deploy_options" in data
    assert "api_keys" in data
    assert "webhook_events" in data
    assert "version_traffic" in data
    assert "guardrails" in data
    assert "endpoint_url" in data

    # Check header fields
    hdr = data["header"]
    assert "candidate_model" in hdr
    assert "production_model" in hdr
    assert "threshold" in hdr
    assert isinstance(hdr["threshold"], float)

    # Verify 4 data formats
    assert len(data["dataset_formats"]) == 4
    # At least one selected
    assert any(f["is_selected"] for f in data["dataset_formats"])

    # Verify 4 model formats
    assert len(data["model_package_formats"]) == 4
    assert any(f["is_selected"] for f in data["model_package_formats"])

    # Verify deploy steps
    assert len(data["deploy_steps"]) == 6

    # Verify guardrails
    assert len(data["guardrails"]) == 8


def test_update_export_settings(client: TestClient, db_session):
    """Should update data_format and return updated state."""
    datasets_resp = client.get("/api/v1/datasets/")
    assert datasets_resp.status_code == 200
    datasets = datasets_resp.json()
    if not datasets:
        pytest.skip("No datasets in DB")

    ds_id = datasets[0]["id"]

    # Update data format to csv
    resp = client.put(f"/api/v1/export-api/{ds_id}/settings", json={"data_format": "csv"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_data_format"] == "csv"
    csv_fmt = next(f for f in data["dataset_formats"] if f["format_id"] == "csv")
    assert csv_fmt["is_selected"] is True

    # Restore to parquet
    resp2 = client.put(f"/api/v1/export-api/{ds_id}/settings", json={"data_format": "parquet"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["selected_data_format"] == "parquet"


def test_deploy_to_staging(client: TestClient, db_session):
    """Should return success deploy response."""
    datasets_resp = client.get("/api/v1/datasets/")
    assert datasets_resp.status_code == 200
    datasets = datasets_resp.json()
    if not datasets:
        pytest.skip("No datasets in DB")

    ds_id = datasets[0]["id"]
    resp = client.post(f"/api/v1/export-api/{ds_id}/deploy-staging")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "endpoint_url" in data
    assert "model_name" in data

