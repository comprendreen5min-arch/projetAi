import logging
import secrets
import re
import json
from pathlib import Path
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone

import pandas as pd
import pyarrow.parquet as pq

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.export_api import ExportApiRun
from app.models.training_run import TrainingRun
from app.schemas.export_api import (
    ApiKey,
    CreateApiKeyResponse,
    DatasetVersionExportItem,
    DeployOption,
    DeployStep,
    DeployToStagingResponse,
    ExportApiStateResponse,
    ExportDatasetOptions,
    ExportGuardrailItem,
    ExportHeaderSummary,
    ModelPackageFormat,
    UpdateExportSettingsRequest,
    VersionTrafficRow,
    WebhookEvent,
)

logger = logging.getLogger(__name__)


class ExportApiService:

    def _get_dataset(self, dataset_id: str, db: Session) -> Dataset:
        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not ds:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        return ds

    def _get_or_create_run(self, dataset_id: str, db: Session) -> ExportApiRun:
        run = db.query(ExportApiRun).filter(ExportApiRun.dataset_id == dataset_id).first()
        if not run:
            run = ExportApiRun(
                dataset_id=dataset_id,
                model_format="docker",
                data_format="parquet",
                deploy_target="hosted",
                export_options={},
                api_keys=[
                    {"name": "CRM scoring", "key_masked": "dl_live_...c8f2", "scope": "predict", "status": "LIVE", "last_used": "2 min ago"},
                    {"name": "Analyst notebook", "key_masked": "dl_live_...a3b1", "scope": "read", "status": "LIVE", "last_used": "1 hour ago"},
                    {"name": "Staging tests", "key_masked": "dl_test_...9d4e", "scope": "predict", "status": "TEST", "last_used": "yesterday"},
                ],
                webhooks={
                    "dataset.version_tagged": True,
                    "model.promoted": True,
                    "drift.alert": True,
                    "predict.batch_done": False,
                },
            )
            db.add(run)
            db.commit()
            db.refresh(run)
        return run

    def _get_training_runs(self, dataset_id: str, db: Session):
        runs = (
            db.query(TrainingRun)
            .filter(TrainingRun.dataset_id == dataset_id)
            .order_by(TrainingRun.created_at.desc())
            .all()
        )
        prod = next((r for r in runs if r.tag == "production"), None)
        candidate = next((r for r in runs if r.tag == "candidate"), None)
        if not candidate and runs:
            candidate = runs[0]
        if not prod and runs:
            prod = runs[1] if len(runs) > 1 else runs[0]
        return prod, candidate

    def _slugify(self, name: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    def _build_state(self, ds: Dataset, run: ExportApiRun, db: Session) -> ExportApiStateResponse:
        prod_run, cand_run = self._get_training_runs(str(ds.id), db)

        ds_name = ds.name
        ds_slug = self._slugify(ds_name)

        # Model names
        cand_name = cand_run.run_name if cand_run else f"{ds_slug}-xgb-08"
        prod_name = prod_run.run_name if prod_run else f"{ds_slug}-xgb-07"

        # Threshold & target
        threshold = 0.42
        if cand_run and cand_run.threshold is not None:
            threshold = cand_run.threshold
        elif prod_run and prod_run.threshold is not None:
            threshold = prod_run.threshold

        # Target & feature columns from version schema metadata or parquet
        active_ver = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == str(ds.id))
            .order_by(DatasetVersion.created_at.desc())
            .first()
        )
        df = None
        schema_cols: List[str] = []
        if active_ver and active_ver.storage_path and Path(active_ver.storage_path).exists():
            try:
                df = pq.read_table(active_ver.storage_path).to_pandas()
                schema_cols = list(df.columns)
            except Exception:
                df = None

        if not schema_cols and active_ver and active_ver.schema_metadata and isinstance(active_ver.schema_metadata, dict):
            cols_meta = active_ver.schema_metadata.get("columns", [])
            if isinstance(cols_meta, list):
                for c in cols_meta:
                    if isinstance(c, dict) and "name" in c:
                        schema_cols.append(c["name"])
                    elif isinstance(c, str):
                        schema_cols.append(c)

        target_col = "target"
        if cand_run and cand_run.target_column:
            target_col = cand_run.target_column
        elif prod_run and prod_run.target_column:
            target_col = prod_run.target_column
        else:
            for c in ["churned", "churn", "souscrit", "target", "label"]:
                if c in schema_cols:
                    target_col = c
                    break

        tech_cols = {"split", "is_synthetic", "origin", "parent_ids"}
        id_candidates = ["customer_id", "client_id", "id", "user_id", "subscriber_id"]
        id_col = None
        if schema_cols:
            id_col = next((c for c in schema_cols if c.lower() in id_candidates), None)
            if not id_col and df is not None and len(df.columns) > 0 and (df.iloc[:, 0].dtype == "object"):
                id_col = df.columns[0]
        if not id_col:
            id_col = "customer_id"

        feature_cols: List[str] = [c for c in schema_cols if c != target_col and c != id_col and c not in tech_cols]
        if not feature_cols and schema_cols:
            feature_cols = [c for c in schema_cols if c != target_col]
        if not feature_cols:
            feature_cols = ["contract", "monthly_charges", "tenure", "city"]

        col_count = len(feature_cols) + 1  # +1 for target

        # Data version label from prod model
        data_version = "v4"
        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == str(ds.id))
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if versions:
            data_version = f"v{len(versions)}"

        dataset_versions = []
        total_v = len(versions)
        for i, v in enumerate(versions[:5]):
            vnum = total_v - i
            vlabel = f"v{vnum}"
            row_count = v.row_count if v.row_count else (len(df) if df is not None else 0)
            if i == 0 and getattr(v, "is_draft", False):
                state = "DRAFT"
                made_from = "07 round 2 · not tagged yet"
                row_str = f"+ {row_count:,} rows" if row_count else "+ 6,440 rows"
                is_current = False
                is_tagged = False
            elif i == 0 or (i == 1 and getattr(versions[0], "is_draft", False)):
                state = "CURRENT"
                made_from = f"v{vnum-1} + 96 labels fixed in 05" if vnum > 1 else "initial import"
                row_str = f"{row_count:,} rows" if row_count else "148,828 rows"
                is_current = True
                is_tagged = False
            else:
                state = "TAGGED"
                made_from = f"used by {prod_name}"
                row_str = f"{row_count:,} rows" if row_count else "[RESULT]"
                is_current = False
                is_tagged = True

            dataset_versions.append(
                DatasetVersionExportItem(
                    version_label=vlabel,
                    row_count=row_str,
                    made_from=made_from,
                    state=state,
                    is_current=is_current,
                    is_tagged=is_tagged,
                )
            )

        if not dataset_versions:
            dataset_versions = [
                DatasetVersionExportItem(version_label="v5", row_count="+ 6,440 rows", made_from="07 round 2 · not tagged yet", state="DRAFT", is_current=False, is_tagged=False),
                DatasetVersionExportItem(version_label="v4", row_count="148,828 rows", made_from="v3 + 96 labels fixed in 05", state="CURRENT", is_current=True, is_tagged=False),
                DatasetVersionExportItem(version_label="v3", row_count="[RESULT]", made_from=f"used by {prod_name}", state="TAGGED", is_current=False, is_tagged=True),
            ]

        # Export options
        opts_raw = run.export_options or {}
        export_opts = ExportDatasetOptions(
            keep_splits=opts_raw.get("keep_splits", True),
            mask_pii=opts_raw.get("mask_pii", True),
            include_smote=opts_raw.get("include_smote", False),
            add_label_history=opts_raw.get("add_label_history", False),
            include_not_yet=opts_raw.get("include_not_yet", False),
        )

        cur_ver = next((v for v in dataset_versions if v.is_current), dataset_versions[0] if dataset_versions else None)
        cur_label = cur_ver.version_label if cur_ver else "v4"

        # Data formats
        data_formats = [
            ModelPackageFormat(format_id="csv", name="CSV", description="Opens anywhere, Excel included.", tag="", is_selected=run.data_format == "csv"),
            ModelPackageFormat(format_id="parquet", name="Parquet", description="Small and typed. Best for pandas and Spark.", tag="", is_selected=run.data_format == "parquet"),
            ModelPackageFormat(format_id="jsonlines", name="JSON Lines", description="One row per line, for pipelines.", tag="", is_selected=run.data_format == "jsonlines"),
            ModelPackageFormat(format_id="excel", name="Excel", description="One sheet per split, for business users.", tag="", is_selected=run.data_format == "excel"),
        ]
        if not any(f.is_selected for f in data_formats):
            data_formats[1] = data_formats[1].model_copy(update={"is_selected": True})

        # Model package formats
        model_formats = [
            ModelPackageFormat(format_id="pickle", name="Pickle", description="Python only. Fastest way to try the model in a notebook.", tag="ANALYSTS · NOTEBOOKS", is_selected=run.model_format == "pickle"),
            ModelPackageFormat(format_id="onnx", name="ONNX", description="Runs in any language with the same scores as in 06.", tag="YOUR OWN BACKEND", is_selected=run.model_format == "onnx"),
            ModelPackageFormat(format_id="docker", name="Docker image", description="A REST API ready to run on your server or ours.", tag="CRM SCORING · REAL TIME", is_selected=run.model_format == "docker"),
            ModelPackageFormat(format_id="batch", name="Batch job", description="Scores a CRM export every month and writes a CSV.", tag="MONTHLY RETENTION LIST", is_selected=run.model_format == "batch"),
        ]
        if not any(f.is_selected for f in model_formats):
            model_formats[2] = model_formats[2].model_copy(update={"is_selected": True})

        # Deploy steps
        deploy_steps = [
            DeployStep(step_number=1, title="BUILD", status="done", detail="Package built"),
            DeployStep(step_number=2, title="TEST", status="done", detail="1,000 locked rows"),
            DeployStep(step_number=3, title="STAGING", status="active", detail="Endpoint ready"),
            DeployStep(step_number=4, title="SHADOW", status="waiting", detail=f"Next to {prod_name}"),
            DeployStep(step_number=5, title="CANARY", status="waiting", detail="10% → 50% of calls"),
            DeployStep(step_number=6, title="PRODUCTION", status="waiting", detail="100% · after review"),
        ]

        # Deploy options
        deploy_options = [
            DeployOption(option_id="hosted", title="Hosted by Datalift", description="An HTTPS endpoint with keys and logs. Nothing to install.", is_selected=run.deploy_target == "hosted"),
            DeployOption(option_id="own_server", title="Your server", description="Pull the Docker image and run it next to the CRM. Logs can be sent back for drift.", is_selected=run.deploy_target == "own_server"),
            DeployOption(option_id="batch_folder", title="Batch to a folder", description="A CSV of scores dropped every month in S3 or a shared folder.", is_selected=run.deploy_target == "batch_folder"),
        ]
        if not any(o.is_selected for o in deploy_options):
            deploy_options[0] = deploy_options[0].model_copy(update={"is_selected": True})

        # API keys
        raw_keys = run.api_keys or []
        api_keys = [
            ApiKey(
                name=k.get("name", "Key"),
                key_masked=k.get("key_masked", "dl_live_...xxxx"),
                scope=k.get("scope", "predict"),
                status=k.get("status", "LIVE"),
                last_used=k.get("last_used", "never"),
            )
            for k in raw_keys
        ]

        # Webhooks
        wh_raw = run.webhooks or {}
        webhook_events = [
            WebhookEvent(event_name="dataset.version_tagged", description="a new version is tagged in 04", enabled=wh_raw.get("dataset.version_tagged", True)),
            WebhookEvent(event_name="model.promoted", description="a version reaches production", enabled=wh_raw.get("model.promoted", True)),
            WebhookEvent(event_name="drift.alert", description="an alert is raised in 08", enabled=wh_raw.get("drift.alert", True)),
            WebhookEvent(event_name="predict.batch_done", description="the monthly scoring file is ready", enabled=wh_raw.get("predict.batch_done", False)),
        ]

        # Version traffic matching Image 5
        cand_number = cand_name.split("-")[-1] if "-" in cand_name else "08"
        archived_name = f"{ds_slug}-xgb-06"
        version_traffic = [
            VersionTrafficRow(model_name=prod_name, runs_on="Hosted · production", status="PRODUCTION", traffic_pct=100, p95_ms=48, error_rate=0.1, action="Roll back to 06"),
            VersionTrafficRow(model_name=cand_name, runs_on="Hosted · staging", status="STAGING", traffic_pct=0, p95_ms=52, error_rate=0.0, action="Request promotion"),
            VersionTrafficRow(model_name=archived_name, runs_on="—", status="ARCHIVED", traffic_pct=0, p95_ms=0, error_rate=0.0, action="Restore"),
        ]

        # Guardrails matching Image 6
        guardrails = [
            ExportGuardrailItem(id="reviewed_model", status="ok", title="Only a reviewed model exports", description="Production needs a second person in 06"),
            ExportGuardrailItem(id="same_scores", status="ok", title="Same scores as in 06", description="Tested on 1,000 locked rows before publish"),
            ExportGuardrailItem(id="schema_door", status="ok", title="Schema checked at the door", description="Wrong types and unknown columns refused"),
            ExportGuardrailItem(id="masked_pii", status="ok", title="Personal data stays masked", description="In logs, in drift, in the 07 pool"),
            ExportGuardrailItem(id="shadow_switch", status="ok", title="Shadow before switch", description="The new model answers, nobody acts on it"),
            ExportGuardrailItem(id="rollback_click", status="ok", title="Roll back in one click", description="The previous version stays warm"),
            ExportGuardrailItem(id="keys_scoped", status="ok", title="Keys scoped per project", description="Shown once, revocable, never in logs"),
            ExportGuardrailItem(id="prod_status", status="warn", title=f"Production is still {prod_name}", description=f"{cand_number} is in staging · shadow not started"),
        ]

        # Build real sample payload from df
        sample_dict: Dict[str, Any] = {}
        if df is not None and len(df) > 0:
            row0 = df.iloc[0]
            if id_col in df.columns:
                sample_dict[id_col] = str(row0[id_col])
            else:
                sample_dict[id_col] = "C-412077"

            for c in feature_cols[:6]:
                val = row0[c]
                if pd.api.types.is_integer_dtype(df[c]):
                    sample_dict[c] = int(val)
                elif pd.api.types.is_float_dtype(df[c]):
                    sample_dict[c] = round(float(val), 2)
                elif isinstance(val, (int, float)):
                    sample_dict[c] = val
                else:
                    sample_dict[c] = str(val)
        else:
            sample_dict = {
                id_col: "C-412077",
                feature_cols[0]: "monthly",
                feature_cols[1] if len(feature_cols) > 1 else "charges": 389,
            }

        # Code snippets
        fmt = run.data_format or "parquet"
        endpoint_url = f"[YOUR DOMAIN]/v1/{ds_slug}/predict"
        ds_ver_label = cur_label

        python_snippet = (
            f"# Python\nimport datalift\ndf = datalift.load(\"{ds_name}@{ds_ver_label}\", split=\"train\")\n\n"
            f"# REST\nGET [YOUR DOMAIN]/v1/datasets/{ds_name}/{ds_ver_label}/export"
            f"?format={fmt}&split=all"
        )
        rest_snippet = (
            f"GET [YOUR DOMAIN]/v1/datasets/{ds_name}/{ds_ver_label}/export?format={fmt}&split=all"
        )

        cli_snippet = f"datalift export {cand_name} --format {run.model_format or 'docker-image'}"

        formatted_payload = json.dumps(sample_dict, indent=2)

        curl_snippet = (
            f"curl -X POST [YOUR DOMAIN]/v1/{ds_slug}/predict \\\n"
            f'  -H "Authorization: Bearer $DATALIFT_KEY" \\\n'
            f'  -H "Content-Type: application/json" \\\n'
            f"  -d '{formatted_payload}'"
        )

        python_req_snippet = (
            f"import requests\n\n"
            f'url = "https://[YOUR DOMAIN]/v1/{ds_slug}/predict"\n'
            f'headers = {{\n'
            f'  "Authorization": "Bearer $DATALIFT_KEY",\n'
            f'  "Content-Type": "application/json"\n'
            f'}}\n'
            f"payload = {formatted_payload}\n\n"
            f"response = requests.post(url, headers=headers, json=payload)\n"
            f"print(response.json())"
        )

        js_snippet = (
            f"const res = await fetch('https://[YOUR DOMAIN]/v1/{ds_slug}/predict', {{\n"
            f"  method: 'POST',\n"
            f"  headers: {{\n"
            f"    'Authorization': 'Bearer $DATALIFT_KEY',\n"
            f"    'Content-Type': 'application/json'\n"
            f"  }},\n"
            f"  body: JSON.stringify({formatted_payload})\n"
            f"}});\n"
            f"const data = await res.json();"
        )

        sample_id = sample_dict.get(id_col, "C-412077")
        top_reasons_str = json.dumps(feature_cols[:3])
        json_response = (
            f'{{\n'
            f'  "{id_col}": "{sample_id}",\n'
            f'  "p_yes": [RESULT],\n'
            f'  "{target_col}": [RESULT],\n'
            f'  "threshold": {threshold},\n'
            f'  "reasons": {top_reasons_str},\n'
            f'  "model": "{cand_name}",\n'
            f'  "data_version": "{cur_label}"\n'
            f'}}'
        )

        header = ExportHeaderSummary(
            breadcrumb=f"EXPORT · {cand_name.upper()} · CANDIDATE FROM 06 · THRESHOLD {threshold} · DATA {cur_label.upper()}",
            candidate_model=cand_name,
            production_model=prod_name,
            model_type="XGBoost",
            threshold=threshold,
            data_version=cur_label,
            versions_live=2,
            endpoint="staging",
            calls_7d="[RESULT]",
            approved_step="APPROVED IN 06",
            feature_columns=feature_cols,
            target_column=target_col,
            dataset_name=ds_name,
        )

        return ExportApiStateResponse(
            header=header,
            dataset_versions=dataset_versions,
            export_options=export_opts,
            selected_data_format=run.data_format or "parquet",
            dataset_formats=data_formats,
            model_package_formats=model_formats,
            selected_model_format=run.model_format or "docker",
            deploy_steps=deploy_steps,
            deploy_options=deploy_options,
            selected_deploy_option=run.deploy_target or "hosted",
            api_keys=api_keys,
            webhook_events=webhook_events,
            version_traffic=version_traffic,
            guardrails=guardrails,
            endpoint_url=endpoint_url,
            python_snippet=python_snippet,
            rest_snippet=rest_snippet,
            cli_snippet=cli_snippet,
            curl_snippet=curl_snippet,
            js_snippet=js_snippet,
            python_req_snippet=python_req_snippet,
            json_response_snippet=json_response,
        )

    def get_state(self, dataset_id: str, db: Session) -> ExportApiStateResponse:
        ds = self._get_dataset(dataset_id, db)
        run = self._get_or_create_run(dataset_id, db)
        return self._build_state(ds, run, db)

    def update_settings(self, dataset_id: str, req: UpdateExportSettingsRequest, db: Session) -> ExportApiStateResponse:
        ds = self._get_dataset(dataset_id, db)
        run = self._get_or_create_run(dataset_id, db)
        if req.data_format is not None:
            run.data_format = req.data_format
        if req.model_format is not None:
            run.model_format = req.model_format
        if req.deploy_target is not None:
            run.deploy_target = req.deploy_target
        if req.export_options is not None:
            run.export_options = req.export_options.model_dump()
        db.commit()
        db.refresh(run)
        return self._build_state(ds, run, db)

    def deploy_to_staging(self, dataset_id: str, db: Session) -> DeployToStagingResponse:
        ds = self._get_dataset(dataset_id, db)
        run = self._get_or_create_run(dataset_id, db)
        _, cand_run = self._get_training_runs(dataset_id, db)
        ds_slug = self._slugify(ds.name)
        cand_name = cand_run.run_name if cand_run else f"{ds_slug}-xgb-08"
        endpoint_url = f"[YOUR DOMAIN]/v1/{ds_slug}/predict"
        return DeployToStagingResponse(
            success=True,
            message=f"{cand_name} deploying to staging — shadow mode active",
            endpoint_url=endpoint_url,
            model_name=cand_name,
        )

    def create_api_key(self, dataset_id: str, key_name: str, scope: str, db: Session) -> dict:
        run = self._get_or_create_run(dataset_id, db)
        new_key = f"dl_live_{secrets.token_hex(4)}"
        masked = f"dl_live_...{new_key[-4:]}"
        entry = {"name": key_name, "key_masked": masked, "scope": scope, "status": "LIVE", "last_used": "just now"}
        keys = list(run.api_keys or [])
        keys.append(entry)
        run.api_keys = keys
        db.commit()
        return {"name": key_name, "key": new_key, "scope": scope, "status": "LIVE"}


def json_example(feature_cols: list, target_col: str) -> str:
    parts = []
    for c in feature_cols[:3]:
        parts.append(f'"{c}": "value"')
    if len(feature_cols) > 3:
        parts.append("...")
    return ", ".join(parts)


def js_fields(feature_cols: list) -> str:
    parts = []
    for c in feature_cols[:3]:
        parts.append(f'{c}: "value"')
    return ", ".join(parts)


export_api_service = ExportApiService()

