/**
 * Key generation service.
 *
 * Extracts the common logic for creating API keys from both the UI (POST /keys/generate)
 * and the bridge (POST /bridge/keys). Handles validation, team/model checks,
 * and explicit upstream request construction. Callers resolve the user beforehand.
 */

import { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient } from '../client';
import {
  GenerateKeyRequest,
  GenerateKeyResponse,
  UserInfo,
} from '../types';
import {
  resolveUserProfile,
} from '../provisioning';
import {
  type KeyValidationConfig,
  type GenerateKeyInput,
} from '@acarmisc/backstage-plugin-litellm-common';

import { findDisallowedModels } from './modelAccess';

/** User identity for key creation — already resolved by the caller. */
export interface KeyCreateUser {
  /** Backstage user entity ref, e.g. "user:default/alice" (may be empty for bridge). */
  tokenEntityRef?: string;
  /** Resolved user info from LiteLLM. Required. */
  userInfo: UserInfo;
  /** How the key was created (for metadata stamping). Defaults to 'backstage'. */
  createdVia?: string;
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
  logger: LoggerService;
  keyValidationConfig: KeyValidationConfig;
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
 * - Team membership validation
 * - Model subset validation
 * - Metadata stamping
 * - Explicit upstream request construction and call
 *
 * @param user Resolved identity: tokenEntityRef (optional) + userInfo (required, pre-provisioned)
 * @param input Parsed GenerateKeyInput from the schema
 * @param ctx Configuration and service clients
 * @returns The new key response from LiteLLM
 * @throws KeyServiceError with status and body for HTTP response
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
  } = ctx;

  const userInfo = user.userInfo;

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

    const disallowed = await findDisallowedModels(client, input.models, allowedModels);
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

  // ── Stamp ownership into LiteLLM key metadata ────────────────────────
  // LiteLLM's native `created_by` column is only populated when the caller
  // authenticates via JWT/SSO; we always call with the master key, so that
  // column stays null. Enriching `metadata` makes the owner identity visible
  // in LiteLLM's UI and queryable via API.
  const profile = user.tokenEntityRef && catalogClient !== undefined && catalogClient !== null && auth !== undefined && auth !== null
    ? await resolveUserProfile(user.tokenEntityRef, catalogClient, auth, logger)
    : {};
  const clientMetadata = input.metadata ?? {};
  const createdVia = user.createdVia ?? 'backstage';
  const serverMetadata: Record<string, string> = {
    ...(user.tokenEntityRef && { created_by_backstage_user: user.tokenEntityRef }),
    ...(!user.tokenEntityRef && { created_by: userInfo.user_id }),
    ...(profile.email && { created_by_email: profile.email }),
    ...(profile.displayName && {
      created_by_display_name: profile.displayName,
    }),
    created_via: createdVia,
    created_at_iso: new Date().toISOString(),
  };
  // Server-owned keys override client values
  const enrichedMetadata: Record<string, string> = {
    ...clientMetadata,
    ...serverMetadata,
  };

  // ── Build upstream request EXPLICITLY from parsed fields ──────────────
  // Never spread the raw body; only include fields we've explicitly validated.
  const upstreamRequest: GenerateKeyRequest = {
    alias: input.alias,
    user_id: userInfo.user_id,
  };

  if (input.models !== undefined) {
    upstreamRequest.models = input.models;
  }
  // Never mint a non-expiring key by omission: default to 30d, or the first
  // allowed duration when 30d isn't offered.
  const durations = ctx.keyValidationConfig.allowedDurations;
  const defaultDuration =
    durations.length === 0 || durations.includes('30d') ? '30d' : durations[0];
  upstreamRequest.duration = input.duration ?? defaultDuration;
  if (input.max_budget !== undefined) {
    // max_budget from input can be null (unlimited) or a number
    upstreamRequest.max_budget = input.max_budget ?? undefined;
  }
  if (input.budget_duration !== undefined) {
    upstreamRequest.budget_duration = input.budget_duration;
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
  logger.info('key.generate', { userId: userInfo.user_id, keyAlias: input.alias });
  return result;
}
