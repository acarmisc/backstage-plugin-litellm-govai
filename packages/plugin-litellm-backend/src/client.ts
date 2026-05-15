import {
  LiteLLMConfig,
  UserInfo,
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  UpdateKeyRequest,
  DeleteKeyRequest,
  CreateUserRequest,
  CreateUserResponse,
} from './types';

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
        const err = new Error(`LiteLLM API error: ${response.status} ${response.statusText} - ${errorBody}`);
        (err as any).status = response.status;
        throw err;
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Returns null when the user is not found in LiteLLM (404).
   * Throws on all other errors so callers know something went wrong.
   */
  async getUserInfo(userId?: string): Promise<UserInfo | null> {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    try {
      return await this.request<UserInfo>(`/user/info${query}`);
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async createUser(payload: CreateUserRequest): Promise<CreateUserResponse> {
    return this.request<CreateUserResponse>('/user/new', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listKeys(userId?: string): Promise<VirtualKey[]> {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    try {
      const response = await this.request<{ info: VirtualKey[] } | VirtualKey[]>(`/key/info${query}`);
      return Array.isArray(response) ? response : (response.info ?? []);
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('not found')) {
        return [];
      }
      throw err;
    }
  }

  async generateKey(request: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    return this.request<GenerateKeyResponse>('/key/generate', {
      method: 'POST',
      body: JSON.stringify({ json: request }),
    });
  }

  async updateKey(request: UpdateKeyRequest): Promise<VirtualKey> {
    return this.request<VirtualKey>('/key/update', {
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

  async getTeamInfo(teamId: string): Promise<TeamInfo> {
    return this.request<TeamInfo>(`/team/info?team_id=${encodeURIComponent(teamId)}`);
  }

  private emptyUsage(): UsageMetrics {
    return {
      total_spend: 0,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      api_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      usage_by_model: {},
      usage_by_key: {},
      daily_usage: [],
      daily_by_model: [],
    };
  }

  /**
   * Transforms LiteLLM's SpendAnalyticsPaginatedResponse into the flatter
   * UsageMetrics shape consumed by the frontend charts.
   *
   * Source shape (per result row):
   *   { date, metrics, breakdown: { models: { [name]: { metrics, api_key_breakdown: { [keyHash]: { metrics, metadata } } } } } }
   *
   * We fan that out into three views the UI consumes:
   *   - daily_usage     → spend + request trends over time
   *   - usage_by_model  → which models drove cost / traffic
   *   - usage_by_key    → which keys drove cost / traffic (with key_alias + team_id from metadata)
   */
  private transformDailyActivity(response: any): UsageMetrics {
    const results: any[] = Array.isArray(response?.results) ? response.results : [];
    const meta = response?.metadata ?? {};

    const daily_usage = results
      .map(r => ({
        date: r.date,
        spend: r.metrics?.spend ?? 0,
        total_tokens: r.metrics?.total_tokens ?? 0,
        prompt_tokens: r.metrics?.prompt_tokens ?? 0,
        completion_tokens: r.metrics?.completion_tokens ?? 0,
        api_requests: r.metrics?.api_requests ?? 0,
        successful_requests: r.metrics?.successful_requests ?? 0,
        failed_requests: r.metrics?.failed_requests ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const usage_by_model: UsageMetrics['usage_by_model'] = {};
    const usage_by_key: UsageMetrics['usage_by_key'] = {};
    const daily_by_model: UsageMetrics['daily_by_model'] = [];

    const emptyModelBucket = () => ({
      total_spend: 0,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      api_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
    });

    for (const r of results) {
      const models = r.breakdown?.models ?? {};
      for (const [name, entry] of Object.entries<any>(models)) {
        const m = entry?.metrics ?? {};
        const bucket = usage_by_model[name] ?? emptyModelBucket();
        bucket.total_spend += m.spend ?? 0;
        bucket.total_tokens += m.total_tokens ?? 0;
        bucket.prompt_tokens += m.prompt_tokens ?? 0;
        bucket.completion_tokens += m.completion_tokens ?? 0;
        bucket.api_requests += m.api_requests ?? 0;
        bucket.successful_requests += m.successful_requests ?? 0;
        bucket.failed_requests += m.failed_requests ?? 0;
        usage_by_model[name] = bucket;

        daily_by_model.push({
          date: r.date,
          model: name,
          spend: m.spend ?? 0,
          prompt_tokens: m.prompt_tokens ?? 0,
          completion_tokens: m.completion_tokens ?? 0,
          total_tokens: m.total_tokens ?? 0,
          api_requests: m.api_requests ?? 0,
          successful_requests: m.successful_requests ?? 0,
          failed_requests: m.failed_requests ?? 0,
        });

        const keyMap = entry?.api_key_breakdown ?? {};
        for (const [keyHash, keyEntry] of Object.entries<any>(keyMap)) {
          const km = keyEntry?.metrics ?? {};
          const kmeta = keyEntry?.metadata ?? {};
          const kb = usage_by_key[keyHash] ?? {
            key_alias: kmeta.key_alias,
            team_id: kmeta.team_id ?? null,
            models: [] as string[],
            ...emptyModelBucket(),
          };
          if (!kb.key_alias && kmeta.key_alias) kb.key_alias = kmeta.key_alias;
          if (kb.team_id == null && kmeta.team_id) kb.team_id = kmeta.team_id;
          if (!kb.models.includes(name)) kb.models.push(name);
          kb.total_spend += km.spend ?? 0;
          kb.total_tokens += km.total_tokens ?? 0;
          kb.prompt_tokens += km.prompt_tokens ?? 0;
          kb.completion_tokens += km.completion_tokens ?? 0;
          kb.api_requests += km.api_requests ?? 0;
          kb.successful_requests += km.successful_requests ?? 0;
          kb.failed_requests += km.failed_requests ?? 0;
          usage_by_key[keyHash] = kb;
        }
      }
    }

    return {
      total_spend: meta.total_spend ?? 0,
      total_tokens: meta.total_tokens ?? 0,
      prompt_tokens: meta.total_prompt_tokens ?? 0,
      completion_tokens: meta.total_completion_tokens ?? 0,
      api_requests: meta.total_api_requests ?? 0,
      successful_requests: meta.total_successful_requests ?? 0,
      failed_requests: meta.total_failed_requests ?? 0,
      usage_by_model,
      usage_by_key,
      daily_usage,
      daily_by_model,
    };
  }

  async getUsage(startDate: string, endDate: string, userId?: string, _groupBy?: string): Promise<UsageMetrics> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      page_size: '100',
    });
    if (userId) params.append('user_id', userId);
    try {
      const response = await this.request<any>(`/user/daily/activity?${params.toString()}`);
      return this.transformDailyActivity(response);
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('not found')) {
        return this.emptyUsage();
      }
      throw err;
    }
  }

  async getTeamUsage(teamId: string, startDate: string, endDate: string): Promise<UsageMetrics> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      team_ids: teamId,
      page_size: '100',
    });
    try {
      const response = await this.request<any>(`/team/daily/activity?${params.toString()}`);
      return this.transformDailyActivity(response);
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('not found')) {
        return this.emptyUsage();
      }
      throw err;
    }
  }
}
