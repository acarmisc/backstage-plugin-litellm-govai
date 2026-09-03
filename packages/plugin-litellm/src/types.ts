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
  /** Backstage-computed: true when the user belongs to litellm.audit.group */
  can_view_audit?: boolean;
}

export interface TeamMember {
  user_id: string;
  user_email?: string;
  role: 'admin' | 'user';
}

export interface TeamInfo {
  team_id: string;
  team_alias?: string;
  max_budget?: number;
  spend: number;
  members_with_roles?: TeamMember[];
  models?: string[];
  tpm_limit?: number;
  rpm_limit?: number;
}

export interface VirtualKey {
  key: string;
  token?: string;
  key_alias?: string;
  created_at: string;
  expires_at?: string;
  spend: number;
  max_budget?: number;
  tpm_limit?: number;
  rpm_limit?: number;
  models?: string[];
  user_id?: string;
  blocked?: boolean;
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

export interface GenerateKeyRequest {
  alias?: string;
  models?: string[];
  team_id?: string;
  duration?: string;
  /** Positive number caps spend; null/undefined means unlimited. */
  max_budget?: number | null;
  tpm_limit?: number;
  rpm_limit?: number;
  key_type?: string;
}

export interface UpdateKeyRequest {
  key_alias?: string;
  models?: string[];
  max_budget?: number;
  tpm_limit?: number;
  rpm_limit?: number;
  team_id?: string;
  duration?: string;
}

export interface GenerateKeyResponse {
  key: string;
  key_alias?: string;
  expires_at?: string;
  max_budget?: number;
}

export interface LiteLlmConfig {
  /** Publicly reachable LiteLLM proxy base URL (for snippet generation). */
  baseUrl: string;
  /** Controls for the "Generate New Key" form, set via litellm.keyGeneration in app-config.yaml. */
  keyGeneration?: {
    /** When false (default), the "Unlimited budget" checkbox is hidden and a budget is always required. */
    allowUnlimitedBudget: boolean;
    /** When true (default), a team must be selected before a key can be generated. */
    teamRequired: boolean;
  };
  /** Team-management surface controls, set via litellm.teamAdmin in app-config.yaml. */
  teamManagement?: {
    /** True only when the permission framework is enabled AND an admin group is configured. */
    enabled: boolean;
    /** USD ceiling an admin may set as a team budget; null when unset. */
    maxBudgetCeiling: number | null;
    /** Whether an admin may create a team with no budget cap. */
    allowUnlimitedBudget: boolean;
  };
}

export interface DateRange {
  start: Date;
  end: Date;
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
}

export interface CreateTeamRequest {
  team_alias: string;
  models: string[];
  max_budget?: number | null;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
}

export interface UpdateTeamRequest {
  team_alias?: string;
  models?: string[];
  max_budget?: number | null;
  blocked?: boolean;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
}

export interface CreateTeamResponse {
  team_id: string;
  team_alias?: string;
}
