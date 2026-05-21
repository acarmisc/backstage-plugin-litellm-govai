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
  token: string;
  key_alias?: string;
  created_at: string;
  expires_at?: string;
  spend: number;
  max_budget?: number;
  tpm_limit?: number;
  rpm_limit?: number;
  models?: string[];
  user_id?: string;
}

/**
 * Shape of a single entry inside LiteLLM's `/user/info` `keys` array.
 * Differs from VirtualKey: uses `expires` (not `expires_at`), exposes
 * both a hashed `token` and a masked `key_name`, and fields are nullable
 * rather than optional.
 */
export interface LiteLLMUserKey {
  token: string;
  key_name?: string;
  key_alias?: string | null;
  spend?: number;
  expires?: string | null;
  models?: string[];
  tpm_limit?: number | null;
  rpm_limit?: number | null;
  max_budget?: number | null;
  user_id?: string | null;
  team_id?: string | null;
  created_at: string;
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
  duration?: string;
  max_budget?: number;
  tpm_limit?: number;
  rpm_limit?: number;
  user_id?: string;
  team_id?: string;
  key_type?: string;
  metadata?: Record<string, string>;
}

export interface UpdateKeyRequest {
  key: string;
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
  tpm_limit?: number;
  rpm_limit?: number;
  models?: string[];
}

export interface DeleteKeyRequest {
  keys: string[];
}

export interface LiteLLMConfig {
  baseUrl: string;
  masterKey: string;
}

export interface ProvisioningDefaults {
  maxBudget: number;
  budgetDuration: string;
  models: string[];
  teams: string[];
  tpmLimit?: number;
  rpmLimit?: number;
  /**
   * LiteLLM user role applied on /user/new. Defaults to "internal_user"
   * which grants self-service Create/Delete/View on the user's own keys.
   * Valid values: proxy_admin, proxy_admin_viewer, internal_user,
   * internal_user_viewer, team.
   */
  userRole?: string;
  metadata: Record<string, string>;
}

export interface RoleConfig {
  group: string;
  maxBudget?: number;
  budgetDuration?: string;
  models?: string[];
  teams?: string[];
  tpmLimit?: number;
  rpmLimit?: number;
  userRole?: string;
  metadata?: Record<string, string>;
}

export interface CreateUserRequest {
  user_id: string;
  user_email?: string;
  user_alias?: string;
  user_role?: string;
  max_budget?: number;
  budget_duration?: string;
  models?: string[];
  teams?: string[];
  tpm_limit?: number;
  rpm_limit?: number;
  metadata?: Record<string, string>;
  auto_create_key?: boolean;
}

export interface CreateUserResponse {
  user_id: string;
  user_email?: string;
  max_budget?: number;
  models?: string[];
  teams?: string[];
}
