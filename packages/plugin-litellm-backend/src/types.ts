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

export interface ModelInfo {
  model_name: string;
  mode: string;
  supports_function_calling?: boolean;
  supports_vision?: boolean;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
}

export interface UsageMetrics {
  total_spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  usage_by_model: Record<string, {
    total_spend: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  }>;
  daily_usage: Array<{
    date: string;
    spend: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  }>;
}

export interface GenerateKeyRequest {
  alias?: string;
  models?: string[];
  duration?: string;
  max_budget?: number;
  tpm_limit?: number;
  rpm_limit?: number;
  user_id?: string;
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
  metadata: Record<string, string>;
}

export interface CreateUserRequest {
  user_id: string;
  user_email?: string;
  max_budget?: number;
  budget_duration?: string;
  models?: string[];
  teams?: string[];
  tpm_limit?: number;
  rpm_limit?: number;
  metadata?: Record<string, string>;
}

export interface CreateUserResponse {
  user_id: string;
  user_email?: string;
  max_budget?: number;
  models?: string[];
  teams?: string[];
}
