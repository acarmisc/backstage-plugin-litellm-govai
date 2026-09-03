import {
  LiteLLMConfig,
  UserInfo,
  VirtualKey,
  LiteLLMUserKey,
  ModelInfo,
  UsageMetrics,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  UpdateKeyRequest,
  DeleteKeyRequest,
  CreateUserRequest,
  CreateUserResponse,
  CreateTeamRequest,
  CreateTeamResponse,
  UpdateTeamRequest,
  AuditLogsParams,
  PaginatedAuditLogs,
} from './types';

const DEFAULT_TIMEOUT = 30000;

/**
 * Typed error for failed upstream LiteLLM responses. Preserves the HTTP
 * status and the structured `param` (e.g. `key_alias`) from the upstream
 * body so the router can surface a 400 instead of collapsing everything
 * into a 500. The message is the upstream `error.message` when present,
 * otherwise the raw body text.
 */
export class LiteLLMUpstreamError extends Error {
  status: number;
  param?: string;

  constructor(status: number, statusText: string, body: string) {
    let message = `LiteLLM API error: ${status} ${statusText} - ${body}`;
    let param: string | undefined;
    try {
      const parsed = JSON.parse(body);
      const inner = parsed?.error ?? parsed;
      if (typeof inner?.message === 'string') message = inner.message;
      if (typeof inner?.param === 'string' && inner.param !== 'None') {
        param = inner.param;
      }
    } catch {
      // not JSON — keep the raw body in the message
    }
    super(message);
    this.status = status;
    this.param = param;
  }
}

function extractModelList(fallback: { data?: any[] } | any[]): any[] {
  if (Array.isArray(fallback)) return fallback;
  if (Array.isArray(fallback?.data)) return fallback.data;
  return [];
}

export class LiteLLMClient {
  private baseUrl: string;
  private masterKey: string;
  private timeout: number;

  constructor(config: LiteLLMConfig, timeout = DEFAULT_TIMEOUT) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.masterKey = config.masterKey;
    this.timeout = timeout;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Auth note: the LiteLLM OpenAPI spec declares the security scheme as an
      // `x-litellm-api-key` header, but Bearer + master key is the deliberate,
      // production-tested choice — LiteLLM's proxy accepts both, and Bearer is
      // what every observed deployment actually uses. Do not "correct" this to
      // match the spec literally without testing against a live gateway.
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.masterKey}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new LiteLLMUpstreamError(
          response.status,
          response.statusText,
          errorBody,
        );
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Returns null when the user is not found in LiteLLM (404).
   * Throws on all other errors so callers know something went wrong.
   *
   * LiteLLM's `/user/info` wraps the user row inside `user_info` and returns
   * `teams` as an array of full team objects, not team_id strings. We flatten
   * `user_info` onto the top level and reduce `teams` to a string[] of ids so
   * the rest of the code can rely on the UserInfo contract.
   */
  async getUserInfo(userId?: string): Promise<UserInfo | null> {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    try {
      const raw = await this.request<any>(`/user/info${query}`);
      const inner = raw?.user_info ?? {};
      const teamIds: string[] = Array.isArray(raw?.teams)
        ? raw.teams
            .map((t: any) => (typeof t === 'string' ? t : t?.team_id))
            .filter((t: unknown): t is string => typeof t === 'string')
        : [];
      return {
        user_id: raw?.user_id ?? inner.user_id ?? userId ?? '',
        user_email: inner.user_email ?? raw?.user_email,
        email: inner.email ?? raw?.email,
        teams: teamIds,
        models: inner.models ?? raw?.models,
        max_budget: inner.max_budget ?? raw?.max_budget,
        spend: inner.spend ?? raw?.spend,
        current_spend: inner.current_spend ?? raw?.current_spend,
        soft_limit: inner.soft_limit ?? raw?.soft_limit,
        hard_limit: inner.hard_limit ?? raw?.hard_limit,
      };
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

  /**
   * Updates an existing LiteLLM user record. Used as a defensive follow-up
   * after /user/new because the upsert path of /user/new has been observed
   * to silently drop fields like user_role under concurrent inserts.
   */
  async updateUser(
    payload: Partial<CreateUserRequest> & { user_id: string },
  ): Promise<unknown> {
    return this.request<unknown>('/user/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Returns the keys belonging to a user.
   *
   * Implementation note: LiteLLM's `/key/info` endpoint requires a `key`
   * hash and returns 404 when only `user_id` is passed. The correct way
   * to enumerate a user's keys is `/user/info?user_id=X`, which embeds
   * a `keys` array with per-key metadata. We unwrap that array and
   * normalise field names to match the frontend VirtualKey shape
   * (LiteLLM exposes `key_name` for the masked display value and
   * `expires` instead of `expires_at`).
   */
  async listKeys(userId?: string): Promise<VirtualKey[]> {
    if (!userId) return [];
    try {
      const response = await this.request<{ keys?: LiteLLMUserKey[] }>(
        `/user/info?user_id=${encodeURIComponent(userId)}`,
      );
      const rawKeys = response.keys ?? [];
      return rawKeys.map(this.toVirtualKey);
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('not found')) {
        return [];
      }
      throw err;
    }
  }

  private toVirtualKey(k: LiteLLMUserKey): VirtualKey {
    return {
      key: k.key_name ?? k.token,
      token: k.token,
      key_alias: k.key_alias ?? undefined,
      created_at: k.created_at,
      expires_at: k.expires ?? undefined,
      spend: k.spend ?? 0,
      max_budget: k.max_budget ?? undefined,
      tpm_limit: k.tpm_limit ?? undefined,
      rpm_limit: k.rpm_limit ?? undefined,
      models: k.models ?? [],
      user_id: k.user_id ?? undefined,
      blocked: k.blocked ?? undefined,
    };
  }

  /**
   * Creates a new virtual key on the LiteLLM proxy.
   *
   * Implementation notes — both required to avoid silently-empty keys:
   *   1. The body must be the plain payload. An earlier version wrapped
   *      it as `{ json: request }`; LiteLLM doesn't unwrap that envelope
   *      and treats the request as having no fields, returning a key
   *      with null alias / models / budget / limits.
   *   2. LiteLLM expects `key_alias`, not `alias`. Without the rename,
   *      the alias the user typed is dropped on the floor.
   */
  async generateKey(request: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    const { alias, ...rest } = request;
    const payload = {
      ...rest,
      ...(alias && { key_alias: alias }),
    };
    return this.request<GenerateKeyResponse>('/key/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
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

  async blockKey(key: string): Promise<unknown> {
    return this.request('/key/block', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  }

  async unblockKey(key: string): Promise<unknown> {
    return this.request('/key/unblock', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  }

  async resetKeySpend(key: string): Promise<unknown> {
    return this.request(`/key/${encodeURIComponent(key)}/reset_spend`, {
      method: 'POST',
      body: JSON.stringify({ reset_to: 0 }),
    });
  }

  async getAuditLogs(params: AuditLogsParams): Promise<PaginatedAuditLogs> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.page_size !== undefined) query.set('page_size', String(params.page_size));
    if (params.start_date) query.set('start_date', params.start_date);
    if (params.end_date) query.set('end_date', params.end_date);
    if (params.action) query.set('action', params.action);
    if (params.table_name) query.set('table_name', params.table_name);
    if (params.changed_by) query.set('changed_by', params.changed_by);
    if (params.sort_by) query.set('sort_by', params.sort_by);
    if (params.sort_order) query.set('sort_order', params.sort_order);
    return this.request<PaginatedAuditLogs>(`/audit?${query.toString()}`);
  }

  /**
   * Returns the proxy's model catalogue normalised to the ModelInfo shape.
   *
   * Prefers `/model/info` which exposes `model_name`, `mode`, capability flags
   * and per-token costs. Falls back to OpenAI-compatible `/models` (which only
   * returns `{id}`) so the dropdown still works on installs where `/model/info`
   * isn't reachable. Without this normalisation the UI saw blank labels and
   * a single "other" group because `/models` doesn't populate `model_name`
   * or `mode`.
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.request<{ data?: any[] }>('/model/info');
      const data = Array.isArray(response?.data) ? response.data : [];
      const normalised = data.map((m: any) => {
        const info = m.model_info ?? {};
        const params = m.litellm_params ?? {};
        return {
          model_name: m.model_name ?? params.model ?? info.id ?? '',
          mode: info.mode ?? m.mode ?? 'chat',
          supports_function_calling:
            info.supports_function_calling ?? m.supports_function_calling,
          supports_vision: info.supports_vision ?? m.supports_vision,
          input_cost_per_token:
            info.input_cost_per_token ?? params.input_cost_per_token,
          output_cost_per_token:
            info.output_cost_per_token ?? params.output_cost_per_token,
          max_input_tokens: info.max_input_tokens ?? m.max_input_tokens,
          max_output_tokens: info.max_output_tokens ?? m.max_output_tokens,
          access_groups: info.access_groups ?? m.access_groups,
        } as ModelInfo;
      });
      const filtered = normalised.filter(m => m.model_name);
      if (filtered.length) return filtered;
    } catch {
      // fall through to /models
    }
    const fallback = await this.request<{ data?: any[] } | any[]>('/models');
    const data = extractModelList(fallback);
    return data
      .map((m: any) => ({
        model_name: m.model_name ?? m.id ?? '',
        mode: m.mode ?? 'chat',
        supports_function_calling: m.supports_function_calling,
        supports_vision: m.supports_vision,
      }))
      .filter((m: ModelInfo) => m.model_name);
  }

  /**
   * LiteLLM's `/team/info` wraps the team row inside `team_info` (alongside
   * sibling `keys` / `team_memberships` arrays), the same shape as
   * `/user/info` wrapping the user row inside `user_info`. Without unwrapping,
   * `team_alias`, `members_with_roles`, `models`, budgets and limits are all
   * undefined, so the UI fell back to displaying the raw team_id / "Untitled
   * team".
   */
  async getTeamInfo(teamId: string): Promise<TeamInfo> {
    const raw = await this.request<any>(
      `/team/info?team_id=${encodeURIComponent(teamId)}`,
    );
    return this.toTeamInfo(raw, teamId);
  }

  /**
   * Normalises a single team row into the TeamInfo contract. Tolerates both
   * the `/team/info` shape (row wrapped in a `team_info` envelope alongside
   * sibling arrays) and a bare row as returned per-item by `/team/list`.
   * `metadata` is always surfaced so callers can read `owning_group`.
   */
  private toTeamInfo(raw: any, fallbackId?: string): TeamInfo {
    const inner = raw?.team_info ?? {};
    return {
      team_id: raw?.team_id ?? inner.team_id ?? fallbackId ?? '',
      team_alias: inner.team_alias ?? raw?.team_alias,
      max_budget: inner.max_budget ?? raw?.max_budget,
      spend: inner.spend ?? raw?.spend ?? 0,
      members_with_roles: inner.members_with_roles ?? raw?.members_with_roles,
      models: inner.models ?? raw?.models,
      tpm_limit: inner.tpm_limit ?? raw?.tpm_limit,
      rpm_limit: inner.rpm_limit ?? raw?.rpm_limit,
      metadata: inner.metadata ?? raw?.metadata,
      object_permission: inner.object_permission ?? raw?.object_permission,
      blocked: inner.blocked ?? raw?.blocked,
      team_member_budget: inner.team_member_budget ?? raw?.team_member_budget,
    };
  }

  /**
   * Lists every team known to the LiteLLM proxy. Tolerates the observed
   * response shapes — a bare array, `{ teams: [...] }`, or `{ data: [...] }` —
   * and normalises each row through the same unwrap as `getTeamInfo`.
   *
   * This returns the GLOBAL team list and must never be exposed directly to
   * end users; callers are responsible for scoping the result (e.g. to teams
   * whose `metadata.owning_group` matches the caller's admin group).
   */
  async listTeams(): Promise<TeamInfo[]> {
    const raw = await this.request<any>('/team/list');
    let rows: any[] = [];
    if (Array.isArray(raw)) rows = raw;
    else if (Array.isArray(raw?.teams)) rows = raw.teams;
    else if (Array.isArray(raw?.data)) rows = raw.data;
    return rows.map(row => this.toTeamInfo(row));
  }

  async createTeam(payload: CreateTeamRequest): Promise<CreateTeamResponse> {
    return this.request<CreateTeamResponse>('/team/new', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateTeam(payload: UpdateTeamRequest): Promise<unknown> {
    return this.request<unknown>('/team/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteTeam(teamId: string): Promise<unknown> {
    return this.request<unknown>('/team/delete', {
      method: 'POST',
      body: JSON.stringify({ team_ids: [teamId] }),
    });
  }

  async blockTeam(teamId: string): Promise<unknown> {
    return this.request<unknown>('/team/block', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId }),
    });
  }

  async unblockTeam(teamId: string): Promise<unknown> {
    return this.request<unknown>('/team/unblock', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId }),
    });
  }

  /**
   * Adds a member to a team. LiteLLM's `/team/member_add` nests the member
   * under a `member` object; `role` is 'user' or 'admin' (we only ever send
   * 'user' from Backstage). `max_budget_in_team` optionally caps that member's
   * spend within the team.
   */
  async teamMemberAdd(payload: {
    team_id: string;
    user_id: string;
    role?: 'user';
    max_budget_in_team?: number;
  }): Promise<unknown> {
    return this.request<unknown>('/team/member_add', {
      method: 'POST',
      body: JSON.stringify({
        team_id: payload.team_id,
        member: { user_id: payload.user_id, role: payload.role ?? 'user' },
        ...(payload.max_budget_in_team !== undefined && {
          max_budget_in_team: payload.max_budget_in_team,
        }),
      }),
    });
  }

  /** Removes a member from a team via LiteLLM's `/team/member_delete`. */
  async teamMemberDelete(payload: {
    team_id: string;
    user_id: string;
  }): Promise<unknown> {
    return this.request<unknown>('/team/member_delete', {
      method: 'POST',
      body: JSON.stringify({
        team_id: payload.team_id,
        user_id: payload.user_id,
      }),
    });
  }

  /**
   * Lists the vector stores (knowledge bases) registered on the LiteLLM proxy.
   * Tolerates a bare array, `{ data: [...] }`, or `{ vector_stores: [...] }`.
   * Each entry is normalised to `{ id, name? }` — `id` prefers
   * `vector_store_id` then `id` then `name`.
   */
  async listVectorStores(): Promise<Array<{ id: string; name?: string }>> {
    const raw = await this.request<any>('/vector_store/list');
    let rows: any[] = [];
    if (Array.isArray(raw)) rows = raw;
    else if (Array.isArray(raw?.data)) rows = raw.data;
    else if (Array.isArray(raw?.vector_stores)) rows = raw.vector_stores;
    return rows
      .map(r => ({
        id: r?.vector_store_id ?? r?.id ?? r?.name ?? '',
        name: r?.vector_store_name ?? r?.name ?? undefined,
      }))
      .filter(r => r.id);
  }

  /**
   * Lists the MCP servers registered on the LiteLLM proxy. Path is
   * `/mcp/server/list`; tolerates a bare array, `{ data: [...] }` or
   * `{ servers: [...] }`. Normalised to `{ id, name?, url? }` — `id` prefers
   * `server_id` then `id` then `alias`/`name`.
   */
  async listMcpServers(): Promise<
    Array<{ id: string; name?: string; url?: string }>
  > {
    const raw = await this.request<any>('/mcp/server/list');
    let rows: any[] = [];
    if (Array.isArray(raw)) rows = raw;
    else if (Array.isArray(raw?.data)) rows = raw.data;
    else if (Array.isArray(raw?.servers)) rows = raw.servers;
    return rows
      .map(r => ({
        id: r?.server_id ?? r?.id ?? r?.alias ?? r?.name ?? '',
        name: r?.alias ?? r?.name ?? undefined,
        url: r?.url ?? undefined,
      }))
      .filter(r => r.id);
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
    const results: any[] = Array.isArray(response?.results)
      ? response.results
      : [];
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
          if (kb.team_id === null && kmeta.team_id) kb.team_id = kmeta.team_id;
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

  async getUsage(
    startDate: string,
    endDate: string,
    userId?: string,
  ): Promise<UsageMetrics> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      page_size: '100',
    });
    if (userId) params.append('user_id', userId);
    try {
      const response = await this.request<any>(
        `/user/daily/activity?${params.toString()}`,
      );
      return this.transformDailyActivity(response);
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('not found')) {
        return this.emptyUsage();
      }
      throw err;
    }
  }

  async getTeamUsage(
    teamId: string,
    startDate: string,
    endDate: string,
  ): Promise<UsageMetrics> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      team_ids: teamId,
      page_size: '100',
    });
    try {
      const response = await this.request<any>(
        `/team/daily/activity?${params.toString()}`,
      );
      return this.transformDailyActivity(response);
    } catch (err: any) {
      if (err.status === 404 || err.message.includes('not found')) {
        return this.emptyUsage();
      }
      throw err;
    }
  }
}
