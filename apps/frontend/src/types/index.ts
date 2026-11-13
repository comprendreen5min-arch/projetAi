export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
  null_count: number;
}

export interface Transformation {
  id: string;
  name: string;
  parameters: Record<string, any>;
  source_version_id?: string | null;
  target_version_id: string;
  execution_time_ms?: number | null;
  created_at: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version_hash: string;
  parent_version_id?: string | null;
  storage_path: string;
  row_count: number;
  size_bytes: number;
  schema_metadata?: {
    columns: ColumnMetadata[];
    num_columns: number;
    num_rows: number;
  } | null;
  created_at: string;
  transformation_produced?: Transformation | null;
  sample_rows?: Record<string, any>[];
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version?: DatasetVersion | null;
  versions?: DatasetVersion[];
}

export interface HistogramBin {
  bin_index: number;
  bin_start?: number;
  bin_end?: number;
  label?: string;
  count: number;
  height_percentage: number;
  is_outlier?: boolean;
}

export interface ColumnStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  q1: number;
  q3: number;
  iqr: number;
}

export interface ColumnProfile {
  name: string;
  detected_type: 'id' | 'nombre' | 'catégorie' | 'date' | 'cible' | string;
  null_count: number;
  null_percentage: number;
  unique_count: number;
  unique_percentage: number;
  stats?: ColumnStats | null;
  outlier_count: number;
  outlier_percentage: number;
  histogram: HistogramBin[];
  is_flagged: boolean;
  flag_reasons: string[];
  inconsistent_examples?: string[];
  inconsistent_rows_count?: number;
}

export interface SubScores {
  completeness: number;
  uniqueness: number;
  validity: number;
  consistency: number;
  class_balance: number | null;
}

export interface ProfileSummary {
  total_rows: number;
  total_columns: number;
  file_size_bytes: number;
  duplicate_rows_count: number;
  target_column?: string | null;
  original_filename?: string | null;
  flagged_columns_count: number;
  numeric_columns_count: number;
  category_columns_count: number;
  health_score: number;
  sub_scores: SubScores;
  score_weights?: Record<string, number>;
  version_number?: number;
}

export interface FindingItem {
  number: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  action_label: string;
  action_type: string;
  column?: string | null;
}

export interface VersionProfile {
  summary: ProfileSummary;
  findings: FindingItem[];
  columns: ColumnProfile[];
  dataset_id: string;
  dataset_name?: string;
  original_filename?: string;
  version_hash: string;
  version_number?: number;
}

export interface CategoryMappingItem {
  column?: string;
  from: string;
  to: string;
  rows: number;
  reason?: string;
  is_uncertain?: boolean;
  applied_by_default?: boolean;
}

export interface CategoryResponse {
  column: string;
  normalized: boolean;
  categories: Array<{ value: string; count: number }>;
  total_unique: number;
  safe_mappings?: CategoryMappingItem[];
  auto_mapping_dict?: Record<string, string>;
  uncertain_mappings?: CategoryMappingItem[];
}

export type CleaningOperationType =
  | 'TEXT_NORMALIZE'
  | 'CATEGORY_MERGE'
  | 'HANDLE_MISSING'
  | 'HANDLE_OUTLIERS'
  | 'DROP_DUPLICATES';

export interface CleaningOperation {
  id?: string;
  type: CleaningOperationType;
  column?: string | null;
  parameters: Record<string, any>;
}

export interface StepDiffItem {
  column: string;
  before: string;
  after: string;
  rows: number;
}

export interface CleaningPreviewResponse {
  rows_before: number;
  rows_after: number;
  rows_affected: number;
  cells_changed?: number;
  cells_changed_percentage?: number;
  predicted_health_score?: number | null;
  predicted_sub_scores?: Record<string, number> | null;
  is_noop: boolean;
  target_affected: boolean;
  target_warning?: string | null;
  columns_affected: string[];
  operations_executed: Array<{
    type: string;
    column?: string | null;
    parameters: Record<string, any>;
    rows_affected: number;
  }>;
  sample_before: Record<string, any>[];
  sample_after: Record<string, any>[];
  step_diffs?: {
    duplicates?: StepDiffItem[];
    missing?: StepDiffItem[];
    categories?: StepDiffItem[];
    outliers?: StepDiffItem[];
  };
  uncertain_mappings?: Array<{ from: string; to: string; reason: string }>;
}

export interface CleaningApplyResponse {
  new_version_hash: string;
  new_version_id: string;
  parent_version_hash: string;
  rows_before: number;
  rows_after: number;
  rows_affected: number;
  transformation_name: string;
  parameters: Record<string, any>;
  before_profile: VersionProfile;
  after_profile: VersionProfile;
  health_score_delta: number;
  sub_scores_delta: Record<string, number>;
}

export interface SplitConfig {
  train_ratio: number;
  val_ratio: number;
  test_ratio: number;
  stratify_column?: string | null;
  group_by_column?: string | null;
  random_seed: number;
}

export interface TargetBalanceConfig {
  mode: 'keep' | '20' | '30' | '50';
  custom_target_ratio?: number | null;
}

export interface TechniquesConfig {
  smote_nc_enabled: boolean;
  smote_k_neighbors: number;
  undersample_enabled: boolean;
  undersample_seed: number;
  light_noise_enabled: boolean;
  noise_strength_pct: number;
  class_weights_enabled: boolean;
  class_weights_strategy?: string;
}

export interface GuardrailResult {
  key: string;
  label: string;
  passed: boolean;
  description: string;
  details?: Record<string, any> | null;
}

export interface AugmentationPreviewRequest {
  source_version_hash: string;
  target_column: string;
  split_config: SplitConfig;
  balance_config: TargetBalanceConfig;
  techniques: TechniquesConfig;
}

export interface AugmentationPreviewResponse {
  rows_in_train_before: number;
  rows_in_train_after: number;
  rows_generated: number;
  rows_undersampled: number;
  test_set_size: number;
  val_set_size: number;
  actual_split_ratios: Record<string, number>;
  minority_class_label: any;
  majority_class_label: any;
  minority_pct_before: number;
  minority_pct_after: number;
  balance_score_before: number;
  balance_score_after: number;
  balance_distribution: {
    majority: {
      label: string;
      total_initial: number;
      kept: number;
      undersampled: number;
    };
    minority: {
      label: string;
      total_initial: number;
      real: number;
      generated: number;
    };
    target_ratio: number;
    cap_reached: boolean;
  };
  guardrails: GuardrailResult[];
  sample_preview: Record<string, any>[];
  recipe: Record<string, any>;
  class_weights?: Record<string, number> | null;
}

export interface AugmentationApplyRequest {
  source_version_hash: string;
  target_column: string;
  split_config: SplitConfig;
  balance_config: TargetBalanceConfig;
  techniques: TechniquesConfig;
}

export interface AugmentationApplyResponse {
  new_version_hash: string;
  new_version_id: string;
  parent_version_hash: string;
  total_rows: number;
  rows_in_train: number;
  rows_generated: number;
  rows_undersampled: number;
  transformation_name: string;
  parameters: Record<string, any>;
  recipe: Record<string, any>;
  before_profile: VersionProfile;
  after_profile: VersionProfile;
  balance_score_delta: number;
  guardrails: GuardrailResult[];
}

export interface ComparisonMetricResult {
  mean: number;
  std: number;
  seed_values: number[];
}

export interface ModelComparisonMetrics {
  recall: ComparisonMetricResult;
  precision: ComparisonMetricResult;
  f1_score: ComparisonMetricResult;
}

export interface AugmentationComparisonRequest {
  source_version_hash: string;
  target_column: string;
  split_config: SplitConfig;
  balance_config: TargetBalanceConfig;
  techniques: TechniquesConfig;
  model_type: 'logistic_regression' | 'random_forest';
  seeds?: number[];
}

export interface AugmentationComparisonResponse {
  model_type: string;
  model_label: string;
  test_total_count: number;
  test_positive_count: number;
  minority_class_label: any;
  baseline_metrics: ModelComparisonMetrics;
  augmented_metrics: ModelComparisonMetrics;
  deltas: Record<string, number>;
  seeds_used: number[];
  warning_disclaimer: string;
}

// ==========================================
// 04. Versioning Types
// ==========================================

export interface TagRead {
  id: string;
  tag: string;
  created_at: string;
}

export interface VersioningHeaderMetrics {
  version_count: number;
  versions: Array<{ id: string; hash: string; label: string; is_draft: boolean; branch_name?: string }>;
  total_stored_bytes: number;
  total_stored_formatted: string;
  logical_size_bytes: number;
  logical_size_formatted: string;
  test_set_hash?: string | null;
  test_set_status: string;
  used_by_models_count: number;
  used_by_label: string;
  current_version_hash?: string | null;
  current_version_label?: string | null;
  baseline_version_hash?: string | null;
  baseline_version_label?: string | null;
}

export interface LineageNode {
  id: string;
  version_hash: string;
  short_hash: string;
  version_number: number;
  version_label: string;
  type_label: string;
  parent_version_id?: string | null;
  operation_type: string;
  operation_summary: string;
  row_count: number;
  splits_breakdown?: string | null;
  train_row_count?: number | null;
  synthetic_row_count?: number | null;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
  date_formatted: string;
  health_score?: number | null;
  tags: string[];
  is_current: boolean;
  is_baseline: boolean;
  is_draft: boolean;
  is_branch: boolean;
  branch_name?: string | null;
  expires_at?: string | null;
  recipe?: Record<string, any> | null;
  recipe_summary: string;
  seed?: number | null;
  splits?: string | null;
  author: string;
  code_version: string;
  cli_command: string;
  api_download_url?: string | null;
  download_formats: string[];
}

export interface LineageEdge {
  source_id: string;
  source_hash: string;
  target_id: string;
  target_hash: string;
  label: string;
}

export interface LineageGraphResponse {
  dataset_id: string;
  dataset_name: string;
  current_version_id?: string | null;
  baseline_version_id?: string | null;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface DistributionShiftItem {
  column: string;
  is_numeric: boolean;
  val_before: any;
  val_after: any;
  shift_score: number;
  shift_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  is_expected: boolean;
  explanation?: string | null;
}

export interface CompareResponse {
  base_version_hash: string;
  target_version_hash: string;
  base_version_label: string;
  target_version_label: string;
  row_key_used?: string | null;
  available_keys?: string[];
  added_count: number;
  removed_count: number;
  modified_count: number;
  added_summary: string;
  removed_summary: string;
  target_column?: string | null;
  target_evolution?: string | null;
  target_evolution_details?: string | null;
  test_set_status: 'identical' | 'modified' | 'not_applicable';
  test_set_message: string;
  test_set_rows?: number | null;
  distribution_shifts_title?: string | null;
  distribution_shifts: DistributionShiftItem[];
  unexpected_shifts_count: number;
  summary_note: string;
  cells_modified_count?: number;
  cells_modified_detail?: string | null;
}

export interface RowDiffItem {
  change: 'added' | 'removed' | 'modified';
  row_id: string;
  detail: string;
  values: Record<string, any>;
  modified_fields?: Record<string, { before: any; after: any }> | null;
}

export interface RowDiffPage {
  items: RowDiffItem[];
  total: number;
  page: number;
  page_size: number;
  counts: { all: number; added: number; removed: number; modified: number };
}

export interface ViewQueryResponse {
  version_hash: string;
  filters_applied: Record<string, any>;
  counts: {
    all: number;
    real_only: number;
    synthetic: number;
    train: number;
    val: number;
    test: number;
  };
  total_matching: number;
  sample_rows: Record<string, any>[];
  api_url: string;
  cli_command: string;
}

export interface GuardrailItem {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'not_evaluated';
  message: string;
  detail?: string | null;
}

export interface DatasetCardResponse {
  markdown: string;
  json_data: Record<string, any>;
}

// ==========================================
// Step 05: Labeling Interfaces
// ==========================================

export interface FeatureItem {
  name: string;
  display_name: string;
  value: any;
  is_contradiction: boolean;
  is_positive_driver: boolean;
}

export interface CustomerEvent {
  date: string;
  event: string;
  is_highlighted: boolean;
}

export interface NearestCustomer {
  customer_id: string;
  label: string;
  similarity: number;
}

export interface BulkPattern {
  description: string;
  matching_count: number;
  matching_row_indices: number[];
  rule_summary: string;
}

export interface LabelingCandidate {
  row_index: number;
  customer_id: string;
  split?: string;
  current_label: string;
  model_prediction: string;
  model_probability: number;
  features: FeatureItem[];
  history: CustomerEvent[];
  nearest_customers: NearestCustomer[];
  bulk_pattern?: BulkPattern | null;
  label_source: string;
  smote_children: string;
  current_decision?: string | null;
  current_reason?: string | null;
}

export interface QueueMetric {
  id: string;
  title: string;
  count: number;
  description: string;
  done_count: number;
  button_label: string;
  is_active: boolean;
}

export interface LabelingStatusResponse {
  dataset_id: string;
  dataset_name: string;
  source_version_hash: string;
  source_version_label: string;
  target_version_label: string;
  classification_type: string;
  target_column: string;
  pos_label: string;
  neg_label: string;
  suspected_errors_count: number;
  rule_conflicts_count: number;
  done_today_count: number;
  output_version: string;
  label_trust_before: number;
  label_trust_after: number;
  queues: QueueMetric[];
  available_target_columns: string[];
  threshold: number;
  columns_mode: string;
  second_review_mode: string;
}

export interface QueueItemResponse {
  queue_id: string;
  total_items: number;
  current_index: number;
  candidate?: LabelingCandidate | null;
  status: LabelingStatusResponse;
}

export interface LabelCheckItem {
  id: string;
  title: string;
  subtitle: string;
  count_or_status: string;
  count?: number | null;
  action_type: 'fix' | 'view';
}

export interface RecentChangeItem {
  id?: string;
  row_id: string;
  before: string;
  after: string;
  reason: string;
  author: string;
  timestamp: string;
}

export interface LabelingGuardrailItem {
  id: string;
  title: string;
  subtitle: string;
  passed: boolean;
  is_warning: boolean;
}

export interface LabelChecksResponse {
  checks: LabelCheckItem[];
  recent_changes: RecentChangeItem[];
  guardrails: LabelingGuardrailItem[];
  summary: Record<string, any>;
}

export interface SaveLabelingVersionResponse {
  success: boolean;
  new_version_hash: string;
  new_version_label: string;
  parent_version_hash: string;
  row_count: number;
  changes_applied: number;
  augmented: boolean;
  message: string;
}

// ==========================================
// Step 06: Training Interfaces
// ==========================================

export interface TrainingPreRunChecks {
  test_hash: string;
  test_rows: number;
  smote_rows_in_train: number;
  smote_in_val_or_test: number;
  leak_columns_found: string[];
  baseline_included: boolean;
  no_pii: boolean;
}

export interface TrainingFeatureConfig {
  name: string;
  treatment: string;
  is_leak: boolean;
  is_id: boolean;
}

export interface TrainingConfigResponse {
  dataset_version: string;
  train_view: string;
  splits_summary: string;
  left_out_count: number;
  available_models: string[];
  target_column: string;
  positive_class: string;
  available_targets: string[];
  available_pos_classes: string[];
  features: TrainingFeatureConfig[];
  checks: TrainingPreRunChecks;
  cli_command: string;
}

export interface TrainingGuardrail {
  id: string;
  title: string;
  subtitle: string;
  passed: boolean;
  is_warning?: boolean;
}

export interface TrainingHeaderSummary {
  dataset_id: string;
  dataset_name: string;
  total_runs: number;
  running_count: number;
  failed_count: number;
  data_version_label: string;
  labels_fixed_since_v3: number;
  compute_cpu_hours: number;
  budget_hours: number;
  production_run_name: string;
  production_trained_date: string;
  candidate_run_number: string;
  candidate_run_name: string;
  guardrails: TrainingGuardrail[];
}

export interface TrainingRunListItem {
  id: string;
  run_name: string;
  data_version: string;
  model_type: string;
  status: 'running' | 'done' | 'failed';
  current_trial?: number | null;
  total_trials?: number | null;
  recall_val?: number | null;
  execution_time_display: string;
  tag?: string | null;
  is_comparable: boolean;
}

export interface ConfusionMatrixData {
  actual_yes_pred_yes: number;
  actual_yes_pred_no: number;
  actual_no_pred_yes: number;
  actual_no_pred_no: number;
  threshold: number;
}

export interface PRCurvePoint {
  recall: number;
  precision: number;
  threshold: number;
}

export interface ThresholdCostData {
  threshold: number;
  cost_missed: number;
  cost_retention: number;
  flagged_per_month: number;
  cost_per_month: number;
  pr_curve: PRCurvePoint[];
}

export interface FeatureDriver {
  feature: string;
  importance: number;
  shap_value: number;
}

export interface SliceItem {
  segment: string;
  rows: number;
  recall_yes: number;
  flag?: 'weak' | 'too_few' | 'ok';
}

export interface ErrorToInspect {
  customer_id: string;
  label: string;
  prob_yes: number;
  why_wrong: string;
  category: string;
  action: string;
}

export interface TrainingRunDetailResponse {
  id: string;
  run_name: string;
  data_version: string;
  model_type: string;
  status: string;
  tag?: string | null;
  current_trial?: number | null;
  total_trials?: number | null;
  eta_minutes?: number | null;
  trial_history: Array<{ trial: number; score: number; best_so_far: number }>;
  recent_logs: string[];
  split_evaluated: string;
  val_rows: number;
  test_rows: number;
  test_locked: boolean;
  test_eval_count: number;
  recall_yes: number;
  precision_yes: number;
  pr_auc: number;
  calibration_error: number;
  threshold_cost: ThresholdCostData;
  confusion_matrix: ConfusionMatrixData;
  feature_drivers: FeatureDriver[];
  slices: SliceItem[];
  errors: ErrorToInspect[];
}

export interface CompareRow {
  metric_name: string;
  prod_val: string;
  cand_val: string;
  change: string;
  is_positive: boolean;
}

export interface PromotionChecklist {
  same_test_set: boolean;
  beats_production: boolean;
  no_slice_drops: boolean;
  model_card_generated: boolean;
  approved_by_second_person: boolean;
}

export interface TrainingCompareResponse {
  prod_run_name: string;
  cand_run_name: string;
  test_set_hash: string;
  test_set_rows: number;
  comparison_table: CompareRow[];
  checklist: PromotionChecklist;
  replay_command: string;
}

export interface StartRunRequest {
  dataset_version: string;
  train_view: string;
  target_column: string;
  positive_class: string;
  optimize_metric: string;
  precision_constraint?: number;
  models_to_try: string[];
  search_method: string;
  trials: number;
  time_limit_minutes: number;
  stop_if_no_gain_trials?: number;
  worker_type?: string;
  seed: number;
}







// -------------------------------------------------------------
// Step 07: Active Learning Types
// -------------------------------------------------------------

export interface StrategyItem {
  id: string; // "near_threshold" | "models_disagree" | "looks_wrong" | "weak_segments" | "random_control"
  title: string;
  subtitle: string;
  rows: number;
  percentage: number;
  min_pct?: number;
}

export interface RoundSettings {
  rows_this_round: number;
  pool_source: string;
  skip_checked_days: number;
  one_row_per_customer: boolean;
  label_maturity_days: number;
  maturity_subtitle: string;
  analyst_time: string;
  expected_fixes: string;
}

export interface PickRowItem {
  customer_id: string;
  why_picked: string;
  p_yes: number;
  label: string;
  strategy: string;
  x?: number;
  y?: number;
}

export interface PoolMapPoint {
  id: string;
  x: number;
  y: number;
  status: 'unchecked' | 'already checked' | 'picked now' | 'checked' | 'picked';
  cluster?: string;
}

export interface RoundHistoryItem {
  round_number: number;
  status: 'done' | 'draft' | 'upcoming';
  checked_count?: number;
  fixed_count?: number;
  hours?: number;
  data_version: string;
  model_name?: string;
  recall_gain?: string;
}

export interface LoopStep {
  step_number: number;
  title: string;
  info: string;
  status: 'done' | 'active' | 'waiting';
  detail: string;
}

export interface AutomationSettings {
  start_on_new_crm: boolean;
  start_on_drift: boolean;
  requeue_not_yet: boolean;
  retrain_after_round: boolean;
  notify_reviewer: boolean;
  auto_promote: boolean;
}

export interface ActiveLearningGuardrailItem {
  id: string;
  status: 'ok' | 'warning';
  title: string;
  description: string;
}

export interface ActiveLearningHeaderSummary {
  dataset_id: string;
  dataset_name: string;
  round_number: number;
  round_status: string;
  scored_by_model: string;
  target_column: string;
  pool_size: number;
  pool_breakdown: string;
  budget_rows: number;
  budget_subtitle: string;
  hit_rate_round_1: number;
  hit_rate_subtitle: string;
  output_version: string;
  output_subtitle: string;
}

export interface ActiveLearningStateResponse {
  header: ActiveLearningHeaderSummary;
  loop_steps: LoopStep[];
  rounds_history: RoundHistoryItem[];
  strategies: StrategyItem[];
  round_settings: RoundSettings;
  total_percentage: number;
  total_rows: number;
  picks: PickRowItem[];
  pool_points: PoolMapPoint[];
  weak_cluster_label: string;
  hit_rate_picked: number;
  hit_rate_random: number;
  stop_rule_fixes_pct: number;
  stop_rule_recall_gain_pts: number;
  automation: AutomationSettings;
  guardrails: ActiveLearningGuardrailItem[];
}

export interface UpdateRoundSettingsRequest {
  rows_this_round?: number;
  strategy_counts?: Record<string, number>;
  round_settings?: Partial<RoundSettings>;
  automation?: Partial<AutomationSettings>;
  stop_rule?: { fixes_under_pct?: number; recall_gain_under_pts?: number };
}

export interface SendToLabelingRequest {
  round_number?: number;
  target_split?: string;
  notes?: string;
}

export interface SendToLabelingResponse {
  success: boolean;
  message: string;
  new_version_label: string;
  rows_enqueued: number;
  dataset_id: string;
}

// ==========================================
// Step 08: Drift & Monitoring Interfaces
// ==========================================

export interface DriftHeaderSummary {
  dataset_id: string;
  dataset_name: string;
  production_model_name: string;
  reference_version_label: string;
  reference_subtitle: string;
  live_window_label: string;
  live_window_subtitle: string;
  signals_watched_count: string;
  signals_watched_subtitle: string;
  last_check_time: string;
  last_check_subtitle: string;
  drifting_columns_count: number;
  drifting_columns: string[];
}

export interface DriftTimelinePoint {
  date: string;
  contract?: number;
  monthly_charges?: number;
  city?: number;
  [key: string]: any;
}

export interface DriftTimelineResponse {
  columns?: string[];
  points: DriftTimelinePoint[];
  annotation_date: string;
  watch_threshold: number;
  drift_threshold: number;
}

export interface SignalBarItem {
  name: string;
  pct: number;
}

export interface SignalInspectorData {
  signal_name: string;
  kind: string;
  test_type: string;
  is_drift: boolean;
  description: string;
  train_bars: SignalBarItem[];
  live_bars: SignalBarItem[];
  relies_on_columns: string[];
}

export interface DriftSignalItem {
  signal: string;
  kind: string;
  test: string;
  what_changed: string;
  weight: string;
  is_drift: boolean;
  inspector: SignalInspectorData;
}

export interface DataQualityCheckItem {
  id: string;
  check_type: string;
  where_column: string;
  live_val: string;
  expected_val: string;
  status: 'FAIL' | 'WARN' | 'PASS';
  action_button?: string | null;
}

export interface ImpactSegmentRow {
  segment_name: string;
  rows_count: number;
  recall_yes_est: number;
  flag: 'DRIFT' | 'NEW' | 'WATCH' | 'OK';
}

export interface ModelImpactData {
  recall_yes_estimated: number;
  scored_yes_live_pct: number;
  scored_yes_train_pct: number;
  recall_yes_measured?: number | null;
  segments: ImpactSegmentRow[];
}

export interface ActionDecisionCard {
  category: string;
  title: string;
  description: string;
  button_label: string;
  action_type: string;
  is_recommended: boolean;
}

export interface MonitoringThresholds {
  psi_watch: number;
  psi_drift: number;
  window_days: number;
  min_rows: number;
  email_alerts: boolean;
  slack_alerts: boolean;
  webhook_url?: string | null;
}

export interface DriftGuardrailItem {
  id: string;
  status: 'ok' | 'warning';
  title: string;
  description: string;
}

export interface DriftStateResponse {
  header: DriftHeaderSummary;
  timeline: DriftTimelineResponse;
  signals: DriftSignalItem[];
  quality_checks: DataQualityCheckItem[];
  quality_summary: {
    failed: number;
    to_review: number;
    passed: number;
  };
  model_impact: ModelImpactData;
  decisions: ActionDecisionCard[];
  thresholds: MonitoringThresholds;
  cli_command: string;
  guardrails: DriftGuardrailItem[];
}

export interface UpdateDriftSettingsRequest {
  psi_watch?: number;
  psi_drift?: number;
  window_days?: number;
  min_rows?: number;
  email_alerts?: boolean;
  slack_alerts?: boolean;
  webhook_url?: string;
}

export interface RunDriftCheckResponse {
  success: boolean;
  message: string;
  drifting_columns_count: number;
  checked_at: string;
}


export interface ExportHeaderSummary {
  breadcrumb: string;
  candidate_model: string;
  production_model: string;
  model_type: string;
  threshold: number;
  data_version: string;
  versions_live: number;
  endpoint: string;
  calls_7d: string;
  approved_step: string;
  feature_columns: string[];
  target_column: string;
  dataset_name: string;
}

export interface DatasetVersionExportItem {
  version_label: string;
  row_count: string;
  made_from: string;
  state: string;
  is_current: boolean;
  is_tagged: boolean;
}

export interface ExportDatasetOptions {
  keep_splits: boolean;
  mask_pii: boolean;
  include_smote: boolean;
  add_label_history: boolean;
  include_not_yet: boolean;
}

export interface ExportFormatOption {
  format_id: string;
  name: string;
  description: string;
  tag: string;
  is_selected: boolean;
}

export interface ExportDeployStep {
  step_number: number;
  title: string;
  status: string;
  detail: string;
}

export interface ExportDeployOption {
  option_id: string;
  title: string;
  description: string;
  is_selected: boolean;
}

export interface ExportApiKey {
  name: string;
  key_masked: string;
  scope: string;
  status: string;
  last_used: string;
}

export interface ExportWebhookEvent {
  event_name: string;
  description: string;
  enabled: boolean;
}

export interface ExportVersionTrafficRow {
  model_name: string;
  runs_on: string;
  status: string;
  traffic_pct: number;
  p95_ms: number;
  error_rate: number;
  action: string;
}

export interface ExportGuardrailItem {
  id: string;
  status: string;
  title: string;
  description: string;
}

export interface ExportApiStateResponse {
  header: ExportHeaderSummary;
  dataset_versions: DatasetVersionExportItem[];
  export_options: ExportDatasetOptions;
  selected_data_format: string;
  dataset_formats: ExportFormatOption[];
  model_package_formats: ExportFormatOption[];
  selected_model_format: string;
  deploy_steps: ExportDeployStep[];
  deploy_options: ExportDeployOption[];
  selected_deploy_option: string;
  api_keys: ExportApiKey[];
  webhook_events: ExportWebhookEvent[];
  version_traffic: ExportVersionTrafficRow[];
  guardrails: ExportGuardrailItem[];
  endpoint_url: string;
  python_snippet: string;
  rest_snippet: string;
  cli_snippet: string;
  curl_snippet: string;
  js_snippet: string;
  python_req_snippet?: string;
  json_response_snippet: string;
}

export interface UpdateExportSettingsRequest {
  data_format?: string;
  model_format?: string;
  deploy_target?: string;
  export_options?: ExportDatasetOptions;
}

export interface DeployToStagingResponse {
  success: boolean;
  message: string;
  endpoint_url: string;
  model_name: string;
}

// ─── Text NLP Profiling Types ───────────────────────────────────────────────
export interface TextHealthBar {
  label: string;
  pct: number;
  color: string;
}

export interface TextFindingItem {
  rank: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  title: string;
  subtitle: string;
  action_label: string;
}

export interface TextLanguageSlice {
  name: string;
  pct: number;
  color: string;
}

export interface TextLabelBar {
  label: string;
  count_str: string;
  pct: number;
  color: string;
}

export interface TextDocumentQuote {
  prefix: string;
  marked: string;
  suffix: string;
  tag: string;
  tag_color: string;
  meta: string;
  mark_style: string;
}

export interface TextHistogramItem {
  label: string;
  count: number;
  pct: number;
  height_pct: number;
}

export interface TextDuplicateGroup {
  text?: string;
  normalized?: string;
  variants?: string[];
  count: number;
}

export interface TextDuplicatesInfo {
  exact_count: number;
  exact_groups_count: number;
  exact_groups: TextDuplicateGroup[];
  near_count: number;
  near_groups_count: number;
  near_groups: TextDuplicateGroup[];
  normalization_rule: string;
}

export interface TextProfileResponse {
  dataset_id: string;
  dataset_name: string;
  version_hash: string;
  breadcrumb: string;
  original_filename: string;
  kpis: {
    documents: string;
    languages: number;
    labels: number | string;
    size: string;
    empty_lines_ignored?: number;
  };
  health: {
    score: number;
    bars: TextHealthBar[];
  };
  findings: TextFindingItem[];
  languages: {
    detected_count: number;
    slices: TextLanguageSlice[];
    mixed_text: string;
  };
  length: {
    median: number;
    max_label: string;
    footnote_empty: string;
    footnote_long: string;
    histogram: number[];
    histogram_details?: TextHistogramItem[];
  };
  labels: {
    has_labels?: boolean;
    classes_count: number;
    message?: string;
    bars: TextLabelBar[];
  };
  duplicates?: TextDuplicatesInfo;
  quotes: TextDocumentQuote[];
}

export interface ImageHealthBar {
  label: string;
  pct: number;
  color: 'amber' | 'red';
}

export interface ImageFindingItem {
  rank: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  subtitle: string;
  action_label: string;
}

export interface ImageContactSheetItem {
  id: string;
  type: string;
  count: number;
  color: string;
  card_style: string;
  thumbnail_url?: string;
}

export interface ImageClassBar {
  name: string;
  count: number;
  count_str: string;
  pct: number;
  color: string;
}

export interface ImageSizesAndBoxes {
  most_common_size: string;
  different_sizes: number;
  boxes_per_image: number;
  unlabeled: string;
  box_sizes: Array<{
    label: string;
    pct: number;
    color: string;
  }>;
}

export interface ImageProfileResponse {
  dataset_id: string;
  dataset_name: string;
  version_hash: string;
  breadcrumb: string;
  display_title: string;
  kpis: {
    images: string;
    classes: number;
    formats: string;
    size: string;
  };
  health: {
    score: number;
    bars: ImageHealthBar[];
  };
  findings: ImageFindingItem[];
  contact_sheet: ImageContactSheetItem[];
  classes: {
    total_count: number;
    bars: ImageClassBar[];
    footnote: string;
  };
  sizes_and_boxes: ImageSizesAndBoxes;
}

// ─── Text Cleaning Types (Mockups 1 & 2) ────────────────────────────────────
export interface TextCleaningStep {
  id: string;
  rank: string;
  title: string;
  subtitle: string;
  param_label: string;
  param_value: string;
  options: string[];
  affected_count?: number;
  count_label: string;
  enabled: boolean;
  is_later?: boolean;
  badge?: string;
  status: string;
}

export interface TextCleaningPreviewRow {
  doc: string;
  before: string;
  after: string;
  highlight?: string;
  badge?: string;
  lang?: string;
}

export interface TextCleaningPreview {
  step_header: string;
  rows: TextCleaningPreviewRow[];
  footnote: string;
}

export interface TextQualityImpactMetric {
  before?: number;
  after?: number;
  value?: number;
  label: string;
  subtitle?: string;
}

export interface TextQualityImpact {
  completeness: TextQualityImpactMetric;
  uniqueness: TextQualityImpactMetric;
  encoding: TextQualityImpactMetric;
  privacy: TextQualityImpactMetric;
  label_balance: TextQualityImpactMetric;
}

export interface TextCleaningRecipeResponse {
  dataset_id: string;
  dataset_name: string;
  version_hash: string;
  breadcrumb: string;
  display_title: string;
  kpis: {
    documents: string;
    documents_was: string;
    languages: number;
    languages_detail: string;
    texts_edited: string;
    texts_edited_pct: string;
    output: string;
    output_sub: string;
  };
  health: {
    before: number;
    after: number;
  };
  steps: TextCleaningStep[];
  preview_step_id: string;
  previews: Record<string, TextCleaningPreview>;
  quality_impact: TextQualityImpact;
  action_banner: {
    title: string;
    subtitle: string;
    dry_run_btn: string;
    apply_btn: string;
  };
  applied?: boolean;
  new_version_hash?: string;
}

// ─── Image Cleaning Types (Mockups 1 & 2) ───────────────────────────────────
export interface ImageCleaningStep {
  id: string;
  rank: string;
  title: string;
  subtitle: string;
  param_label: string;
  param_value: string;
  options: string[];
  affected_count?: number;
  count_label: string;
  enabled: boolean;
  is_later?: boolean;
  badge?: string;
  status: string;
}

export interface ImageCleaningPreviewPair {
  before_label: string;
  before_img: string;
  after_label: string;
  after_img: string;
}

export interface ImageCleaningPreview {
  step_header: string;
  pairs: ImageCleaningPreviewPair[];
  footnote: string;
}

export interface ImageQualityImpactMetric {
  before?: number;
  after?: number;
  value?: number;
  label: string;
  subtitle?: string;
}

export interface ImageQualityImpact {
  readability: ImageQualityImpactMetric;
  uniqueness: ImageQualityImpactMetric;
  image_quality: ImageQualityImpactMetric;
  label_coverage: ImageQualityImpactMetric;
  class_balance: ImageQualityImpactMetric;
}

export interface ImageCleaningRecipeResponse {
  dataset_id: string;
  dataset_name: string;
  version_hash: string;
  breadcrumb: string;
  display_title: string;
  kpis: {
    images: string;
    images_was: string;
    classes: number;
    classes_sub: string;
    images_fixed: string;
    images_fixed_sub: string;
    output: string;
    output_sub: string;
  };
  health: {
    before: number;
    after: number;
  };
  steps: ImageCleaningStep[];
  preview_step_id: string;
  previews: Record<string, ImageCleaningPreview>;
  quality_impact: ImageQualityImpact;
  action_banner: {
    title: string;
    subtitle: string;
    dry_run_btn: string;
    apply_btn: string;
  };
  applied?: boolean;
  new_version_hash?: string;
}

// ── Text Augmentation Types (Step 03 Augmentation · Text) ───────────────────
export interface TextAugmentationTechnique {
  id: string;
  rank: string;
  title: string;
  badge?: string;
  subtitle: string;
  param_label: string;
  param_value: string;
  options: string[];
  count_label: string;
  enabled: boolean;
  status: string;
}

export interface TextAugmentationPreviewVariant {
  type: string;
  text: string;
}

export interface TextAugmentationPreview {
  header: string;
  original_card: {
    label: string;
    text: string;
  };
  variants: TextAugmentationPreviewVariant[];
  footnote: string;
}

export interface TextAugmentationGuardrail {
  title: string;
  subtitle: string;
  checked: boolean;
}

export interface TextAugmentationClassBalance {
  name: string;
  real: number;
  generated: number;
  target: number;
  is_capped: boolean;
}

export interface TextAugmentationRecipeResponse {
  dataset_id: string;
  dataset_name: string;
  version_hash: string;
  breadcrumb: string;
  display_title: string;
  kpis: {
    tickets_in_train: string;
    tickets_in_train_was: string;
    generated: string;
    generated_sub: string;
    test_set: string;
    test_set_sub: string;
    output: string;
    output_sub: string;
  };
  label_balance: {
    before: number;
    after: number;
    label: string;
  };
  split_config: {
    train_pct: number;
    val_pct: number;
    test_pct: number;
    ratio: string;
    ratio_options: string[];
    group_by: string;
    group_by_options: string[];
    stratify: string;
    stratify_options: string[];
    footnote: string;
  };
  target_balance: {
    selected_mode: string;
    modes: { id: string; label: string }[];
    classes: TextAugmentationClassBalance[];
    note: string;
  };
  techniques: TextAugmentationTechnique[];
  preview_technique_id: string;
  previews: Record<string, TextAugmentationPreview>;
  guardrails: TextAugmentationGuardrail[];
  comparison: {
    metric: string;
    without_v2?: number | null;
    with_v3?: number | null;
    delta?: string | null;
  };
  action_banner: {
    title: string;
    subtitle: string;
    send_training_btn: string;
    save_v3_btn: string;
  };
  saved?: boolean;
  new_version_hash?: string;
}

export interface TextAugmentationComparisonResponse {
  metric: string;
  without_v2: number;
  with_v3: number;
  delta: string;
  details?: Record<string, { without: number; with: number }>;
  message?: string;
}

export interface ImageAugmentationTechnique {
  id: string;
  rank: string;
  title: string;
  badge?: string;
  subtitle: string;
  param_label: string;
  param_value: string;
  options: string[];
  count_label: string;
  enabled: boolean;
  status: string;
}

export interface ImageAugmentationPreviewCard {
  label?: string;
  card_title?: string;
  sub: string;
  image_url?: string;
  img?: string;
  is_new?: boolean;
}

export interface ImageAugmentationPreview {
  header: string;
  cards: ImageAugmentationPreviewCard[];
  footnote: string;
}

export interface ImageAugmentationGuardrail {
  title: string;
  subtitle: string;
  checked: boolean;
  type?: 'check' | 'warning';
}

export interface ImageAugmentationClassBalance {
  name: string;
  real: number;
  generated: number;
  target: number;
  is_capped: boolean;
  is_critical?: boolean;
}

export interface ImageAugmentationRecipeResponse {
  dataset_id: string;
  dataset_name: string;
  version_hash: string;
  breadcrumb: string;
  display_title: string;
  kpis: {
    images_in_train: string;
    images_in_train_was: string;
    generated: string;
    generated_sub: string;
    test_set: string;
    test_set_sub: string;
    output: string;
    output_sub: string;
  };
  class_balance: {
    before: number;
    after: number;
    label: string;
  };
  split_config: {
    train_pct: number;
    val_pct: number;
    test_pct: number;
    ratio: string;
    ratio_options: string[];
    group_by: string;
    group_by_options: string[];
    stratify: string;
    stratify_options: string[];
    footnote: string;
  };
  target_balance: {
    selected_mode: string;
    modes: { id: string; label: string }[];
    classes: ImageAugmentationClassBalance[];
    note: string;
  };
  techniques: ImageAugmentationTechnique[];
  preview_technique_id: string;
  previews: Record<string, ImageAugmentationPreview>;
  guardrails: ImageAugmentationGuardrail[];
  comparison: {
    metric: string;
    without_v2?: number | null;
    with_v3?: number | null;
    delta?: string | null;
  };
  action_banner: {
    title: string;
    subtitle: string;
    send_training_btn: string;
    save_v3_btn: string;
  };
  saved?: boolean;
  new_version_hash?: string;
}

export interface ImageAugmentationComparisonResponse {
  metric: string;
  without_v2: number;
  with_v3: number;
  delta: string;
  details?: Record<string, { without: number; with: number }>;
  message?: string;
}

export interface TextVersioningLineageNode {
  id: string;
  version_hash: string;
  rank: string;
  badge?: string;
  count_label: string;
  date_label: string;
  step_after?: string;
  action_title?: string;
  action_desc?: string;
}

export interface TextVersioningDetail {
  title: string;
  badge?: string;
  parent: string;
  recipe: string;
  llm_used: string;
  seed: string;
  splits: string;
  created_by: string;
  pull_command: string;
  formats: string;
}

export interface TextVersioningDiffItem {
  id: string;
  lang: string;
  type: 'EDITED' | 'REMOVED' | 'SPLIT';
  reason: string;
  before_highlight?: string;
  after_highlight?: string;
  prefix?: string;
  suffix?: string;
  full_text?: string;
}

export interface TextVersioningView {
  id: string;
  label: string;
  count?: string;
  active?: boolean;
}

export interface TextVersioningModel {
  model_run: string;
  data: string;
  macro_f1: string;
  tag: string;
  tag_type: 'production' | 'archived';
}

export interface TextVersioningGuardrail {
  title: string;
  subtitle: string;
  checked: boolean;
}

export interface TextVersioningDataResponse {
  dataset_id: string;
  dataset_name: string;
  display_title: string;
  breadcrumb: string;
  kpis: {
    versions: string;
    versions_sub: string;
    stored: string;
    stored_sub: string;
    languages: string;
    languages_sub: string;
    used_by: string;
    used_by_sub: string;
  };
  current_version: {
    id: string;
    tag: string;
    name: string;
  };
  lineage: TextVersioningLineageNode[];
  version_details: Record<string, TextVersioningDetail>;
  compare: {
    from_options: string[];
    to_options: string[];
    selected_from: string;
    selected_to: string;
    summary: {
      removed: string;
      removed_sub: string;
      edited: string;
      edited_sub: string;
      labels_changed: string;
      labels_changed_sub: string;
      personal_data: string;
      personal_data_sub: string;
    };
    label_distribution: {
      name: string;
      v1_pct: number;
      v2_pct: number;
    }[];
    text_shape: {
      metric: string;
      v1: string;
      v2: string;
    }[];
    diffs: TextVersioningDiffItem[];
  };
  views: TextVersioningView[];
  used_by: TextVersioningModel[];
  guardrails: TextVersioningGuardrail[];
  action_banner: {
    version: string;
    recipes: string;
    splits: string;
    baseline: string;
    card_summary: string;
  };
}
