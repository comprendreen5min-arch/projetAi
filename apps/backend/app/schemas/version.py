from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.transformation import TransformationRead


class ColumnMetadata(BaseModel):
    name: str
    type: str
    nullable: bool = True
    null_count: Optional[int] = 0


class TagCreate(BaseModel):
    tag: str = Field(..., min_length=1, max_length=50)


class TagRead(BaseModel):
    id: UUID
    tag: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CurrentVersionUpdate(BaseModel):
    version_hash: str


class BaselineVersionUpdate(BaseModel):
    version_hash: str


class BranchCreate(BaseModel):
    branch_name: Optional[str] = "brouillon"
    description: Optional[str] = None


class DatasetVersionBase(BaseModel):
    dataset_id: UUID
    version_hash: str
    parent_version_id: Optional[UUID] = None
    row_count: int
    size_bytes: int
    schema_metadata: Optional[Dict[str, Any]] = None


class DatasetVersionCreate(DatasetVersionBase):
    storage_path: str


class DatasetVersionRead(DatasetVersionBase):
    id: UUID
    storage_path: str
    created_at: datetime
    is_draft: bool = False
    branch_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    tags: List[TagRead] = Field(default_factory=list)
    transformation_produced: Optional[TransformationRead] = None

    model_config = ConfigDict(from_attributes=True)


class DatasetVersionDetail(DatasetVersionRead):
    sample_rows: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Aperçu des premières lignes")


class DistributionShiftItem(BaseModel):
    column: str
    is_numeric: bool
    val_before: Any
    val_after: Any
    shift_score: float
    shift_level: str  # HIGH, MEDIUM, LOW, NONE
    is_expected: bool
    explanation: Optional[str] = None


class CompareRequest(BaseModel):
    base_version_hash: str
    target_version_hash: str
    row_key: Optional[str] = None


class CompareResponse(BaseModel):
    base_version_hash: str
    target_version_hash: str
    base_version_label: str
    target_version_label: str
    row_key_used: Optional[str] = None
    available_keys: List[str] = Field(default_factory=list)
    added_count: int
    removed_count: int
    modified_count: int
    added_summary: str
    removed_summary: str
    target_column: Optional[str] = None
    target_evolution: Optional[str] = None  # "9,2 % → 30 %"
    target_evolution_details: Optional[str] = None  # "Sur 'churned' = oui (sur split=train)"
    test_set_status: str  # "identical", "modified", "not_applicable"
    test_set_message: str
    test_set_rows: Optional[int] = None
    distribution_shifts_title: Optional[str] = None
    distribution_shifts: List[DistributionShiftItem]
    unexpected_shifts_count: int
    summary_note: str
    cells_modified_count: int = 0
    cells_modified_detail: Optional[str] = None


class RowDiffItem(BaseModel):
    change: str  # "added", "removed", "modified"
    row_id: str
    detail: str
    values: Dict[str, Any]
    modified_fields: Optional[Dict[str, Dict[str, Any]]] = None


class RowDiffPage(BaseModel):
    items: List[RowDiffItem]
    total: int
    page: int
    page_size: int
    counts: Dict[str, int]  # {"all": X, "added": Y, "removed": Z, "modified": W}


class ViewQueryResponse(BaseModel):
    version_hash: str
    filters_applied: Dict[str, Any]
    counts: Dict[str, int]
    total_matching: int
    sample_rows: List[Dict[str, Any]]
    api_url: str
    cli_command: str


class GuardrailItem(BaseModel):
    id: str
    name: str
    status: str  # "passed", "failed", "warning", "not_evaluated"
    message: str
    detail: Optional[str] = None


class DatasetCardResponse(BaseModel):
    markdown: str
    json_data: Dict[str, Any]


class VersioningHeaderMetrics(BaseModel):
    version_count: int
    versions: List[Dict[str, Any]]
    total_stored_bytes: int
    total_stored_formatted: str
    logical_size_bytes: int
    logical_size_formatted: str
    test_set_hash: Optional[str] = None
    test_set_status: str
    used_by_models_count: int
    used_by_label: str
    current_version_hash: Optional[str] = None
    current_version_label: Optional[str] = None
    baseline_version_hash: Optional[str] = None
    baseline_version_label: Optional[str] = None


class LineageNode(BaseModel):
    id: UUID
    version_hash: str
    short_hash: str
    version_number: int
    version_label: str
    type_label: str = "brute"
    parent_version_id: Optional[UUID] = None
    operation_type: str
    operation_summary: str
    row_count: int
    splits_breakdown: Optional[str] = None
    train_row_count: Optional[int] = None
    synthetic_row_count: Optional[int] = None
    size_bytes: int
    size_formatted: str
    created_at: datetime
    date_formatted: str
    health_score: Optional[int] = None
    tags: List[str]
    is_current: bool
    is_baseline: bool
    is_draft: bool
    is_branch: bool
    branch_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    recipe: Optional[Dict[str, Any]] = None
    recipe_summary: str
    seed: Optional[int] = None
    splits: Optional[str] = None
    author: str
    code_version: str
    cli_command: str
    api_download_url: Optional[str] = None
    download_formats: List[str]


class LineageEdge(BaseModel):
    source_id: UUID
    source_hash: str
    target_id: UUID
    target_hash: str
    label: str


class LineageGraphResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str
    current_version_id: Optional[UUID] = None
    baseline_version_id: Optional[UUID] = None
    nodes: List[LineageNode]
    edges: List[LineageEdge]
