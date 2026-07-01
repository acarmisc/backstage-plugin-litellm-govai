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
  max_budget?: number;
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
