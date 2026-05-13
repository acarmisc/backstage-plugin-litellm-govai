import { createApiRef, FetchApi } from '@backstage/core-plugin-api';
import {
  UserInfo,
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
} from './types';

class ApiError extends Error {
  body: unknown;
  status: number;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface LiteLlmApiInterface {
  getUserInfo(): Promise<UserInfo>;
  listKeys(): Promise<VirtualKey[]>;
  generateKey(request: GenerateKeyRequest): Promise<GenerateKeyResponse>;
  deleteKey(keyId: string): Promise<{ success: boolean }>;
  listModels(): Promise<ModelInfo[]>;
  getTeams(): Promise<TeamInfo[]>;
  getUsage(startDate: string, endDate: string): Promise<UsageMetrics>;
  getTeamUsage(teamId: string, startDate: string, endDate: string): Promise<UsageMetrics>;
}

export const liteLlmApiRef = createApiRef<LiteLlmApiInterface>({
  id: 'plugin.litellm.api',
});

export class LiteLlmApi implements LiteLlmApiInterface {
  private fetchApi: FetchApi;
  private basePath: string;

  constructor(fetchApi: FetchApi, basePath: string = '/api/litellm') {
    this.fetchApi = fetchApi;
    this.basePath = basePath;
  }

  private async throwIfNotOk(response: Response): Promise<void> {
    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); } catch { body = await response.text().catch(() => ''); }
      throw new ApiError(`${response.status} ${response.statusText}`, response.status, body);
    }
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.basePath}${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
    }
    const response = await this.fetchApi.fetch(url.toString());
    await this.throwIfNotOk(response);
    return response.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchApi.fetch(`${this.basePath}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  private async del<T>(path: string): Promise<T> {
    const response = await this.fetchApi.fetch(`${this.basePath}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  // User identity is resolved server-side from the Backstage Bearer token.
  // No user_id param needed on the frontend.
  async getUserInfo(): Promise<UserInfo> {
    return this.get<UserInfo>('/user/info');
  }

  async listKeys(): Promise<VirtualKey[]> {
    return this.get<VirtualKey[]>('/keys');
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

  async getTeams(): Promise<TeamInfo[]> {
    return this.get<TeamInfo[]>('/teams');
  }

  async getUsage(startDate: string, endDate: string): Promise<UsageMetrics> {
    return this.get<UsageMetrics>('/usage', { start_date: startDate, end_date: endDate });
  }

  async getTeamUsage(teamId: string, startDate: string, endDate: string): Promise<UsageMetrics> {
    return this.get<UsageMetrics>(`/teams/${encodeURIComponent(teamId)}/usage`, {
      start_date: startDate,
      end_date: endDate,
    });
  }
}
