// Re-export shared API types from the common package for consumers of this package
export {
  type UserInfo,
  type TeamMember,
  type TeamObjectPermission,
  type TeamInfo,
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
  type AuditLogsParams,
  type CreateTeamResponse,
} from '@acarmisc/backstage-plugin-litellm-common';

export interface VectorStoreInfo {
  id: string;
  name?: string;
}

export interface McpServerInfo {
  id: string;
  name?: string;
  url?: string;
}

export interface LiteLlmConfig {
  /** Publicly reachable LiteLLM proxy base URL (for snippet generation). Null if not configured. */
  baseUrl: string | null;
  /** Support contact for unprovisioned users (optional, e.g. 'admin@example.com' or 'Slack #support'). */
  supportContact?: string;
  /** Controls for the "Generate New Key" form, set via litellm.keyGeneration in app-config.yaml. */
  keyGeneration?: {
    /** When false (default), the "Unlimited budget" checkbox is hidden and a budget is always required. */
    allowUnlimitedBudget: boolean;
    /** When true (default), a team must be selected before a key can be generated. */
    teamRequired: boolean;
  };
  /** Controls for key actions, set via litellm.keyActions in app-config.yaml. */
  keyActions?: {
    /** Whether key owners can reset their key's spend via the frontend (gated by litellm.key.resetSpend permission). */
    allowOwnerResetSpend?: boolean;
  };
  /** Team-management surface controls, set via litellm.teamAdmin in app-config.yaml. */
  teamManagement?: {
    /** True only when the permission framework is enabled AND an admin group is configured. */
    enabled: boolean;
    /** USD ceiling an admin may set as a team budget (defaults to 1000). */
    maxBudgetCeiling: number;
    /** Whether an admin may create a team with no budget cap. */
    allowUnlimitedBudget: boolean;
    /** Whether knowledge-base / MCP management routes are enabled (opt-in). */
    objectPermissionsEnabled?: boolean;
    /** When true, all team writes (create, edit, delete, members, KB/MCP) are rejected server-side; teams are managed in the identity provider. */
    readOnly?: boolean;
    /** LiteLLM team roles (e.g. ["admin"]) whose holders may add/remove members of their own team via POST/DELETE /teams/:id/members endpoints. */
    memberManagerRoles?: string[];
  };
  /** Team-budget hiding switches, set via litellm.display in app-config.yaml. */
  display?: {
    /** Dollars hidden from regular members (percent + status still shown). */
    hideTeamBudgetForMembers?: boolean;
    /** Dollars hidden even from team managers (budget field becomes write-only). */
    hideTeamBudgetForManagers?: boolean;
  };
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CreateTeamRequest {
  team_alias: string;
  models: string[];
  max_budget?: number | null;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
  /**
   * Optimistic concurrency: the `metadata.updated_at_iso` the edit was based on.
   * The server answers 409 when the stored value has moved on.
   */
  expectedUpdatedAtIso?: string;
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
