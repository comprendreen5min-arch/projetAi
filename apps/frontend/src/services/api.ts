import axios from 'axios';
import {
  Dataset,
  DatasetVersion,
  VersionProfile,
  CleaningOperation,
  CleaningPreviewResponse,
  CleaningApplyResponse,
  CategoryResponse,
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
};

