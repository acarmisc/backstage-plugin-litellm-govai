import { createApiRef, FetchApi } from '@backstage/core-plugin-api';
import {
  UserInfo,
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  UpdateKeyRequest,
  AuditLogsParams,
  PaginatedAuditLogs,
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
  updateKey(keyId: string, request: UpdateKeyRequest): Promise<VirtualKey>;
  deleteKey(keyId: string): Promise<{ success: boolean }>;
  rotateKey(keyId: string): Promise<GenerateKeyResponse>;
  blockKey(keyId: string): Promise<void>;
  unblockKey(keyId: string): Promise<void>;
  resetKeySpend(keyId: string): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  getTeams(): Promise<TeamInfo[]>;
  getUsage(startDate: string, endDate: string): Promise<UsageMetrics>;
  getTeamUsage(teamId: string, startDate: string, endDate: string): Promise<UsageMetrics>;
  getAuditLogs(params: AuditLogsParams): Promise<PaginatedAuditLogs>;
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

  async updateKey(keyId: string, request: UpdateKeyRequest): Promise<VirtualKey> {
    return this.post<VirtualKey>(`/keys/${encodeURIComponent(keyId)}/update`, request);
  }

  async deleteKey(keyId: string): Promise<{ success: boolean }> {
    return this.del<{ success: boolean }>(`/keys/${encodeURIComponent(keyId)}`);
  }

  async rotateKey(keyId: string): Promise<GenerateKeyResponse> {
    return this.post<GenerateKeyResponse>(`/keys/${encodeURIComponent(keyId)}/regenerate`, {});
  }

  async blockKey(keyId: string): Promise<void> {
    await this.post(`/keys/${encodeURIComponent(keyId)}/block`, {});
  }

  async unblockKey(keyId: string): Promise<void> {
    await this.post(`/keys/${encodeURIComponent(keyId)}/unblock`, {});
  }

  async resetKeySpend(keyId: string): Promise<void> {
    await this.post(`/keys/${encodeURIComponent(keyId)}/reset_spend`, {});
  }

  async getAuditLogs(params: AuditLogsParams): Promise<PaginatedAuditLogs> {
    const strParams: Record<string, string> = {};
    if (params.page !== undefined) strParams.page = String(params.page);
    if (params.page_size !== undefined) strParams.page_size = String(params.page_size);
    if (params.start_date) strParams.start_date = params.start_date;
    if (params.end_date) strParams.end_date = params.end_date;
    if (params.action) strParams.action = params.action;
    if (params.table_name) strParams.table_name = params.table_name;
    if (params.changed_by) strParams.changed_by = params.changed_by;
    return this.get<PaginatedAuditLogs>('/audit', strParams);
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
