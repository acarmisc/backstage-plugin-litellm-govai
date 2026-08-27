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
  LiteLlmConfig,
} from '../src/types';
import { LiteLlmApiInterface } from '../src/api';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(now - offsetDays * day).toISOString();

const models: ModelInfo[] = [
  { model_name: 'gpt-4o', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.000005, output_cost_per_token: 0.000015, max_input_tokens: 128000, max_output_tokens: 16384 },
  { model_name: 'gpt-4o-mini', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.00000015, output_cost_per_token: 0.0000006, max_input_tokens: 128000, max_output_tokens: 16384 },
  { model_name: 'claude-3-5-sonnet', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.000003, output_cost_per_token: 0.000015, max_input_tokens: 200000, max_output_tokens: 8192 },
  { model_name: 'claude-3-haiku', mode: 'chat', supports_function_calling: true, supports_vision: false, input_cost_per_token: 0.00000025, output_cost_per_token: 0.00000125, max_input_tokens: 200000, max_output_tokens: 4096 },
  { model_name: 'bedrock/meta.llama3-1-8b-instruct', mode: 'chat', supports_function_calling: false, supports_vision: false, input_cost_per_token: 0.0000001, output_cost_per_token: 0.0000001, max_input_tokens: 128000, max_output_tokens: 4096 },
  { model_name: 'bedrock/amazon.titan-embed-text-v2:0', mode: 'embedding', input_cost_per_token: 0.0000001 },
  { model_name: 'text-embedding-3-large', mode: 'embedding', input_cost_per_token: 0.00000013 },
  { model_name: 'text-embedding-3-small', mode: 'embedding', input_cost_per_token: 0.00000002 },
  { model_name: 'dall-e-3', mode: 'image', input_cost_per_token: 0, output_cost_per_token: 0 },
];

const keys: VirtualKey[] = [
  { key: 'sk-...ab12', key_alias: 'jane-doe-personal', created_at: iso(30), expires_at: iso(-60), spend: 4.32, max_budget: 10, tpm_limit: 100000, rpm_limit: 1000, models: ['gpt-4o', 'claude-3-5-sonnet'], user_id: 'user:default/jane.doe' },
  { key: 'sk-...cd34', key_alias: 'platform-ai-bot', created_at: iso(12), spend: 41.8, max_budget: 100, models: [], user_id: 'user:default/jane.doe' },
  { key: 'sk-...ef56', key_alias: 'quick-test-key', created_at: iso(2), expires_at: iso(-5), spend: 0.02, max_budget: 5, models: ['gpt-4o'], user_id: 'user:default/jane.doe', blocked: true },
];

const teams: TeamInfo[] = [
  {
    team_id: 'team-platform-eng',
    team_alias: 'Platform Engineering',
    max_budget: 500,
    spend: 187.42,
    tpm_limit: 500000,
    rpm_limit: 5000,
    models: ['gpt-4o', 'claude-3-5-sonnet'],
    members_with_roles: [
      { user_id: 'user:default/jane.doe', user_email: 'jane.doe@example.com', role: 'admin' },
      { user_id: 'user:default/john.smith', user_email: 'john.smith@example.com', role: 'user' },
    ],
  },
];

function dailyUsage(daysBack: number) {
  return Array.from({ length: daysBack }).map((_, i) => {
    const spend = 2 + Math.random() * 8;
    const tokens = Math.round(spend * 20000 + Math.random() * 5000);
    return {
      date: iso(daysBack - 1 - i).slice(0, 10),
      spend: Number(spend.toFixed(2)),
      total_tokens: tokens,
      prompt_tokens: Math.round(tokens * 0.7),
      completion_tokens: Math.round(tokens * 0.3),
      api_requests: Math.round(spend * 12),
      successful_requests: Math.round(spend * 11.5),
      failed_requests: Math.round(spend * 0.5),
    };
  });
}

function usageMetrics(daysBack: number): UsageMetrics {
  const daily = dailyUsage(daysBack);
  const total_spend = Number(daily.reduce((a, d) => a + d.spend, 0).toFixed(2));
  const total_tokens = daily.reduce((a, d) => a + d.total_tokens, 0);
  const prompt_tokens = daily.reduce((a, d) => a + d.prompt_tokens, 0);
  const completion_tokens = daily.reduce((a, d) => a + d.completion_tokens, 0);
  const api_requests = daily.reduce((a, d) => a + d.api_requests, 0);
  const successful_requests = daily.reduce((a, d) => a + d.successful_requests, 0);
  const failed_requests = daily.reduce((a, d) => a + d.failed_requests, 0);
  return {
    total_spend,
    total_tokens,
    prompt_tokens,
    completion_tokens,
    api_requests,
    successful_requests,
    failed_requests,
    usage_by_model: {
      'gpt-4o': { total_spend: total_spend * 0.6, total_tokens: Math.round(total_tokens * 0.6), prompt_tokens: Math.round(prompt_tokens * 0.6), completion_tokens: Math.round(completion_tokens * 0.6), api_requests: Math.round(api_requests * 0.6), successful_requests: Math.round(successful_requests * 0.6), failed_requests: Math.round(failed_requests * 0.6) },
      'claude-3-5-sonnet': { total_spend: total_spend * 0.4, total_tokens: Math.round(total_tokens * 0.4), prompt_tokens: Math.round(prompt_tokens * 0.4), completion_tokens: Math.round(completion_tokens * 0.4), api_requests: Math.round(api_requests * 0.4), successful_requests: Math.round(successful_requests * 0.4), failed_requests: Math.round(failed_requests * 0.4) },
    },
    usage_by_key: {
      'jane-doe-personal': { key_alias: 'jane-doe-personal', team_id: null, models: ['gpt-4o'], total_spend: total_spend * 0.5, total_tokens: Math.round(total_tokens * 0.5), prompt_tokens: Math.round(prompt_tokens * 0.5), completion_tokens: Math.round(completion_tokens * 0.5), api_requests: Math.round(api_requests * 0.5), successful_requests: Math.round(successful_requests * 0.5), failed_requests: Math.round(failed_requests * 0.5) },
      'platform-ai-bot': { key_alias: 'platform-ai-bot', team_id: 'team-platform-eng', models: ['gpt-4o', 'claude-3-5-sonnet'], total_spend: total_spend * 0.5, total_tokens: Math.round(total_tokens * 0.5), prompt_tokens: Math.round(prompt_tokens * 0.5), completion_tokens: Math.round(completion_tokens * 0.5), api_requests: Math.round(api_requests * 0.5), successful_requests: Math.round(successful_requests * 0.5), failed_requests: Math.round(failed_requests * 0.5) },
    },
    daily_usage: daily,
    daily_by_model: [],
  };
}

export class MockLiteLlmApi implements LiteLlmApiInterface {
  async getUserInfo(): Promise<UserInfo> {
    return {
      user_id: 'user:default/jane.doe',
      user_email: 'jane.doe@example.com',
      teams: ['team-platform-eng'],
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'claude-3-haiku'],
      max_budget: 100,
      spend: 46.14,
      can_view_audit: true,
    };
  }
  async listKeys(): Promise<VirtualKey[]> { return keys; }
  async generateKey(_request: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    return { key: 'sk-...new1', key_alias: _request.alias, expires_at: undefined, max_budget: _request.max_budget ?? undefined };
  }
  async updateKey(keyId: string, _request: UpdateKeyRequest): Promise<VirtualKey> {
    return keys.find(k => k.key === keyId) ?? keys[0];
  }
  async deleteKey(_keyId: string) { return { success: true }; }
  async blockKey(_keyId: string) {}
  async unblockKey(_keyId: string) {}
  async resetKeySpend(_keyId: string) {}
  async pruneExpiredKeys() { return { pruned: 1 }; }
  async listModels(): Promise<ModelInfo[]> { return models; }
  async getTeams(): Promise<TeamInfo[]> { return teams; }
  async getUsage(_startDate: string, _endDate: string): Promise<UsageMetrics> { return usageMetrics(7); }
  async getTeamUsage(_teamId: string, _startDate: string, _endDate: string): Promise<UsageMetrics> { return usageMetrics(7); }
  async getAuditLogs(_params: AuditLogsParams): Promise<PaginatedAuditLogs> {
    return {
      audit_logs: [
        { id: '1', updated_at: iso(0), changed_by: 'user:default/jane.doe', action: 'created', table_name: 'LiteLLM_VerificationToken', object_id: 'sk-...ef56', before_value: null, updated_values: { key_alias: 'quick-test-key', max_budget: 5 } },
        { id: '2', updated_at: iso(1), changed_by: 'user:default/jane.doe', action: 'blocked', table_name: 'LiteLLM_VerificationToken', object_id: 'sk-...ef56', before_value: { blocked: false }, updated_values: { blocked: true } },
        { id: '3', updated_at: iso(3), changed_by: 'user:default/john.smith', action: 'created', table_name: 'LiteLLM_VerificationToken', object_id: 'sk-...cd34', before_value: null, updated_values: { key_alias: 'platform-ai-bot', max_budget: 100 } },
      ],
      total: 3,
      page: 1,
      page_size: 20,
      total_pages: 1,
    };
  }
  async getConfig(): Promise<LiteLlmConfig> {
    return { baseUrl: 'https://llm-gw.example.com', keyGeneration: { allowUnlimitedBudget: false, teamRequired: true } };
  }
}
