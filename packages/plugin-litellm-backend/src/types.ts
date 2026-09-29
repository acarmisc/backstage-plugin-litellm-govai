// Re-export common types for backward compatibility
export {
  type UserInfo,
  type TeamMember,
  type TeamObjectPermission,
  type TeamInfo,
  type CreateTeamResponse,
  type VirtualKey,
  type ModelInfo,
  type UsageModelBreakdown,
  type UsageKeyBreakdown,
  type UsageDailyPoint,
  type UsageDailyModelPoint,
  type UsageMetrics,
  type GenerateKeyRequest,
  type UpdateKeyRequest,
  type GenerateKeyResponse,
  type AuditLogEntry,
  type PaginatedAuditLogs,
} from '@acarmisc/backstage-plugin-litellm-common';

export interface CreateTeamRequest {
  team_alias: string;
  models?: string[];
  max_budget?: number;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
  metadata?: Record<string, unknown>;
  object_permission?: {
    vector_stores?: string[];
    mcp_servers?: string[];
    mcp_access_groups?: string[];
  };
}

export interface UpdateTeamRequest extends Partial<CreateTeamRequest> {
  team_id: string;
  blocked?: boolean;
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
  budget_duration?: string | null;
  user_id?: string | null;
  team_id?: string | null;
  created_at: string;
  blocked?: boolean | null;
  /** Arbitrary metadata stored on the key record. */
  metadata?: Record<string, unknown> | null;
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

/** One row from LiteLLM's `/spend/logs` (per-request spend log entry). */
export interface SpendLogEntry {
  request_id?: string;
  /** ISO timestamp of the call. */
  startTime?: string;
  endTime?: string;
  spend?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  model?: string;
  /** Virtual key alias or hash the request was billed to. */
  api_key?: string;
  user?: string;
  team_id?: string;
  /**
   * Tags attached to the request (e.g. `channel:backstage`,
   * `session:<thread>`, `invoked-by:<user>`). Shape varies across LiteLLM
   * versions (array or object) and is normalised to a string[].
   */
  request_tags?: string[] | Record<string, string>;
  /** LiteLLM `metadata` blob; carries trace ids and session grouping. */
  metadata?: Record<string, unknown> | string | null;
}

export interface SpendLogsParams {
  /** ISO date `YYYY-MM-DD` (inclusive). */
  start_date: string;
  /** ISO date `YYYY-MM-DD` (inclusive). */
  end_date: string;
  /** Restrict to the given virtual key. */
  api_key?: string;
  user_id?: string;
  team_id?: string;
  /** Max rows to return (LiteLLM caps at 1000 per page). */
  page_size?: number;
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
