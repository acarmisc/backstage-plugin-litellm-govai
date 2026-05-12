import { LiteLLMConfig, UserInfo, VirtualKey, ModelInfo, UsageMetrics, GenerateKeyRequest, GenerateKeyResponse, DeleteKeyRequest } from './types';

const DEFAULT_TIMEOUT = 30000;

export class LiteLLMClient {
  private baseUrl: string;
  private masterKey: string;
  private timeout: number;

  constructor(config: LiteLLMConfig, timeout = DEFAULT_TIMEOUT) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.masterKey = config.masterKey;
    this.timeout = timeout;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.masterKey}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`LiteLLM API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getUserInfo(userId?: string): Promise<UserInfo> {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return this.request<UserInfo>(`/user/info${query}`);
  }

  async listKeys(userId?: string): Promise<VirtualKey[]> {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    const response = await this.request<{ info: VirtualKey[] } | VirtualKey[]>(`/key/info${query}`);
    return Array.isArray(response) ? response : (response.info ?? []);
  }

  async generateKey(request: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    return this.request<GenerateKeyResponse>('/key/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteKeys(request: DeleteKeyRequest): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/key/delete', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.request<{ data: ModelInfo[] } | ModelInfo[]>('/models');
    return Array.isArray(response) ? response : (response.data ?? []);
  }

  async getUsage(startDate: string, endDate: string, userId?: string, groupBy?: string): Promise<UsageMetrics> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (userId) params.append('user_id', userId);
    if (groupBy) params.append('group_by', groupBy);

    return this.request<UsageMetrics>(`/usage/keys?${params.toString()}`);
  }
}
