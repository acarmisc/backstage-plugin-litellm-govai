/**
 * Key generation service — unified by PR-6.
 *
 * Extracts the common logic for creating API keys from both the UI (POST /keys/generate)
 * and the bridge (POST /bridge/keys). Handles validation, provisioning, team/model checks,
 * and explicit upstream request construction.
 */

import { AuthService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient } from '../client';
import {
  GenerateKeyRequest,
  GenerateKeyResponse,
  ProvisioningDefaults,
  RoleConfig,
} from '../types';
import {
  resolveUserProfile,
  getOrProvisionUser,
} from '../provisioning';
import {
  type KeyValidationConfig,
  type GenerateKeyInput,
} from '@acarmisc/backstage-plugin-litellm-common';

/** Unified identity for key creation — resolved from either Backstage or JWT claims. */
export interface KeyCreateUser {
  /** Backstage user entity ref, e.g. "user:default/alice" (may be empty for bridge). */
  tokenEntityRef?: string;
  /** Resolved LiteLLM user_id. Required. */
  userId: string;
}

/** Context needed to create a key — configuration, clients, and services. */
export interface KeyCreateContext {
  client: LiteLLMClient;
  config: {
    allowUnlimitedBudget: boolean;
    teamRequired: boolean;
  };
  catalogClient?: CatalogClient;
  auth?: AuthService;
  logger: any; // LoggerService doesn't have consistent interface across versions
  keyValidationConfig: KeyValidationConfig;
  provisioningEnabled: boolean;
  provisioningDefaults: ProvisioningDefaults;
  roleConfigs: RoleConfig[];
  userIdDomain?: string;
}

/** Error thrown during key creation — maps to HTTP responses. */
export class KeyServiceError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
    message?: string,
  ) {
    super(message || JSON.stringify(body));
  }
}

/**
 * Creates a new API key for the specified user.
 *
 * Performs:
 * - Schema validation of the input
 * - Config flag enforcement (allowUnlimitedBudget, teamRequired)
 * - User provisioning (single-flight, role configs)
 * - Team membership validation
 * - Model subset validation
 * - Metadata stamping
 * - Explicit upstream request construction and call
 *
 * @param user Verified identity: tokenEntityRef (optional) + userId (required)
 * @param input Parsed GenerateKeyInput from the schema
 * @param ctx Configuration and service clients
 * @returns The new key response from LiteLLM
 * @throws KeyServiceError with status and body for HTTP response
 * @throws ProvisioningError for provisioning failures
 * @throws LiteLLMUpstreamError for upstream LiteLLM errors
 */
export async function createKeyForUser(
  user: KeyCreateUser,
  input: GenerateKeyInput,
  ctx: KeyCreateContext,
): Promise<GenerateKeyResponse> {
  const {
    client,
    config,
    catalogClient,
    auth,
    logger,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
  } = ctx;

  // ── Ensure user is provisioned ──────────────────────────────────────
  // For bridge (no catalogClient/auth), use direct provisioning from JWT;
  // for UI (with catalogClient/auth), use full provisioning with group roles.
  let userInfo: any;
  if (catalogClient != null && auth != null) {
    userInfo = await getOrProvisionUser(
      client,
      user.tokenEntityRef || '',
      user.userId,
      provisioningEnabled,
      provisioningDefaults,
      roleConfigs,
      catalogClient,
      auth,
      logger,
    );
  } else {
    // Bridge path: just check if user exists, or provision with minimal info
    userInfo = await client.getUserInfo(user.userId);
    if (!userInfo) {
      if (!provisioningEnabled) {
        throw new KeyServiceError(
          404,
          {
            error: 'User not found in LiteLLM',
            detail: 'No LiteLLM user for this identity. Log in to Backstage once to be provisioned, or enable litellm.provisioning.enabled.',
          },
        );
      }
      // Provision with minimal info (just user_id, will use defaults)
      const created = await client.createUser({
        user_id: user.userId,
        user_email: user.userId,
        max_budget: provisioningDefaults.maxBudget,
        budget_duration: provisioningDefaults.budgetDuration,
        models: provisioningDefaults.models,
        teams: provisioningDefaults.teams?.length ? [provisioningDefaults.teams[0]] : [],
      });
      if (!created) {
        throw new KeyServiceError(
          500,
          {
            error: 'User provisioning failed',
            detail: 'Failed to create user in LiteLLM',
          },
        );
      }
      userInfo = await client.getUserInfo(user.userId);
    }
  }

  // ── Enforce config flags ────────────────────────────────────────────
  if (!config.allowUnlimitedBudget && (input.max_budget === null || input.max_budget === undefined)) {
    throw new KeyServiceError(
      400,
      { error: 'max_budget is required when unlimited budgets are not allowed' },
    );
  }

  if (config.teamRequired && !input.team_id) {
    throw new KeyServiceError(
      400,
      { error: 'team_id is required' },
    );
  }

  // ── Validate team membership ────────────────────────────────────────
  if (input.team_id) {
    const userTeams = userInfo?.teams ?? [];
    if (!userTeams.includes(input.team_id)) {
      throw new KeyServiceError(
        403,
        {
          error: 'Access denied: team is not one of your teams',
          team_id: input.team_id,
        },
      );
    }
  }

  // ── Validate models are subset of allowed ────────────────────────────
  if (input.models && input.models.length > 0) {
    // When team_id is set, use team's models; otherwise use user's models.
    // Empty/missing allowedModels list means unrestricted.
    let allowedModels: string[] = [];
    if (input.team_id) {
      // Fetch team info to get its allowed models.
      // Fail closed: if the team can't be fetched the error propagates
      // rather than silently skipping the model check.
      const teamInfo = await client.getTeamInfo(input.team_id);
      allowedModels = teamInfo?.models ?? [];
    } else {
      allowedModels = userInfo?.models ?? [];
    }

    // Only enforce if the allowedModels list is non-empty (non-empty = restricted)
    if (allowedModels.length > 0) {
      const disallowed = input.models.filter(m => !allowedModels.includes(m));
      if (disallowed.length > 0) {
        throw new KeyServiceError(
          400,
          {
            error: 'One or more requested models are not allowed',
            disallowed_models: disallowed,
          },
        );
      }
    }
  }

  // ── Stamp ownership into LiteLLM key metadata ────────────────────────
  // LiteLLM's native `created_by` column is only populated when the caller
  // authenticates via JWT/SSO; we always call with the master key, so that
  // column stays null. Enriching `metadata` makes the owner identity visible
  // in LiteLLM's UI and queryable via API.
  const profile = user.tokenEntityRef && catalogClient != null && auth != null
    ? await resolveUserProfile(user.tokenEntityRef, catalogClient, auth, logger)
    : {};
  const clientMetadata = input.metadata ?? {};
  const serverMetadata = {
    created_by_backstage_user: user.tokenEntityRef ?? 'unknown',
    ...(profile.email && { created_by_email: profile.email }),
    ...(profile.displayName && {
      created_by_display_name: profile.displayName,
    }),
    created_via: 'backstage',
    created_at_iso: new Date().toISOString(),
  };
  // Server-owned keys override client values
  const enrichedMetadata = {
    ...clientMetadata,
    ...serverMetadata,
  };

  // ── Build upstream request EXPLICITLY from parsed fields ──────────────
  // Never spread the raw body; only include fields we've explicitly validated.
  const upstreamRequest: GenerateKeyRequest = {
    alias: input.alias,
    user_id: user.userId,
  };

  if (input.models !== undefined) {
    upstreamRequest.models = input.models;
  }
  if (input.duration !== undefined) {
    upstreamRequest.duration = input.duration;
  }
  if (input.max_budget !== undefined) {
    // max_budget from input can be null (unlimited) or a number
    upstreamRequest.max_budget = input.max_budget ?? undefined;
  }
  if (input.tpm_limit !== undefined) {
    upstreamRequest.tpm_limit = input.tpm_limit;
  }
  if (input.rpm_limit !== undefined) {
    upstreamRequest.rpm_limit = input.rpm_limit;
  }
  if (input.team_id !== undefined) {
    upstreamRequest.team_id = input.team_id;
  }
  if (input.key_type !== undefined) {
    upstreamRequest.key_type = input.key_type;
  }
  upstreamRequest.metadata = enrichedMetadata;

  // ── Call upstream LiteLLM ───────────────────────────────────────────
  const result: GenerateKeyResponse = await client.generateKey(upstreamRequest);
  logger.info({ action: 'key.generate', userId: user.userId, keyAlias: input.alias });
  return result;
}
