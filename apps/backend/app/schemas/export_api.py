from typing import List, Optional, Any, Dict
from pydantic import BaseModel


class DatasetVersionExportItem(BaseModel):
    version_label: str
    row_count: str
    made_from: str
    state: str  # "DRAFT", "CURRENT", "TAGGED"
    is_current: bool
    is_tagged: bool


class ExportDatasetOptions(BaseModel):
    keep_splits: bool = True
    mask_pii: bool = True
    include_smote: bool = False
    add_label_history: bool = False
    include_not_yet: bool = False


class ModelPackageFormat(BaseModel):
    format_id: str
    name: str
    description: str
    tag: str
    is_selected: bool


class DeployStep(BaseModel):
    step_number: int
    title: str
    status: str  # "done", "active", "waiting"
    detail: str


class DeployOption(BaseModel):
    option_id: str
    title: str
    description: str
    is_selected: bool


class ApiKey(BaseModel):
    name: str
    key_masked: str
    scope: str
    status: str  # "LIVE", "TEST"
    last_used: str


class WebhookEvent(BaseModel):
    event_name: str
    description: str
    enabled: bool


class VersionTrafficRow(BaseModel):
    model_name: str
    runs_on: str
    status: str  # "PRODUCTION", "STAGING", "ARCHIVED"
    traffic_pct: int
    p95_ms: int
    error_rate: float
    action: str


class ExportGuardrailItem(BaseModel):
    id: str
    status: str  # "ok", "warn", "error"
    title: str
    description: str


class ExportHeaderSummary(BaseModel):
    breadcrumb: str
    candidate_model: str
    production_model: str
    model_type: str
    threshold: float
    data_version: str
    versions_live: int
    endpoint: str
    calls_7d: str
    approved_step: str
    feature_columns: List[str]
    target_column: str
    dataset_name: str


class ExportApiStateResponse(BaseModel):
    header: ExportHeaderSummary
    dataset_versions: List[DatasetVersionExportItem]
    export_options: ExportDatasetOptions
    selected_data_format: str
    dataset_formats: List[ModelPackageFormat]
    model_package_formats: List[ModelPackageFormat]
    selected_model_format: str
    deploy_steps: List[DeployStep]
    deploy_options: List[DeployOption]
    selected_deploy_option: str
    api_keys: List[ApiKey]
    webhook_events: List[WebhookEvent]
    version_traffic: List[VersionTrafficRow]
    guardrails: List[ExportGuardrailItem]
    endpoint_url: str
    python_snippet: str
    rest_snippet: str
    cli_snippet: str
    curl_snippet: str
    js_snippet: str
    python_req_snippet: str = ""
    json_response_snippet: str


class UpdateExportSettingsRequest(BaseModel):
    data_format: Optional[str] = None
    model_format: Optional[str] = None
    deploy_target: Optional[str] = None
    export_options: Optional[ExportDatasetOptions] = None


class DeployToStagingResponse(BaseModel):
    success: bool
    message: str
    endpoint_url: str
    model_name: str


class CreateApiKeyResponse(BaseModel):
    name: str
    key: str
    scope: str
    status: str

