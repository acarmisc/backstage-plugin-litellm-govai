import { Request } from 'express';
import { Config } from '@backstage/config';
import { AuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { BasicPermission, AuthorizeResult } from '@backstage/plugin-permission-common';
import { CatalogClient } from '@backstage/catalog-client';
import { resolveUserId, resolveCredentials, isUserMemberOfGroup } from './provisioning';

/**
 * Governance limits for the team-administration feature. Every field is
 * fail-closed: an unset array means "nothing allowed", an unset boolean means
 * "deny", and an unset ceiling means "no admin-settable budget". An absent
 * `litellm.teamAdmin` block therefore leaves the feature completely dark.
 */
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

/**
 * Whether team-management routes should be mounted.
 * Requires permission.enabled AND a designated admin group.
 * Returns false when either is missing (fail-closed).
 */
export function isTeamManagementEnabled(config: Config): boolean {
  const permEnabled = config.getOptionalBoolean('permission.enabled') ?? false;
  const adminConfig = readTeamAdminConfig(config);
  return permEnabled && !!adminConfig.group;
}

/**
 * Discriminated result: either successful auth or a failure with HTTP status + error message.
 */
export type TeamAdminCheck =
  | { ok: true; userEntityRef: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Layered fail-closed authz check for team-management operations.
 *
 * This is the security primitive that gates all team-write routes. It checks in order:
 * 1. Authentication (user identity from token)
 * 2. Group membership (user in the designated litellm-team-admins group)
 * 3. Permission framework decision (via assertPermission, defaults to DENY if no policy)
 *
 * ALL three must pass. The group membership check exists because the permission
 * framework alone cannot be trusted — its default depends on the policy engine
 * (permissive if unconfigured), so we layer a guaranteed group check on top.
 *
 * Callers: check `result.ok` and respond with `status` + `error` when false.
 */
export async function assertTeamAdmin(opts: {
  req: Request;
  auth: AuthService;
  permissions: PermissionsService;
  catalogClient: CatalogClient;
  teamAdminGroup: string;
  permission: BasicPermission;
  logger: any;
}): Promise<TeamAdminCheck> {
  const {
    req,
    auth,
    permissions,
    catalogClient,
    teamAdminGroup,
    permission,
    logger,
  } = opts;

  // Step 1: Resolve authenticated user
  const userEntityRef = await resolveUserId(req, auth);
  if (!userEntityRef) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  // Step 2: Verify credentials can be resolved (needed for permission check)
  const credentials = await resolveCredentials(req, auth);
  if (!credentials) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  // Step 3: Check group membership
  const isMember = await isUserMemberOfGroup(
    userEntityRef,
    teamAdminGroup,
    catalogClient,
    auth,
    logger,
  );
  if (!isMember) {
    return {
      ok: false,
      status: 403,
      error: `Access denied: not a member of ${teamAdminGroup}`,
    };
  }

  // Step 4: Check permission framework decision
  const [decision] = await permissions.authorize([{ permission }], {
    credentials,
  });
  if (decision.result !== AuthorizeResult.ALLOW) {
    return {
      ok: false,
      status: 403,
      error: `Access denied: missing permission "${permission.name}"`,
    };
  }

  // All checks passed
  return { ok: true, userEntityRef };
}

/**
 * Reads the team-admin governance block from config, applying fail-closed
 * defaults for every field: unset arrays remain empty (nothing allowed), unset
 * booleans stay false (deny by default), and an undefined ceiling means no
 * admin-settable budget.
 *
 * Fail-closed rationale: a governance feature is only safe when absent config
 * defaults to "deny all". An unconfigured teamAdmin block must leave the feature
 * completely dark, ready to be explicitly enabled only once an operator has
 * reviewed and understood the delegation policy.
 */
export function readTeamAdminConfig(config: Config): TeamAdminConfig {
  return {
    group: config.getOptionalString('litellm.teamAdmin.group'),
    allowedModels:
      config.getOptionalStringArray('litellm.teamAdmin.allowedModels') ?? [],
    allowedModelAccessGroups:
      config.getOptionalStringArray(
        'litellm.teamAdmin.allowedModelAccessGroups',
      ) ?? [],
    maxBudgetCeiling: config.getOptionalNumber(
      'litellm.teamAdmin.maxBudgetCeiling',
    ),
    allowUnlimitedBudget:
      config.getOptionalBoolean('litellm.teamAdmin.allowUnlimitedBudget') ??
      false,
    allowedVectorStores:
      config.getOptionalStringArray('litellm.teamAdmin.allowedVectorStores') ??
      [],
    allowedMcpServers:
      config.getOptionalStringArray('litellm.teamAdmin.allowedMcpServers') ?? [],
    allowedMcpAccessGroups:
      config.getOptionalStringArray(
        'litellm.teamAdmin.allowedMcpAccessGroups',
      ) ?? [],
    allowTeamDelete:
      config.getOptionalBoolean('litellm.teamAdmin.allowTeamDelete') ?? false,
  };
}

export interface TeamWriteInput {
  team_alias?: string;
  models?: string[];
  max_budget?: number | null;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
}

export type TeamWriteValidation =
  | { ok: true; value: { team_alias: string; models: string[]; max_budget?: number; budget_duration?: string; tpm_limit?: number; rpm_limit?: number } }
  | { ok: false; error: string };

export function validateTeamWriteInput(input: TeamWriteInput, cfg: TeamAdminConfig): TeamWriteValidation {
  const trimmedAlias = (input.team_alias ?? '').trim();
  if (!trimmedAlias) {
    return { ok: false, error: 'team_alias is required' };
  }

  const models = input.models ?? [];
  if (!Array.isArray(models) || models.length === 0) {
    return { ok: false, error: 'models must list at least one allowed model (a team with no explicit models grants access to every proxy model)' };
  }

  const allowedSet = new Set([...cfg.allowedModels, ...cfg.allowedModelAccessGroups]);
  if (allowedSet.size === 0) {
    return { ok: false, error: 'models are not allowed (team admin has configured no allowlist)' };
  }

  for (const model of models) {
    if (!allowedSet.has(model)) {
      return { ok: false, error: `model "${model}" is not in the allowed set for team admins` };
    }
  }

  let maxBudget: number | undefined;
  if (input.max_budget !== undefined && input.max_budget !== null) {
    if (!Number.isFinite(input.max_budget) || input.max_budget <= 0) {
      return { ok: false, error: 'max_budget must be a positive number' };
    }
    maxBudget = input.max_budget;
  }

  if (!cfg.allowUnlimitedBudget) {
    if (maxBudget === undefined) {
      return { ok: false, error: 'max_budget is required' };
    }
    if (cfg.maxBudgetCeiling === undefined) {
      return { ok: false, error: 'team budget ceiling is not configured (litellm.teamAdmin.maxBudgetCeiling)' };
    }
    if (maxBudget > cfg.maxBudgetCeiling) {
      return { ok: false, error: `max_budget $${maxBudget} exceeds the ceiling $${cfg.maxBudgetCeiling}` };
    }
  } else if (maxBudget !== undefined && cfg.maxBudgetCeiling !== undefined && maxBudget > cfg.maxBudgetCeiling) {
    return { ok: false, error: `max_budget $${maxBudget} exceeds the ceiling $${cfg.maxBudgetCeiling}` };
  }

  let budgetDuration = input.budget_duration;
  if (!budgetDuration || typeof budgetDuration !== 'string' || budgetDuration.trim() === '') {
    if (maxBudget !== undefined) {
      budgetDuration = '30d';
    }
  }

  const tpmLimit = input.tpm_limit !== undefined && Number.isFinite(input.tpm_limit) && input.tpm_limit >= 0 ? input.tpm_limit : undefined;
  const rpmLimit = input.rpm_limit !== undefined && Number.isFinite(input.rpm_limit) && input.rpm_limit >= 0 ? input.rpm_limit : undefined;

  return {
    ok: true,
    value: {
      team_alias: trimmedAlias,
      models,
      ...(maxBudget !== undefined && { max_budget: maxBudget }),
      ...(budgetDuration && { budget_duration: budgetDuration }),
      ...(tpmLimit !== undefined && { tpm_limit: tpmLimit }),
      ...(rpmLimit !== undefined && { rpm_limit: rpmLimit }),
    },
  };
}

export type TeamPatchValidation =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export function validateTeamPatchInput(input: TeamWriteInput & { blocked?: boolean }, cfg: TeamAdminConfig): TeamPatchValidation {
  const result: Record<string, unknown> = {};
  let hasRecognizedField = false;

  if (input.team_alias !== undefined) {
    hasRecognizedField = true;
    const trimmedAlias = (input.team_alias ?? '').trim();
    if (!trimmedAlias) {
      return { ok: false, error: 'team_alias must not be empty' };
    }
    result.team_alias = trimmedAlias;
  }

  if (input.models !== undefined) {
    hasRecognizedField = true;
    if (!Array.isArray(input.models) || input.models.length === 0) {
      return { ok: false, error: 'models must list at least one allowed model (a team with no explicit models grants access to every proxy model)' };
    }

    const allowedSet = new Set([...cfg.allowedModels, ...cfg.allowedModelAccessGroups]);
    if (allowedSet.size === 0) {
      return { ok: false, error: 'models are not allowed (team admin has configured no allowlist)' };
    }

    for (const model of input.models) {
      if (!allowedSet.has(model)) {
        return { ok: false, error: `model "${model}" is not in the allowed set for team admins` };
      }
    }

    result.models = input.models;
  }

  if (input.max_budget !== undefined) {
    hasRecognizedField = true;
    if (input.max_budget === null) {
      if (!cfg.allowUnlimitedBudget) {
        return { ok: false, error: 'max_budget cannot be cleared (unlimited budgets are disabled)' };
      }
      result.max_budget = null;
    } else {
      if (!Number.isFinite(input.max_budget) || input.max_budget <= 0) {
        return { ok: false, error: 'max_budget must be a positive number' };
      }
      if (cfg.maxBudgetCeiling !== undefined && input.max_budget > cfg.maxBudgetCeiling) {
        return { ok: false, error: `max_budget $${input.max_budget} exceeds the ceiling $${cfg.maxBudgetCeiling}` };
      }
      result.max_budget = input.max_budget;
    }
  }

  if (input.blocked !== undefined) {
    hasRecognizedField = true;
    if (typeof input.blocked !== 'boolean') {
      return { ok: false, error: 'blocked must be a boolean' };
    }
    result.blocked = input.blocked;
  }

  if (input.budget_duration !== undefined && typeof input.budget_duration === 'string' && input.budget_duration.trim() !== '') {
    hasRecognizedField = true;
    result.budget_duration = input.budget_duration;
  }

  if (input.tpm_limit !== undefined && Number.isFinite(input.tpm_limit) && input.tpm_limit >= 0) {
    hasRecognizedField = true;
    result.tpm_limit = input.tpm_limit;
  }

  if (input.rpm_limit !== undefined && Number.isFinite(input.rpm_limit) && input.rpm_limit >= 0) {
    hasRecognizedField = true;
    result.rpm_limit = input.rpm_limit;
  }

  if (!hasRecognizedField) {
    return { ok: false, error: 'no updatable fields provided' };
  }

  return { ok: true, value: result };
}
