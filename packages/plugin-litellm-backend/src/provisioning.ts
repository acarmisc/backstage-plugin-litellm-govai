import { Config } from '@backstage/config';
import { AuthService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { Request } from 'express';
import { LiteLLMClient } from './client';
import {
  UserInfo,
  ProvisioningDefaults,
  RoleConfig,
} from './types';

/**
 * Converts a Backstage user entity ref to a LiteLLM user_id.
 *
 * When userIdDomain is configured, the entity name is suffixed with the domain
 * so that LiteLLM user_ids match the organisation's email addresses:
 *   "user:default/andrea.carmisciano" + "abstract.it"
 *   → "andrea.carmisciano@abstract.it"
 *
 * Without a domain the bare entity name is returned unchanged, which works for
 * deployments where LiteLLM users were created with plain usernames.
 */
export function toLiteLLMUserId(userEntityRef: string, userIdDomain?: string): string {
  const name = userEntityRef.split('/').pop() ?? userEntityRef;
  return userIdDomain ? `${name}@${userIdDomain}` : name;
}

/**
 * Reads the provisioning block from config, applying safe defaults for every
 * field so the feature works out-of-the-box without any YAML required.
 *
 * Safe defaults rationale:
 *   maxBudget:      $10  — prevents runaway spend on a forgotten test account
 *   budgetDuration: 30d  — monthly reset, aligns with typical billing cycles
 *   models:         []   — empty means all proxy models are allowed;
 *                          restrict here or at team level for tighter control
 *   teams:          []   — no automatic team assignment; add IDs to enrol users
 *   tpmLimit:       none — LiteLLM global / team limits still apply
 *   rpmLimit:       none — same
 *   metadata:       backstage source tag only
 */
export function readRoleConfigs(config: Config): RoleConfig[] {
  const raw = config.getOptional<any[]>('litellm.provisioning.roles');
  if (!raw?.length) return [];
  return raw.map((r: any) => ({
    group: r.group as string,
    maxBudget: r.maxBudget,
    budgetDuration: r.budgetDuration,
    models: r.models,
    teams: r.teams,
    tpmLimit: r.tpmLimit,
    rpmLimit: r.rpmLimit,
    metadata: r.metadata,
  }));
}

/**
 * Merges role config over defaults. Role fields override defaults only when explicitly set.
 */
export function applyRoleOverrides(
  defaults: ProvisioningDefaults,
  role: RoleConfig,
): ProvisioningDefaults {
  return {
    maxBudget: role.maxBudget ?? defaults.maxBudget,
    budgetDuration: role.budgetDuration ?? defaults.budgetDuration,
    models: role.models ?? defaults.models,
    teams: role.teams ?? defaults.teams,
    tpmLimit: role.tpmLimit ?? defaults.tpmLimit,
    rpmLimit: role.rpmLimit ?? defaults.rpmLimit,
    metadata: { ...defaults.metadata, ...(role.metadata ?? {}) },
  };
}

export function readProvisioningDefaults(config: Config): { enabled: boolean; defaults: ProvisioningDefaults } {
  const enabled = config.getOptionalBoolean('litellm.provisioning.enabled') ?? false;
  const defaults: ProvisioningDefaults = {
    maxBudget: config.getOptionalNumber('litellm.provisioning.defaults.maxBudget') ?? 10,
    budgetDuration: config.getOptionalString('litellm.provisioning.defaults.budgetDuration') ?? '30d',
    models: config.getOptionalStringArray('litellm.provisioning.defaults.models') ?? [],
    teams: config.getOptionalStringArray('litellm.provisioning.defaults.teams') ?? [],
    tpmLimit: config.getOptionalNumber('litellm.provisioning.defaults.tpmLimit'),
    rpmLimit: config.getOptionalNumber('litellm.provisioning.defaults.rpmLimit'),
    metadata: (config.getOptional<Record<string, string>>('litellm.provisioning.defaults.metadata') ?? {}),
  };
  return { enabled, defaults };
}

/**
 * Extracts the authenticated Backstage user identity from the request token.
 * Returns the userEntityRef (e.g. "user:default/john.doe") or undefined when
 * the request carries no user credential (service-to-service calls).
 */
export async function resolveUserId(req: Request, auth: AuthService): Promise<string | undefined> {
  const rawToken = req.headers.authorization?.slice(7);
  if (!rawToken) return undefined;
  try {
    const credentials = await auth.authenticate(rawToken);
    const principal = credentials.principal as any;
    if (principal?.type === 'user') {
      return principal.userEntityRef as string;
    }
  } catch {
    // invalid or service token — caller gets query-param fallback
  }
  return undefined;
}

/**
 * Creates a LiteLLM user for the given Backstage identity using the configured
 * defaults. Returns the UserInfo of the newly created account.
 */
export async function provisionUser(
  client: LiteLLMClient,
  userId: string,
  defaults: ProvisioningDefaults,
  logger: any,
): Promise<UserInfo | null> {
  const payload = {
    user_id: userId,
    max_budget: defaults.maxBudget,
    budget_duration: defaults.budgetDuration,
    models: defaults.models,
    teams: defaults.teams,
    ...(defaults.tpmLimit !== undefined && { tpm_limit: defaults.tpmLimit }),
    ...(defaults.rpmLimit !== undefined && { rpm_limit: defaults.rpmLimit }),
    metadata: {
      ...defaults.metadata,
      provisioned_by: 'backstage',
      provisioned_at: new Date().toISOString(),
      backstage_entity: userId,
    },
  };

  logger.info(`Provisioning new LiteLLM user for Backstage identity: ${userId}`);
  try {
    await client.createUser(payload);
    // Fetch the freshly-created user record to return consistent UserInfo shape
    return await client.getUserInfo(userId);
  } catch (err: any) {
    logger.error(`Failed to provision LiteLLM user ${userId}: ${err.message}`);
    return null;
  }
}

export class ProvisioningError extends Error {
  status: number;
  body: { error: string; hint: string; provisioning: boolean };

  constructor(message: string, hint: string, provisioning: boolean) {
    super(message);
    this.status = 404;
    this.body = { error: message, hint, provisioning };
  }
}

/**
 * Ensures the LiteLLM user exists, returning its UserInfo.
 * When the user is missing and provisioning is enabled, attempts to create it.
 * When provisioning is disabled, throws a ProvisioningError with a clear message.
 */
export async function getOrProvisionUser(
  client: LiteLLMClient,
  tokenEntityRef: string | undefined,
  userId: string | undefined,
  provisioningEnabled: boolean,
  provisioningDefaults: ProvisioningDefaults,
  roleConfigs: RoleConfig[],
  catalogClient: CatalogClient,
  auth: AuthService,
  logger: any,
): Promise<UserInfo> {
  if (!userId) {
    throw new ProvisioningError(
      'User not found in LiteLLM',
      'No user identity could be resolved from the request.',
      provisioningEnabled,
    );
  }

  let userInfo: UserInfo | null = await client.getUserInfo(userId);

  if (!userInfo) {
    if (provisioningEnabled) {
      const catalogRef = tokenEntityRef ?? userId;
      const matchedRole = await resolveUserRole(catalogRef, roleConfigs, catalogClient, auth, logger);
      const effectiveDefaults = matchedRole
        ? applyRoleOverrides(provisioningDefaults, matchedRole)
        : provisioningDefaults;
      if (matchedRole) {
        logger.info(`User ${userId} matched role group ${matchedRole.group} — using role-specific provisioning`);
      }
      userInfo = await provisionUser(client, userId, effectiveDefaults, logger);
    }

    if (!userInfo) {
      if (provisioningEnabled) {
        throw new ProvisioningError(
          'User not found in LiteLLM',
          'Provisioning attempted but failed — check LiteLLM logs',
          true,
        );
      }
      throw new ProvisioningError(
        'User not found in LiteLLM',
        'Enable litellm.provisioning.enabled in app-config.yaml or create the user manually',
        false,
      );
    }
  }

  return userInfo;
}

/**
 * Fetches the user's Backstage group memberships and returns the first matching
 * role config (priority order), or undefined when no role matches.
 */
export async function resolveUserRole(
  userEntityRef: string,
  roleConfigs: RoleConfig[],
  catalogClient: CatalogClient,
  auth: AuthService,
  logger: any,
): Promise<RoleConfig | undefined> {
  if (!roleConfigs.length) return undefined;
  try {
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });
    const entity = await catalogClient.getEntityByRef(userEntityRef, { token });
    const groups = (entity?.relations ?? [])
      .filter(r => r.type === 'memberOf')
      .map(r => r.targetRef);
    return roleConfigs.find(rc => groups.includes(rc.group));
  } catch (err: any) {
    logger.warn(`Could not resolve Backstage groups for ${userEntityRef}: ${err.message}`);
    return undefined;
  }
}
