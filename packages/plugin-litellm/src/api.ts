import { FetchApi } from '@backstage/core-plugin-api';
import { UserInfo, VirtualKey, ModelInfo, UsageMetrics, GenerateKeyRequest, GenerateKeyResponse } from './types';

export class LiteLlmApi {
  private fetchApi: FetchApi;
  private basePath: string;

  constructor(fetchApi: FetchApi, basePath: string = '/api/litellm') {
    this.fetchApi = fetchApi;
    this.basePath = basePath;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.basePath}${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    const response = await this.fetchApi.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchApi.fetch(`${this.basePath}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  private async del<T>(path: string): Promise<T> {
    const response = await fetch(`${this.basePath}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getUserInfo(userId?: string): Promise<UserInfo> {
    const params = userId ? { user_id: userId } : undefined;
    return this.get<UserInfo>('/user/info', params);
  }

  async listKeys(userId?: string): Promise<VirtualKey[]> {
    const params = userId ? { user_id: userId } : undefined;
    return this.get<VirtualKey[]>('/keys', params);
  }

  async generateKey(request: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    return this.post<GenerateKeyResponse>('/keys/generate', request);
  }

  async deleteKey(keyId: string): Promise<{ success: boolean }> {
    return this.del<{ success: boolean }>(`/keys/${encodeURIComponent(keyId)}`);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.get<ModelInfo[]>('/models');
  }

  async getUsage(startDate: string, endDate: string, userId?: string): Promise<UsageMetrics> {
    const params: Record<string, string> = { start_date: startDate, end_date: endDate };
    if (userId) params.user_id = userId;
    return this.get<UsageMetrics>('/usage', params);
  }
}