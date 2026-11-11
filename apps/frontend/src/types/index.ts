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



