export interface UserInfo {
  user_id: string;
  user_email?: string;
  email?: string;
  teams?: string[];
  models?: string[];
  max_budget?: number;
  spend?: number;
  current_spend?: number;
  soft_limit?: number;
  hard_limit?: number;
  /** Spend-reset period for max_budget, e.g. "30d". */
  budget_duration?: string;
  /** ISO timestamp when max_budget next resets (set when budget_duration is). */
  budget_reset_at?: string;
  /** Backstage-computed: true when the user is a member of litellm.audit.group */
  can_view_audit?: boolean;
}

export interface TeamMember {
  user_id: string;
  user_email?: string;
  role: 'admin' | 'user';
}

export interface TeamObjectPermission {
  /** Vector store ids/names attached to the team. */
  vector_stores?: string[];
  /** MCP server ids/names attached to the team. */
  mcp_servers?: string[];
  /** MCP access group names attached to the team. */
  mcp_access_groups?: string[];
}

export interface TeamInfo {
  team_id: string;
  team_alias?: string;
  max_budget?: number;
  /** Spend-reset period for max_budget, e.g. "30d". */
  budget_duration?: string;
  spend: number;
  /**
   * Share of max_budget consumed (0-100), present only on redacted records.
   * Set by the backend when litellm.display.hideTeamBudgetFor* is enabled so
   * clients can render the consumption level without dollar amounts.
   */
  budget_pct?: number;
  /** ok | near (>=80%) | over (>=100%), present only on redacted records. */
  budget_status?: 'ok' | 'near' | 'over';
  /** True when max_budget/spend were stripped by budget hiding. */
  budget_hidden?: boolean;
  members_with_roles?: TeamMember[];
  models?: string[];
  tpm_limit?: number;
  rpm_limit?: number;
  /** Arbitrary metadata stored on the team record. */
  metadata?: Record<string, unknown>;
  /** Knowledge bases (vector stores) and MCP servers attached to the team. */
  object_permission?: TeamObjectPermission;
  /** Whether the team is blocked/deactivated. */
  blocked?: boolean;
  /** Max budget available to individual team members (if set per-member). */
  team_member_budget?: number;
}

export interface VirtualKey {
  key: string;
  token?: string;
  key_alias?: string;
  created_at: string;
  expires_at?: string;
  spend: number;
  max_budget?: number;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
  models?: string[];
  user_id?: string;
  /** Team the key is bound to, when any (used to scope the model picker). */
  team_id?: string;
  blocked?: boolean;
  /** Arbitrary metadata stored on the key record. */
  metadata?: Record<string, unknown>;
}

export interface ModelInfo {
  model_name: string;
  mode: string;
  supports_function_calling?: boolean;
  supports_vision?: boolean;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  /** Access group names this model belongs to (litellm.model_info.access_groups). A team's `models` list can reference a group name instead of a literal model_name. */
  access_groups?: string[];
}

export interface UsageModelBreakdown {
  total_spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
}

export interface UsageKeyBreakdown {
  key_alias?: string;
  team_id?: string | null;
  models: string[];
  total_spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
}

export interface UsageDailyPoint {
  date: string;
  spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
}

export interface UsageDailyModelPoint {
  date: string;
  model: string;
  spend: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
}

export interface UsageMetrics {
  total_spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
  usage_by_model: Record<string, UsageModelBreakdown>;
  usage_by_key: Record<string, UsageKeyBreakdown>;
  daily_usage: UsageDailyPoint[];
  daily_by_model: UsageDailyModelPoint[];
}

/** One member's share of a team's usage over a period. */
export interface TeamMemberUsageRow {
  /** LiteLLM user id; null groups activity no current key owner accounts for (deleted or ownerless keys). */
  user_id: string | null;
  user_email?: string;
  /** From the Backstage catalog when a User entity has the member's email. */
  display_name?: string;
  /** LiteLLM team role, when the user is a team member. */
  role?: string;
  /** USD; 0 when `budget_hidden` is set on the response. */
  spend: number;
  /** Share of the team's spend in the period, 0–100. */
  spend_share_pct: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
  /** successful / (successful + failed) as 0–100; null without requests. */
  success_rate: number | null;
  /** Team keys the user owns. */
  key_count: number;
}

/** Response of `GET /teams/:teamId/usage/members`. */
export interface TeamMemberUsage {
  team_id: string;
  /** USD; 0 when `budget_hidden` is set. */
  total_spend: number;
  /** Dollars are hidden for the caller: compare members by `spend_share_pct`. */
  budget_hidden?: boolean;
  /** Sorted by spend, highest first. */
  members: TeamMemberUsageRow[];
}

export interface GenerateKeyRequest {
  alias?: string;
  models?: string[];
  team_id?: string;
  duration?: string;
  /** Positive number caps spend; null/undefined means unlimited. */
  max_budget?: number | null;
  /** How often the key's spend resets, e.g. "30d" or "1mo". */
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
  key_type?: string;
  metadata?: Record<string, string>;
  /** Backend-only: user ID for the key owner (set from authenticated principal). */
  user_id?: string;
}

export interface UpdateKeyRequest {
  key?: string;
  key_alias?: string;
  models?: string[];
  /** Positive number caps spend; null clears it (unlimited, gated by allowUnlimitedBudget). */
  max_budget?: number | null;
  tpm_limit?: number;
  rpm_limit?: number;
  team_id?: string;
  duration?: string;
  /** Arbitrary metadata to merge with the existing record. */
  metadata?: Record<string, unknown>;
}

export interface GenerateKeyResponse {
  key: string;
  key_alias?: string;
  expires_at?: string;
  max_budget?: number;
  tpm_limit?: number;
  rpm_limit?: number;
  models?: string[];
}

export interface AuditLogEntry {
  id: string;
  updated_at: string;
  changed_by?: string;
  changed_by_api_key?: string;
  action?: string;
  table_name?: string;
  object_id?: string;
  before_value?: Record<string, unknown> | null;
  updated_values?: Record<string, unknown> | null;
}

export interface PaginatedAuditLogs {
  audit_logs: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuditLogsParams {
  page?: number;
  page_size?: number;
  start_date?: string;
  end_date?: string;
  action?: string;
  table_name?: string;
  changed_by?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface CreateTeamResponse {
  team_id: string;
  team_alias?: string;
}
