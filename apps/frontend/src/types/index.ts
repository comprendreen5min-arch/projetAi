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
}

export interface ProfileSummary {
  total_rows: number;
  total_columns: number;
  file_size_bytes: number;
  duplicate_rows_count: number;
  target_column?: string | null;
  flagged_columns_count: number;
  numeric_columns_count: number;
  category_columns_count: number;
}

export interface VersionProfile {
  summary: ProfileSummary;
  columns: ColumnProfile[];
  dataset_id: string;
  dataset_name?: string;
  version_hash: string;
}
