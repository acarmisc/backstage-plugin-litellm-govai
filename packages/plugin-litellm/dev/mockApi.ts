import {
  UserInfo,
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  UsageDailyModelPoint,
  UsageModelBreakdown,
  UsageKeyBreakdown,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  UpdateKeyRequest,
  AuditLogsParams,
  PaginatedAuditLogs,
  LiteLlmConfig,
  CreateTeamRequest,
  CreateTeamResponse,
  UpdateTeamRequest,
  VectorStoreInfo,
  McpServerInfo,
} from '../src/types';
import { LiteLlmApiInterface } from '../src/api';
import type { CatalogApi } from '@backstage/catalog-client';
import type { Entity, UserEntity } from '@backstage/catalog-model';

// Fixed data for the dev harness (`npm start`) and the documentation
// screenshots. Values are deterministic so screenshots are reproducible.

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(now - offsetDays * day).toISOString();

const ME = 'jane.doe@example.com';

const models: ModelInfo[] = [
  { model_name: 'gpt-4o', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001, max_input_tokens: 128000, max_output_tokens: 16384 },
  { model_name: 'gpt-4o-mini', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.00000015, output_cost_per_token: 0.0000006, max_input_tokens: 128000, max_output_tokens: 16384 },
  { model_name: 'claude-sonnet-4', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.000003, output_cost_per_token: 0.000015, max_input_tokens: 200000, max_output_tokens: 64000 },
  { model_name: 'claude-haiku-3-5', mode: 'chat', supports_function_calling: true, supports_vision: true, input_cost_per_token: 0.0000008, output_cost_per_token: 0.000004, max_input_tokens: 200000, max_output_tokens: 8192 },
  { model_name: 'mistral-large', mode: 'chat', supports_function_calling: true, supports_vision: false, input_cost_per_token: 0.000002, output_cost_per_token: 0.000006, max_input_tokens: 128000, max_output_tokens: 8192 },
  { model_name: 'llama-3-1-70b-instruct', mode: 'chat', supports_function_calling: false, supports_vision: false, input_cost_per_token: 0.00000072, output_cost_per_token: 0.00000072, max_input_tokens: 128000, max_output_tokens: 4096 },
  { model_name: 'text-embedding-3-large', mode: 'embedding', input_cost_per_token: 0.00000013, max_input_tokens: 8191 },
  { model_name: 'text-embedding-3-small', mode: 'embedding', input_cost_per_token: 0.00000002, max_input_tokens: 8191 },
  { model_name: 'gpt-image-1', mode: 'image_generation' },
];

const keys: VirtualKey[] = [
  { key: 'sk-...4f2a', key_alias: 'ci-pipeline', created_at: iso(41), expires_at: iso(-49), spend: 38.21, max_budget: 100, budget_duration: '30d', tpm_limit: 100000, rpm_limit: 600, models: ['gpt-4o', 'gpt-4o-mini'], user_id: ME, team_id: 'platform-eng' },
  { key: 'sk-...9c71', key_alias: 'claude-code-laptop', created_at: iso(18), expires_at: iso(-12), spend: 86.4, max_budget: 100, budget_duration: '30d', models: ['claude-sonnet-4', 'claude-haiku-3-5'], user_id: ME, team_id: 'platform-eng' },
  { key: 'sk-...b803', key_alias: 'release-notes-bot', created_at: iso(63), expires_at: iso(-27), spend: 52.75, max_budget: 50, budget_duration: '30d', models: ['gpt-4o-mini'], user_id: ME, team_id: 'platform-eng' },
  { key: 'sk-...17de', key_alias: 'notebook-experiments', created_at: iso(9), expires_at: iso(-21), spend: 12.38, max_budget: 50, models: ['gpt-4o', 'text-embedding-3-large'], user_id: ME, team_id: 'data-science' },
  { key: 'sk-...e5b0', key_alias: 'opencode', created_at: iso(27), expires_at: iso(-3), spend: 7.92, max_budget: 50, models: [], user_id: ME, team_id: 'platform-eng' },
  { key: 'sk-...0a66', key_alias: 'support-summarizer', created_at: iso(33), expires_at: iso(-57), spend: 4.1, max_budget: 20, models: ['claude-haiku-3-5'], user_id: ME, team_id: 'data-science', blocked: true, metadata: { blocked_by: 'user:default/jane.doe', blocked_at: iso(2) } },
  { key: 'sk-...73c9', key_alias: 'rag-prototype', created_at: iso(37), expires_at: iso(7), spend: 3.05, max_budget: 10, models: ['gpt-4o-mini', 'text-embedding-3-small'], user_id: ME, team_id: 'data-science' },
];

const member = (name: string, role: 'admin' | 'user' = 'user') => ({
  user_id: `${name}@example.com`,
  user_email: `${name}@example.com`,
  role,
});

const teams: TeamInfo[] = [
  {
    team_id: 'platform-eng',
    team_alias: 'Platform Engineering',
    max_budget: 1000,
    budget_duration: '30d',
    spend: 612.48,
    tpm_limit: 500000,
    rpm_limit: 5000,
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4', 'claude-haiku-3-5'],
    members_with_roles: [member('jane.doe', 'admin'), member('john.smith'), member('alice.nguyen'), member('marco.rossi'), member('sara.kim')],
    metadata: { owning_group: 'group:default/litellm-team-admins', updated_at_iso: iso(5) },
    object_permission: { vector_stores: ['engineering-handbook'], mcp_servers: ['github'] },
  },
  {
    team_id: 'data-science',
    team_alias: 'Data Science',
    max_budget: 500,
    budget_duration: '30d',
    spend: 431.9,
    tpm_limit: 300000,
    rpm_limit: 3000,
    models: ['gpt-4o', 'gpt-4o-mini', 'text-embedding-3-large', 'text-embedding-3-small', 'llama-3-1-70b-instruct'],
    members_with_roles: [member('raj.patel', 'admin'), member('jane.doe'), member('lena.fischer')],
    metadata: { owning_group: 'group:default/litellm-team-admins', updated_at_iso: iso(11) },
    object_permission: { vector_stores: ['product-docs'], mcp_servers: [] },
  },
];

const managedOnlyTeams: TeamInfo[] = [
  {
    team_id: 'customer-support',
    team_alias: 'Customer Support',
    max_budget: 300,
    budget_duration: '30d',
    spend: 96.3,
    models: ['claude-haiku-3-5', 'gpt-4o-mini'],
    members_with_roles: [member('tom.baker', 'admin'), member('ines.garcia')],
    metadata: { owning_group: 'group:default/litellm-team-admins', updated_at_iso: iso(20) },
  },
];

/** Catalog User entities backing the dev harness's member-picker Autocomplete. */
export const mockCatalogUsers: UserEntity[] = [
  ['jane.doe', 'Jane Doe'],
  ['john.smith', 'John Smith'],
  ['alice.nguyen', 'Alice Nguyen'],
  ['raj.patel', 'Raj Patel'],
  ['marco.rossi', 'Marco Rossi'],
  ['sara.kim', 'Sara Kim'],
  ['lena.fischer', 'Lena Fischer'],
  ['tom.baker', 'Tom Baker'],
].map(([name, displayName]) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'User',
  metadata: { name, namespace: 'default', title: displayName },
  spec: { profile: { displayName, email: `${name}@example.com` } },
}));

/** Minimal CatalogApi stand-in: only `getEntities` is exercised by the plugin. */
export class MockCatalogApi implements Partial<CatalogApi> {
  async getEntities(): Promise<{ items: Entity[] }> {
    return { items: mockCatalogUsers };
  }
}

// Deterministic "noise" so charts look organic but render identically every time.
const wave = (i: number, seed: number) =>
  0.75 + 0.25 * Math.sin(i * 1.7 + seed) + 0.15 * Math.cos(i * 0.6 + seed * 2);

/** Share of daily spend per model, and tokens per dollar for each. */
const MODEL_MIX: Array<{ model: string; share: number; tokensPerUsd: number; seed: number }> = [
  { model: 'claude-sonnet-4', share: 0.46, tokensPerUsd: 140000, seed: 1 },
  { model: 'gpt-4o', share: 0.31, tokensPerUsd: 180000, seed: 2 },
  { model: 'gpt-4o-mini', share: 0.15, tokensPerUsd: 1900000, seed: 3 },
  { model: 'text-embedding-3-large', share: 0.08, tokensPerUsd: 7000000, seed: 4 },
];

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

function usageMetrics(days: number, scale = 1): UsageMetrics {
  const byModel: UsageDailyModelPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = iso(days - 1 - i).slice(0, 10);
    // Quieter weekends.
    const weekday = new Date(now - (days - 1 - i) * day).getDay();
    const weekFactor = weekday === 0 || weekday === 6 ? 0.35 : 1;
    for (const m of MODEL_MIX) {
      const spend = round2(9 * scale * m.share * wave(i, m.seed) * weekFactor);
      const total = Math.round(spend * m.tokensPerUsd);
      const requests = Math.max(1, Math.round(spend * 14 + 3 * weekFactor));
      const failed = Math.round(requests * 0.02 * (1 + Math.sin(i + m.seed)));
      byModel.push({
        date,
        model: m.model,
        spend,
        total_tokens: total,
        prompt_tokens: Math.round(total * 0.74),
        completion_tokens: total - Math.round(total * 0.74),
        api_requests: requests,
        successful_requests: requests - failed,
        failed_requests: failed,
      });
    }
  }

  const dates = [...new Set(byModel.map(r => r.date))];
  const daily = dates.map(date => {
    const rows = byModel.filter(r => r.date === date);
    return {
      date,
      spend: round2(sum(rows, r => r.spend)),
      total_tokens: sum(rows, r => r.total_tokens),
      prompt_tokens: sum(rows, r => r.prompt_tokens),
      completion_tokens: sum(rows, r => r.completion_tokens),
      api_requests: sum(rows, r => r.api_requests),
      successful_requests: sum(rows, r => r.successful_requests),
      failed_requests: sum(rows, r => r.failed_requests),
    };
  });

  const totals = (rows: UsageDailyModelPoint[]): UsageModelBreakdown => ({
    total_spend: round2(sum(rows, r => r.spend)),
    total_tokens: sum(rows, r => r.total_tokens),
    prompt_tokens: sum(rows, r => r.prompt_tokens),
    completion_tokens: sum(rows, r => r.completion_tokens),
    api_requests: sum(rows, r => r.api_requests),
    successful_requests: sum(rows, r => r.successful_requests),
    failed_requests: sum(rows, r => r.failed_requests),
  });

  const usage_by_model: Record<string, UsageModelBreakdown> = {};
  for (const m of MODEL_MIX) usage_by_model[m.model] = totals(byModel.filter(r => r.model === m.model));

  const all = totals(byModel);
  const keyShares: Array<[VirtualKey, number]> = [
    [keys[1], 0.38], [keys[0], 0.27], [keys[2], 0.16], [keys[3], 0.11], [keys[4], 0.08],
  ];
  const usage_by_key: Record<string, UsageKeyBreakdown> = {};
  for (const [k, share] of keyShares) {
    usage_by_key[k.key_alias!] = {
      key_alias: k.key_alias,
      team_id: k.team_id ?? null,
      models: k.models ?? [],
      total_spend: round2(all.total_spend * share),
      total_tokens: Math.round(all.total_tokens * share),
      prompt_tokens: Math.round(all.prompt_tokens * share),
      completion_tokens: Math.round(all.completion_tokens * share),
      api_requests: Math.round(all.api_requests * share),
      successful_requests: Math.round(all.successful_requests * share),
      failed_requests: Math.round(all.failed_requests * share),
    };
  }

  return { ...all, total_spend: all.total_spend, usage_by_model, usage_by_key, daily_usage: daily, daily_by_model: byModel };
}

const daysBetween = (startDate: string, endDate: string) => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.min(92, Math.max(1, Math.round((end - start) / day) + 1))
    : 7;
};

const audit = (
  id: number,
  daysAgo: number,
  changed_by: string,
  action: string,
  table_name: string,
  object_id: string,
  before_value: Record<string, unknown> | null,
  updated_values: Record<string, unknown> | null,
) => ({ id: String(id), updated_at: iso(daysAgo), changed_by, action, table_name, object_id, before_value, updated_values });

const auditLogs = [
  audit(1, 0.1, 'jane.doe@example.com', 'created', 'LiteLLM_VerificationToken', 'sk-...9c71', null, { key_alias: 'claude-code-laptop', max_budget: 100, team_id: 'platform-eng' }),
  audit(2, 0.4, 'raj.patel@example.com', 'updated', 'LiteLLM_TeamTable', 'data-science', { max_budget: 400 }, { max_budget: 500 }),
  audit(3, 1.2, 'jane.doe@example.com', 'updated', 'LiteLLM_TeamMembership', 'platform-eng', null, { user_id: 'sara.kim@example.com', role: 'user' }),
  audit(4, 2.0, 'jane.doe@example.com', 'blocked', 'LiteLLM_VerificationToken', 'sk-...0a66', { blocked: false }, { blocked: true }),
  audit(5, 3.5, 'tom.baker@example.com', 'created', 'LiteLLM_TeamTable', 'customer-support', null, { team_alias: 'Customer Support', max_budget: 300 }),
  audit(6, 5.1, 'john.smith@example.com', 'updated', 'LiteLLM_VerificationToken', 'sk-...4f2a', { tpm_limit: 50000 }, { tpm_limit: 100000 }),
  audit(7, 6.7, 'jane.doe@example.com', 'updated', 'LiteLLM_TeamTable', 'platform-eng', { object_permission: { mcp_servers: [] } }, { object_permission: { mcp_servers: ['github'] } }),
  audit(8, 9.0, 'lena.fischer@example.com', 'deleted', 'LiteLLM_VerificationToken', 'sk-...d410', { key_alias: 'old-eval-run' }, null),
];

export class MockLiteLlmApi implements LiteLlmApiInterface {
  async getUserInfo(): Promise<UserInfo> {
    return {
      user_id: ME,
      user_email: ME,
      teams: teams.map(t => t.team_id),
      models: [],
      max_budget: 150,
      spend: 62.3,
      budget_duration: '30d',
      budget_reset_at: iso(-17),
      can_view_audit: true,
    };
  }
  async listKeys(): Promise<VirtualKey[]> { return keys; }
  async generateKey(request: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    return {
      key: 'sk-litellm-3f9a7c21d84b6e05a1c9',
      key_alias: request.alias,
      expires_at: iso(-30),
      max_budget: request.max_budget ?? undefined,
      models: request.models,
    };
  }
  async updateKey(keyId: string, request: UpdateKeyRequest): Promise<VirtualKey> {
    const target = keys.find(k => k.key === keyId) ?? keys[0];
    return {
      ...target,
      ...(request.key_alias !== undefined && { key_alias: request.key_alias }),
      ...(request.models !== undefined && { models: request.models }),
      ...(request.max_budget !== undefined && { max_budget: request.max_budget ?? undefined }),
      ...(request.tpm_limit !== undefined && { tpm_limit: request.tpm_limit }),
      ...(request.rpm_limit !== undefined && { rpm_limit: request.rpm_limit }),
    };
  }
  async deleteKey(_keyId: string) { return { success: true }; }
  async blockKey(_keyId: string) {}
  async unblockKey(_keyId: string) {}
  async resetKeySpend(_keyId: string) {}
  async pruneExpiredKeys() { return { pruned: 1, failed: 0 }; }
  async listModels(): Promise<ModelInfo[]> { return models; }
  async getTeams(): Promise<TeamInfo[]> { return teams; }
  async getManagedTeams(): Promise<TeamInfo[]> { return [...teams, ...managedOnlyTeams]; }
  async addTeamMember(teamId: string, body: { userEntityRef: string }): Promise<TeamInfo> {
    const team = [...teams, ...managedOnlyTeams].find(t => t.team_id === teamId) ?? teams[0];
    const name = body.userEntityRef.split('/').pop()!;
    return { ...team, members_with_roles: [...(team.members_with_roles ?? []), member(name)] };
  }
  async removeTeamMember(teamId: string, userEntityRef: string): Promise<TeamInfo> {
    const team = [...teams, ...managedOnlyTeams].find(t => t.team_id === teamId) ?? teams[0];
    const id = `${userEntityRef.split('/').pop()}@example.com`;
    return { ...team, members_with_roles: (team.members_with_roles ?? []).filter(m => m.user_id !== id) };
  }
  async getVectorStores(): Promise<VectorStoreInfo[]> {
    return [
      { id: 'engineering-handbook', name: 'Engineering handbook' },
      { id: 'product-docs', name: 'Product documentation' },
      { id: 'support-kb', name: 'Support knowledge base' },
    ];
  }
  async setTeamKnowledgeBases(teamId: string, vectorStores: string[]): Promise<TeamInfo> {
    const team = teams.find(t => t.team_id === teamId) ?? teams[0];
    return { ...team, object_permission: { ...team.object_permission, vector_stores: vectorStores } };
  }
  async getMcpServers(): Promise<McpServerInfo[]> {
    return [
      { id: 'github', name: 'GitHub', url: 'https://mcp.example.com/github' },
      { id: 'jira', name: 'Jira', url: 'https://mcp.example.com/jira' },
      { id: 'postgres-readonly', name: 'Postgres (read-only)', url: 'https://mcp.example.com/postgres' },
    ];
  }
  async setTeamMcpServers(teamId: string, mcpServers: string[]): Promise<TeamInfo> {
    const team = teams.find(t => t.team_id === teamId) ?? teams[0];
    return { ...team, object_permission: { ...team.object_permission, mcp_servers: mcpServers } };
  }
  async getUsage(startDate: string, endDate: string): Promise<UsageMetrics> {
    return usageMetrics(daysBetween(startDate, endDate));
  }
  async getTeamUsage(teamId: string, startDate: string, endDate: string): Promise<UsageMetrics> {
    return usageMetrics(daysBetween(startDate, endDate), teamId === 'platform-eng' ? 4.5 : 2.6);
  }
  async getAuditLogs(params: AuditLogsParams): Promise<PaginatedAuditLogs> {
    const rows = params.table_name
      ? auditLogs.filter(a => a.table_name === params.table_name)
      : auditLogs;
    return { audit_logs: rows, total: rows.length, page: 1, page_size: params.page_size ?? 25, total_pages: 1 };
  }
  async getConfig(): Promise<LiteLlmConfig> {
    return {
      baseUrl: 'https://llm.example.com',
      supportContact: '#ai-platform on Slack',
      keyGeneration: { allowUnlimitedBudget: false, teamRequired: true },
      keyActions: { allowOwnerResetSpend: true },
      teamManagement: {
        enabled: true,
        maxBudgetCeiling: 1000,
        allowUnlimitedBudget: false,
        objectPermissionsEnabled: true,
        readOnly: false,
        memberManagerRoles: ['admin'],
      },
    };
  }
  async createTeam(request: CreateTeamRequest): Promise<CreateTeamResponse> {
    return { team_id: request.team_alias.toLowerCase().replace(/\s+/g, '-'), team_alias: request.team_alias };
  }
  async updateTeam(teamId: string, request: UpdateTeamRequest): Promise<TeamInfo> {
    const team = [...teams, ...managedOnlyTeams].find(t => t.team_id === teamId) ?? teams[0];
    return { ...team, ...request, max_budget: request.max_budget ?? team.max_budget };
  }
}
