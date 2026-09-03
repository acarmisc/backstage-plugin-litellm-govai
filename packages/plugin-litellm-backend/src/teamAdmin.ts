import { Config } from '@backstage/config';

/**
 * Reads the team-admin governance block from config, applying fail-closed defaults
 * for every field. This ensures the feature works predictably: unset arrays remain
 * empty (nothing allowed), unset booleans stay false (deny by default), and undefined
 * ceiling means no admin-settable budget.
 *
 * Fail-closed rationale: A governance feature is only safe when absent config
 * defaults to "deny all". An unconfigured teamAdmin block must leave the feature
 * completely dark, ready to be explicitly enabled only when an admin has reviewed
 * and understood the delegation policy.
 */
export function readTeamAdminConfig(config: Config): TeamAdminConfig {
  return {
    group: config.getOptionalString('litellm.teamAdmin.group'),
    allowedModels: config.getOptionalStringArray('litellm.teamAdmin.allowedModels') ?? [],
    allowedModelAccessGroups: config.getOptionalStringArray('litellm.teamAdmin.allowedModelAccessGroups') ?? [],
    maxBudgetCeiling: config.getOptionalNumber('litellm.teamAdmin.maxBudgetCeiling'),
    allowUnlimitedBudget: config.getOptionalBoolean('litellm.teamAdmin.allowUnlimitedBudget') ?? false,
    allowedVectorStores: config.getOptionalStringArray('litellm.teamAdmin.allowedVectorStores') ?? [],
    allowedMcpServers: config.getOptionalStringArray('litellm.teamAdmin.allowedMcpServers') ?? [],
    allowedMcpAccessGroups: config.getOptionalStringArray('litellm.teamAdmin.allowedMcpAccessGroups') ?? [],
    allowTeamDelete: config.getOptionalBoolean('litellm.teamAdmin.allowTeamDelete') ?? false,
  };
}

export interface TeamAdminConfig {
  /**
   * Backstage group entity ref whose members may manage teams,
   * e.g. "group:default/litellm-team-admins".
   * Undefined => feature stays disabled.
   */
  group?: string;

  /**
   * LiteLLM model names an admin may assign to a team.
   * Empty => none assignable (fail-closed).
   */
  allowedModels: string[];

  /**
   * LiteLLM model access-group names an admin may assign.
   * Empty => none.
   */
  allowedModelAccessGroups: string[];

  /**
   * Hard USD ceiling for a team's max_budget an admin may set.
   * Undefined => no admin-settable budget allowed unless allowUnlimitedBudget.
   */
  maxBudgetCeiling?: number;

  /**
   * Allow an admin to create a team with no budget cap.
   */
  allowUnlimitedBudget: boolean;

  /**
   * Vector-store ids/names an admin may attach as team knowledge bases.
   * Empty => none.
   */
  allowedVectorStores: string[];

  /**
   * MCP server ids/names an admin may attach to a team.
   * Empty => none.
   */
  allowedMcpServers: string[];

  /**
   * MCP access-group names an admin may attach.
   * Empty => none.
   */
  allowedMcpAccessGroups: string[];

  /**
   * Allow an admin to delete a team (vs. only block/deactivate).
   */
  allowTeamDelete: boolean;
}
