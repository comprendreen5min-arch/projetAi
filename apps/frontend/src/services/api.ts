import axios from 'axios';
import {
  Dataset,
  DatasetVersion,
  VersionProfile,
  CleaningOperation,
  CleaningPreviewResponse,
  CleaningApplyResponse,
  CategoryResponse,
  AugmentationPreviewRequest,
  AugmentationPreviewResponse,
  AugmentationApplyRequest,
  AugmentationApplyResponse,
  AugmentationComparisonRequest,
  AugmentationComparisonResponse,
  VersioningHeaderMetrics,
  LineageGraphResponse,
  CompareResponse,
  RowDiffPage,
  ViewQueryResponse,
  GuardrailItem,
  DatasetCardResponse,
  TagRead,
  LabelingStatusResponse,
  QueueItemResponse,
  LabelChecksResponse,
  SaveLabelingVersionResponse,
  TrainingConfigResponse,
  TrainingHeaderSummary,
  TrainingRunListItem,
  TrainingRunDetailResponse,
  TrainingCompareResponse,
  StartRunRequest,
  ActiveLearningStateResponse,
  UpdateRoundSettingsRequest,
  SendToLabelingRequest,
  SendToLabelingResponse,
  DriftStateResponse,
  UpdateDriftSettingsRequest,
  RunDriftCheckResponse,
  ExportApiStateResponse,
  UpdateExportSettingsRequest,
  DeployToStagingResponse,
  TextProfileResponse,
  ImageProfileResponse,
  TextCleaningRecipeResponse,
  ImageCleaningRecipeResponse,
  TextAugmentationRecipeResponse,
  TextAugmentationComparisonResponse,
  ImageAugmentationRecipeResponse,
  ImageAugmentationComparisonResponse,
} from '../types';


const API_BASE = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Datasets
  async getDatasets(): Promise<Dataset[]> {
    const res = await apiClient.get<Dataset[]>('/datasets/');
    return res.data;
  },

  async getDataset(id: string): Promise<Dataset> {
    const res = await apiClient.get<Dataset>(`/datasets/${id}`);
    return res.data;
  },

  async createDataset(name: string, description?: string): Promise<Dataset> {
    const res = await apiClient.post<Dataset>('/datasets/', { name, description });
    return res.data;
  },

  async deleteDataset(id: string): Promise<void> {
    await apiClient.delete(`/datasets/${id}`);
  },

  // Upload CSV
  async uploadCsv(datasetId: string, file: File): Promise<DatasetVersion> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<DatasetVersion>(`/datasets/${datasetId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  async uploadRaw(name: string, description: string | undefined, file: File): Promise<Dataset> {
    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', description);
    formData.append('file', file);
    const res = await apiClient.post<Dataset>('/datasets/upload-raw', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  // Versions
  async getVersions(datasetId: string): Promise<DatasetVersion[]> {
    const res = await apiClient.get<DatasetVersion[]>(`/versions/dataset/${datasetId}`);
    return res.data;
  },

  async getVersionDetail(hash: string): Promise<DatasetVersion> {
    const res = await apiClient.get<DatasetVersion>(`/versions/hash/${hash}`);
    return res.data;
  },

  async getVersionProfile(hash: string, targetColumn?: string): Promise<VersionProfile> {
    const params = targetColumn ? { target_column: targetColumn } : undefined;
    const res = await apiClient.get<VersionProfile>(`/versions/${hash}/profile`, { params });
    return res.data;
  },

  async updateVersionTarget(hash: string, targetColumn: string | null): Promise<VersionProfile> {
    const res = await apiClient.put<VersionProfile>(`/versions/${hash}/target`, {
      target_column: targetColumn,
    });
    return res.data;
  },

  getDownloadUrl(hash: string): string {
    return `${API_BASE}/versions/download/${hash}`;
  },

  // Transformations
  async applyTransformation(
    sourceVersionId: string,
    transformationName: string,
    parameters: Record<string, any>
  ): Promise<DatasetVersion> {
    const res = await apiClient.post<DatasetVersion>(
      `/transformations/apply/${sourceVersionId}`,
      {
        transformation_name: transformationName,
        parameters,
      }
    );
    return res.data;
  },

  // Cleaning
  async previewCleaning(
    sourceVersionHash: string,
    operations: CleaningOperation[],
    targetColumn?: string | null
  ): Promise<CleaningPreviewResponse> {
    const res = await apiClient.post<CleaningPreviewResponse>('/cleaning/preview', {
      source_version_hash: sourceVersionHash,
      operations,
      target_column: targetColumn || null,
    });
    return res.data;
  },

  async applyCleaning(
    sourceVersionHash: string,
    operations: CleaningOperation[],
    targetColumn?: string | null,
    confirmTargetModification: boolean = false
  ): Promise<CleaningApplyResponse> {
    const res = await apiClient.post<CleaningApplyResponse>('/cleaning/apply', {
      source_version_hash: sourceVersionHash,
      operations,
      target_column: targetColumn || null,
      confirm_target_modification: confirmTargetModification,
    });
    return res.data;
  },

  async getColumnCategories(
    versionHash: string,
    column: string,
    normalized: boolean = false
  ): Promise<CategoryResponse> {
    const res = await apiClient.get<CategoryResponse>('/cleaning/categories', {
      params: { version_hash: versionHash, column, normalized },
    });
    return res.data;
  },

  // Augmentation
  async previewAugmentation(payload: AugmentationPreviewRequest): Promise<AugmentationPreviewResponse> {
    const res = await apiClient.post<AugmentationPreviewResponse>('/augmentation/preview', payload);
    return res.data;
  },

  async applyAugmentation(payload: AugmentationApplyRequest): Promise<AugmentationApplyResponse> {
    const res = await apiClient.post<AugmentationApplyResponse>('/augmentation/apply', payload);
    return res.data;
  },

  async compareAugmentation(payload: AugmentationComparisonRequest): Promise<AugmentationComparisonResponse> {
    const res = await apiClient.post<AugmentationComparisonResponse>('/augmentation/compare', payload);
    return res.data;
  },

  // ==========================================
  // 04. Versioning Endpoints
  // ==========================================

  async getLineageGraph(datasetId: string): Promise<LineageGraphResponse> {
    const res = await apiClient.get<LineageGraphResponse>(`/datasets/${datasetId}/lineage`);
    return res.data;
  },

  async getVersioningHeader(datasetId: string): Promise<VersioningHeaderMetrics> {
    const res = await apiClient.get<VersioningHeaderMetrics>(`/datasets/${datasetId}/versioning-header`);
    return res.data;
  },

  async setCurrentVersion(datasetId: string, versionHash: string): Promise<{ success: boolean; current_version_hash: string }> {
    const res = await apiClient.put(`/datasets/${datasetId}/current-version`, { version_hash: versionHash });
    return res.data;
  },

  async setBaselineVersion(datasetId: string, versionHash: string): Promise<{ success: boolean; baseline_version_hash: string }> {
    const res = await apiClient.put(`/datasets/${datasetId}/baseline-version`, { version_hash: versionHash });
    return res.data;
  },

  async addVersionTag(versionHash: string, tag: string): Promise<TagRead> {
    const res = await apiClient.post<TagRead>(`/versions/${versionHash}/tags`, { tag });
    return res.data;
  },

  async removeVersionTag(versionHash: string, tag: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete(`/versions/${versionHash}/tags/${tag}`);
    return res.data;
  },

  async restoreVersion(versionHash: string): Promise<{ success: boolean; message: string; current_version_hash: string }> {
    const res = await apiClient.post(`/versions/${versionHash}/restore`);
    return res.data;
  },

  async branchFromVersion(versionHash: string, branchName: string, description?: string): Promise<DatasetVersion> {
    const res = await apiClient.post<DatasetVersion>(`/versions/${versionHash}/branch`, {
      branch_name: branchName,
      description,
    });
    return res.data;
  },

  async deleteVersion(versionHash: string): Promise<{ success: boolean; message: string; deleted_hash: string }> {
    const res = await apiClient.delete(`/versions/${versionHash}`);
    return res.data;
  },

  async compareVersions(baseHash: string, targetHash: string, rowKey?: string): Promise<CompareResponse> {
    const res = await apiClient.post<CompareResponse>('/versions/compare', {
      base_version_hash: baseHash,
      target_version_hash: targetHash,
      row_key: rowKey || null,
    });
    return res.data;
  },

  async getRowDiff(
    baseHash: string,
    targetHash: string,
    filter: 'all' | 'added' | 'removed' | 'modified' = 'all',
    page: number = 1,
    pageSize: number = 20,
    rowKey?: string
  ): Promise<RowDiffPage> {
    const res = await apiClient.get<RowDiffPage>('/versions/diff/rows', {
      params: {
        base_hash: baseHash,
        target_hash: targetHash,
        filter,
        page,
        page_size: pageSize,
        row_key: rowKey || undefined,
      },
    });
    return res.data;
  },

  async queryView(
    versionHash: string,
    params?: { split?: string; origin?: string; is_synthetic?: boolean; limit?: number; offset?: number }
  ): Promise<ViewQueryResponse> {
    const res = await apiClient.get<ViewQueryResponse>(`/versions/${versionHash}/views/query`, {
      params,
    });
    return res.data;
  },

  getViewDownloadUrl(
    versionHash: string,
    format: 'csv' | 'parquet' | 'jsonl' = 'csv',
    params?: { split?: string; origin?: string; is_synthetic?: boolean }
  ): string {
    const query = new URLSearchParams();
    query.set('format', format);
    if (params?.split) query.set('split', params.split);
    if (params?.origin) query.set('origin', params.origin);
    if (params?.is_synthetic !== undefined) query.set('is_synthetic', String(params.is_synthetic));
    return `${API_BASE}/versions/${versionHash}/download-view?${query.toString()}`;
  },

  async replayRecipe(versionHash: string, file: File): Promise<{ success: boolean; message: string; created_versions: string[]; final_version_hash: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(`/versions/${versionHash}/replay`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getGuardrails(versionHash: string): Promise<GuardrailItem[]> {
    const res = await apiClient.get<GuardrailItem[]>(`/versions/${versionHash}/guardrails`);
    return res.data;
  },

  async getDatasetCard(versionHash: string): Promise<DatasetCardResponse> {
    const res = await apiClient.get<DatasetCardResponse>(`/versions/${versionHash}/card`);
    return res.data;
  },

  // ==========================================
  // Step 05: Labeling
  // ==========================================
  async getLabelingStatus(
    datasetId: string,
    targetColumn?: string,
    threshold: number = 0.90
  ): Promise<LabelingStatusResponse> {
    const res = await apiClient.get<LabelingStatusResponse>(`/labeling/${datasetId}/status`, {
      params: {
        target_column: targetColumn || undefined,
        threshold,
      },
    });
    return res.data;
  },

  async getQueueCandidate(
    datasetId: string,
    queue: string = 'suspected_errors',
    index: number = 0,
    targetColumn?: string,
    threshold: number = 0.90
  ): Promise<QueueItemResponse> {
    const res = await apiClient.get<QueueItemResponse>(`/labeling/${datasetId}/candidate`, {
      params: {
        queue,
        index,
        target_column: targetColumn || undefined,
        threshold,
      },
    });
    return res.data;
  },

  async applyLabelDecision(
    datasetId: string,
    data: {
      rowIndex: number;
      customerId: string;
      decision: string;
      newLabel?: string;
      reason?: string;
      queueId?: string;
    }
  ): Promise<{ success: boolean; message: string; change_id: string; new_label: string }> {
    const res = await apiClient.post(`/labeling/${datasetId}/decision`, {
      row_index: data.rowIndex,
      customer_id: data.customerId,
      decision: data.decision,
      new_label: data.newLabel,
      reason: data.reason,
      queue_id: data.queueId || 'suspected_errors',
    });
    return res.data;
  },

  async applyBulkFix(
    datasetId: string,
    data: {
      rowIndices: number[];
      newLabel: string;
      reason: string;
      patternDescription: string;
    }
  ): Promise<{ success: boolean; message: string; modified_count: number }> {
    const res = await apiClient.post(`/labeling/${datasetId}/bulk-fix`, {
      row_indices: data.rowIndices,
      new_label: data.newLabel,
      reason: data.reason,
      pattern_description: data.patternDescription,
    });
    return res.data;
  },

  async getLabelChecks(datasetId: string): Promise<LabelChecksResponse> {
    const res = await apiClient.get<LabelChecksResponse>(`/labeling/${datasetId}/checks`);
    return res.data;
  },

  async saveLabelingVersion(
    datasetId: string,
    data: {
      rerunAugmentation?: boolean;
      versionLabel?: string;
      description?: string;
    }
  ): Promise<SaveLabelingVersionResponse> {
    const res = await apiClient.post<SaveLabelingVersionResponse>(`/labeling/${datasetId}/save-version`, {
      rerun_augmentation: data.rerunAugmentation ?? false,
      version_label: data.versionLabel,
      description: data.description,
    });
    return res.data;
  },

  // Step 06: Training
  async getTrainingConfig(datasetId: string): Promise<TrainingConfigResponse> {
    const res = await apiClient.get<TrainingConfigResponse>(`/training/${datasetId}/config`);
    return res.data;
  },

  async getTrainingHeader(datasetId: string): Promise<TrainingHeaderSummary> {
    const res = await apiClient.get<TrainingHeaderSummary>(`/training/${datasetId}/header`);
    return res.data;
  },

  async getTrainingRuns(datasetId: string, status?: string): Promise<TrainingRunListItem[]> {
    const params = status ? { status } : {};
    const res = await apiClient.get<TrainingRunListItem[]>(`/training/${datasetId}/runs`, { params });
    return res.data;
  },

  async getTrainingRunDetail(
    runId: string,
    split: string = 'val',
    threshold?: number
  ): Promise<TrainingRunDetailResponse> {
    const params: Record<string, any> = { split };
    if (threshold !== undefined) params.threshold = threshold;
    const res = await apiClient.get<TrainingRunDetailResponse>(`/training/runs/${runId}`, { params });
    return res.data;
  },

  async startTrainingRun(
    datasetId: string,
    req: StartRunRequest
  ): Promise<{ success: boolean; run_id: string; run_name: string }> {
    const res = await apiClient.post(`/training/${datasetId}/runs`, req);
    return res.data;
  },

  async stopTrainingRun(runId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post(`/training/runs/${runId}/stop`);
    return res.data;
  },

  async evaluateRunOnTest(runId: string): Promise<{ success: boolean; message: string; test_eval_count: number }> {
    const res = await apiClient.post(`/training/runs/${runId}/evaluate-test`);
    return res.data;
  },

  async promoteRun(runId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post(`/training/runs/${runId}/promote`);
    return res.data;
  },

  async getTrainingCompare(datasetId: string): Promise<TrainingCompareResponse> {
    const res = await apiClient.get<TrainingCompareResponse>(`/training/${datasetId}/compare`);
    return res.data;
  },

  // Active Learning
  async getActiveLearningState(datasetId: string): Promise<ActiveLearningStateResponse> {
    const res = await apiClient.get<ActiveLearningStateResponse>(`/active-learning/${datasetId}/state`);
    return res.data;
  },

  async updateActiveLearningSettings(
    datasetId: string,
    req: UpdateRoundSettingsRequest
  ): Promise<ActiveLearningStateResponse> {
    const res = await apiClient.put<ActiveLearningStateResponse>(`/active-learning/${datasetId}/settings`, req);
    return res.data;
  },

  async sendPicksToLabeling(
    datasetId: string,
    req: SendToLabelingRequest
  ): Promise<SendToLabelingResponse> {
    const res = await apiClient.post<SendToLabelingResponse>(`/active-learning/${datasetId}/send-to-labeling`, req);
    return res.data;
  },

  // Drift & Monitoring
  async getDriftState(datasetId: string): Promise<DriftStateResponse> {
    const res = await apiClient.get<DriftStateResponse>(`/drift/${datasetId}/state`);
    return res.data;
  },

  async updateDriftSettings(
    datasetId: string,
    req: UpdateDriftSettingsRequest
  ): Promise<DriftStateResponse> {
    const res = await apiClient.put<DriftStateResponse>(`/drift/${datasetId}/settings`, req);
    return res.data;
  },

  async runDriftCheckNow(datasetId: string): Promise<RunDriftCheckResponse> {
    const res = await apiClient.post<RunDriftCheckResponse>(`/drift/${datasetId}/check-now`);
    return res.data;
  },

  // Export / API
  async getExportApiState(datasetId: string): Promise<ExportApiStateResponse> {
    const res = await apiClient.get<ExportApiStateResponse>(`/export-api/${datasetId}/state`);
    return res.data;
  },

  async updateExportSettings(
    datasetId: string,
    req: UpdateExportSettingsRequest
  ): Promise<ExportApiStateResponse> {
    const res = await apiClient.put<ExportApiStateResponse>(`/export-api/${datasetId}/settings`, req);
    return res.data;
  },

  async deployToStaging(datasetId: string): Promise<DeployToStagingResponse> {
    const res = await apiClient.post<DeployToStagingResponse>(`/export-api/${datasetId}/deploy-staging`);
    return res.data;
  },

  async createApiKey(
    datasetId: string,
    name: string,
    scope: string
  ): Promise<{ key: string; name: string; scope: string; status: string }> {
    const res = await apiClient.post(`/export-api/${datasetId}/api-keys`, { name, scope });
    return res.data;
  },

  async getTextProfile(datasetId: string, versionHash?: string): Promise<TextProfileResponse> {
    const params = versionHash ? { version_hash: versionHash } : {};
    const res = await apiClient.get<TextProfileResponse>(`/text-profiling/${datasetId}/profile`, { params });
    return res.data;
  },

  async uploadTextFile(file: File, datasetName?: string): Promise<TextProfileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (datasetName) formData.append('dataset_name', datasetName);
    const res = await apiClient.post<TextProfileResponse>('/text-profiling/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getImageProfile(datasetId: string, versionHash?: string): Promise<ImageProfileResponse> {
    const params = versionHash ? { version_hash: versionHash } : {};
    const res = await apiClient.get<ImageProfileResponse>(`/image-profiling/${datasetId}/profile`, { params });
    return res.data;
  },

  async uploadImageArchive(file: File, datasetName?: string): Promise<ImageProfileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (datasetName) formData.append('dataset_name', datasetName);
    const res = await apiClient.post<ImageProfileResponse>('/image-profiling/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getTextCleaningRecipe(datasetId: string, versionHash?: string): Promise<TextCleaningRecipeResponse> {
    const params = versionHash ? { version_hash: versionHash } : {};
    const res = await apiClient.get<TextCleaningRecipeResponse>(`/text-cleaning/${datasetId}/recipe`, { params });
    return res.data;
  },

  async dryRunTextCleaningRecipe(datasetId: string, payload: any): Promise<any> {
    const res = await apiClient.post(`/text-cleaning/${datasetId}/dry-run`, payload);
    return res.data;
  },

  async applyTextCleaningRecipe(datasetId: string, payload: any): Promise<TextCleaningRecipeResponse> {
    const res = await apiClient.post<TextCleaningRecipeResponse>(`/text-cleaning/${datasetId}/apply`, payload);
    return res.data;
  },

  async getImageCleaningRecipe(datasetId: string, versionHash?: string): Promise<ImageCleaningRecipeResponse> {
    const params = versionHash ? { version_hash: versionHash } : {};
    const res = await apiClient.get<ImageCleaningRecipeResponse>(`/image-cleaning/${datasetId}/recipe`, { params });
    return res.data;
  },

  async dryRunImageCleaningRecipe(datasetId: string, payload: any): Promise<any> {
    const res = await apiClient.post(`/image-cleaning/${datasetId}/dry-run`, payload);
    return res.data;
  },

  async applyImageCleaningRecipe(datasetId: string, payload: any): Promise<ImageCleaningRecipeResponse> {
    const res = await apiClient.post<ImageCleaningRecipeResponse>(`/image-cleaning/${datasetId}/apply`, payload);
    return res.data;
  },

  async getTextAugmentationRecipe(datasetId: string, versionHash?: string): Promise<TextAugmentationRecipeResponse> {
    const params = versionHash ? { version_hash: versionHash } : {};
    const res = await apiClient.get<TextAugmentationRecipeResponse>(`/text-augmentation/${datasetId}/recipe`, { params });
    return res.data;
  },

  async compareTextAugmentation(datasetId: string, payload: any): Promise<TextAugmentationComparisonResponse> {
    const res = await apiClient.post<TextAugmentationComparisonResponse>(`/text-augmentation/${datasetId}/compare`, payload);
    return res.data;
  },

  async saveTextAugmentationV3(datasetId: string, payload: any): Promise<TextAugmentationRecipeResponse> {
    const res = await apiClient.post<TextAugmentationRecipeResponse>(`/text-augmentation/${datasetId}/save-v3`, payload);
    return res.data;
  },

  async getImageAugmentationRecipe(datasetId: string, versionHash?: string): Promise<ImageAugmentationRecipeResponse> {
    const params = versionHash ? { version_hash: versionHash } : {};
    const res = await apiClient.get<ImageAugmentationRecipeResponse>(`/image-augmentation/${datasetId}/recipe`, { params });
    return res.data;
  },

  async compareImageAugmentation(datasetId: string, payload: any): Promise<ImageAugmentationComparisonResponse> {
    const res = await apiClient.post<ImageAugmentationComparisonResponse>(`/image-augmentation/${datasetId}/compare`, payload);
    return res.data;
  },

  async saveImageAugmentationV3(datasetId: string, payload: any): Promise<ImageAugmentationRecipeResponse> {
    const res = await apiClient.post<ImageAugmentationRecipeResponse>(`/image-augmentation/${datasetId}/save-v3`, payload);
    return res.data;
  },
};



