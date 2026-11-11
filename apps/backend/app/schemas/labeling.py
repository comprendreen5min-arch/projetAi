from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class FeatureItem(BaseModel):
    name: str
    display_name: str
    value: Any
    is_contradiction: bool = False
    is_positive_driver: bool = False


class CustomerEvent(BaseModel):
    date: str
    event: str
    is_highlighted: bool = False


class NearestCustomer(BaseModel):
    customer_id: str
    label: str
    similarity: float


class BulkPattern(BaseModel):
    description: str
    matching_count: int
    matching_row_indices: List[int]
    rule_summary: str


class LabelingCandidate(BaseModel):
    row_index: int
    customer_id: str
    split: Optional[str] = "train"
    current_label: str
    model_prediction: str
    model_probability: float
    features: List[FeatureItem]
    history: List[CustomerEvent]
    nearest_customers: List[NearestCustomer]
    bulk_pattern: Optional[BulkPattern] = None
    label_source: str = "Export CRM"
    smote_children: str = "0 · non applicable"
    current_decision: Optional[str] = None
    current_reason: Optional[str] = None


class QueueMetric(BaseModel):
    id: str  # 'suspected_errors', 'rule_conflicts', 'missing_target', 'to_review'
    title: str
    count: int
    description: str
    done_count: int
    button_label: str
    is_active: bool = False


class LabelingStatusResponse(BaseModel):
    dataset_id: str
    dataset_name: str
    source_version_hash: str
    source_version_label: str
    target_version_label: str
    classification_type: str = "CLASSIFICATION BINAIRE"
    target_column: str
    pos_label: str = "yes"
    neg_label: str = "no"
    suspected_errors_count: int
    rule_conflicts_count: int
    done_today_count: int
    output_version: str
    label_trust_before: int
    label_trust_after: int
    queues: List[QueueMetric]
    available_target_columns: List[str]
    threshold: float = 0.90
    columns_mode: str = "8 most useful (auto)"
    second_review_mode: str = "Every change"


class QueueItemResponse(BaseModel):
    queue_id: str
    total_items: int
    current_index: int  # 1-based, e.g. 179 / 1286
    candidate: Optional[LabelingCandidate]
    status: LabelingStatusResponse


class DecisionRequest(BaseModel):
    row_index: int
    customer_id: str
    decision: str  # 'keep', 'change', 'not_yet', 'unsure'
    new_label: Optional[str] = None
    reason: Optional[str] = None
    queue_id: str = "suspected_errors"


class BulkFixRequest(BaseModel):
    row_indices: List[int]
    new_label: str
    reason: str
    pattern_description: str


class LabelCheckItem(BaseModel):
    id: str
    title: str
    subtitle: str
    count_or_status: str
    count: Optional[int] = None
    action_type: str = "fix"  # 'fix', 'view'


class RecentChangeItem(BaseModel):
    id: Optional[str] = None
    row_id: str
    before: str
    after: str
    reason: str
    author: str = "—"
    timestamp: str


class GuardrailItem(BaseModel):
    id: str
    title: str
    subtitle: str
    passed: bool
    is_warning: bool = False


class LabelChecksResponse(BaseModel):
    checks: List[LabelCheckItem]
    recent_changes: List[RecentChangeItem]
    guardrails: List[GuardrailItem]
    summary: Dict[str, Any]


class SaveVersionRequest(BaseModel):
    rerun_augmentation: bool = False
    version_label: Optional[str] = None
    description: Optional[str] = None


class SaveVersionResponse(BaseModel):
    success: bool
    new_version_hash: str
    new_version_label: str
    parent_version_hash: str
    row_count: int
    changes_applied: int
    augmented: bool
    message: str

