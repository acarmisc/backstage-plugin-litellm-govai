import { Config } from '@backstage/config';
import { AuthService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { Request } from 'express';
import { LiteLLMClient } from './client';
import { UserInfo, ProvisioningDefaults, RoleConfig } from './types';

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
export function toLiteLLMUserId(
  userEntityRef: string,
  userIdDomain?: string,
): string {
  const name = userEntityRef.split('/').pop() ?? userEntityRef;
  // Defensive: if the entity name is already email-shaped (e.g. when the
  // Keycloak provider imports usernames as full emails without our
  // name-rewrite transformer running, or when a catalog change leaves
  // an entity ref like "user:default/foo@bar.it"), do NOT append the
  // userIdDomain — that produced "foo@bar.it@bar.it" in production.
  if (name.includes('@')) return name;
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
    userRole: r.userRole,
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
    userRole: role.userRole ?? defaults.userRole,
    metadata: { ...defaults.metadata, ...(role.metadata ?? {}) },
  };
}

export function readProvisioningDefaults(config: Config): {
  enabled: boolean;
  defaults: ProvisioningDefaults;
} {
  const enabled =
    config.getOptionalBoolean('litellm.provisioning.enabled') ?? false;
  const defaults: ProvisioningDefaults = {
    maxBudget:
      config.getOptionalNumber('litellm.provisioning.defaults.maxBudget') ?? 10,
    budgetDuration:
      config.getOptionalString(
        'litellm.provisioning.defaults.budgetDuration',
      ) ?? '30d',
    models:
      config.getOptionalStringArray('litellm.provisioning.defaults.models') ??
      [],
    teams:
      config.getOptionalStringArray('litellm.provisioning.defaults.teams') ??
      [],
    tpmLimit: config.getOptionalNumber(
      'litellm.provisioning.defaults.tpmLimit',
    ),
    rpmLimit: config.getOptionalNumber(
      'litellm.provisioning.defaults.rpmLimit',
    ),
    userRole:
      config.getOptionalString('litellm.provisioning.defaults.userRole') ??
      'internal_user',
    metadata:
      config.getOptional<Record<string, string>>(
        'litellm.provisioning.defaults.metadata',
      ) ?? {},
  };
  return { enabled, defaults };
}

/**
 * Extracts the authenticated Backstage user identity from the request token.
 * Returns the userEntityRef (e.g. "user:default/john.doe") or undefined when
 * the request carries no user credential (service-to-service calls).
 */
export async function resolveUserId(
  req: Request,
  auth: AuthService,
): Promise<string | undefined> {
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
 * Profile data extracted from a Backstage Catalog User entity, used to
 * populate user_email / user_alias on the LiteLLM record.
 */
export interface BackstageUserProfile {
  email?: string;
  displayName?: string;
}

/**
 * Looks up the catalog User entity for the authenticated user and returns
 * the profile block. Returns an empty object when the user has no catalog
 * entity (e.g. dangerouslyAllowSignInWithoutUserInCatalog was used) — the
 * caller falls back to deriving identity from userIdDomain.
 */
export async function resolveUserProfile(
  userEntityRef: string,
  catalogClient: CatalogClient,
  auth: AuthService,
  logger: any,
): Promise<BackstageUserProfile> {
  try {
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });
    const entity = await catalogClient.getEntityByRef(userEntityRef, { token });
    const profile = (entity?.spec as any)?.profile ?? {};
    return {
      email: profile.email,
      displayName: profile.displayName,
    };
  } catch (err: any) {
    logger.warn(
      `Could not fetch catalog profile for ${userEntityRef}: ${err.message}`,
    );
    return {};
  }
}

/**
 * Creates a LiteLLM user for the given Backstage identity using the configured
 * defaults. Returns the UserInfo of the newly created account.
 */
export async function provisionUser(
  client: LiteLLMClient,
  userId: string,
  defaults: ProvisioningDefaults,
  profile: BackstageUserProfile,
  backstageEntity: string | undefined,
  logger: any,
): Promise<UserInfo | null> {
  const payload = {
    user_id: userId,
    ...(profile.email && { user_email: profile.email }),
    ...(profile.displayName && { user_alias: profile.displayName }),
    max_budget: defaults.maxBudget,
    budget_duration: defaults.budgetDuration,
    models: defaults.models,
    teams: defaults.teams,
    ...(defaults.tpmLimit !== undefined && { tpm_limit: defaults.tpmLimit }),
    ...(defaults.rpmLimit !== undefined && { rpm_limit: defaults.rpmLimit }),
    ...(defaults.userRole && { user_role: defaults.userRole }),
    auto_create_key: false,
    metadata: {
      ...defaults.metadata,
      provisioned_by: 'backstage',
      provisioned_at: new Date().toISOString(),
      backstage_entity: backstageEntity ?? userId,
      ...(profile.email && { backstage_email: profile.email }),
      ...(profile.displayName && {
        backstage_display_name: profile.displayName,
      }),
    },
  };

  logger.info(
    `Provisioning new LiteLLM user for Backstage identity: ${userId}` +
      (profile.email ? ` (email=${profile.email})` : ''),
  );
  try {
    await client.createUser(payload);
    // Defensive /user/update: LiteLLM's /user/new upsert path has been
    // observed to drop user_role under concurrent inserts (the first
    // call sets the field, a racing second call upserts and clears it).
    // Re-asserting the role-bearing fields immediately after creation
    // is cheap and makes the role guarantee robust.
    if (defaults.userRole) {
      try {
        await client.updateUser({
          user_id: userId,
          user_role: defaults.userRole,
          ...(profile.email && { user_email: profile.email }),
          ...(profile.displayName && { user_alias: profile.displayName }),
        });
      } catch (updateErr: any) {
        logger.warn(
          `Defensive /user/update after provisioning ${userId} failed: ${updateErr.message}`,
        );
      }
    }
    // Fetch the freshly-created user record to return consistent UserInfo shape
    return await client.getUserInfo(userId);
  } catch (err: any) {
    logger.error(`Failed to provision LiteLLM user ${userId}: ${err.message}`);
    throw err;
  }
}

/**
 * Module-scope single-flight cache keyed by LiteLLM user_id. Coalesces
 * concurrent provisioning attempts for the same user so /user/new fires
 * at most once per user across parallel requests. Without this, an
 * authenticated page load that fires /keys, /teams and /usage in
 * parallel triggers three concurrent /user/new calls; LiteLLM's
 * upsert path then creates one default key per call (so the user lands
 * with 3 unexpected keys) and may silently lose user_role.
 *
 * Cache entries are removed once the promise settles, so subsequent
 * requests for a re-deleted user can still trigger fresh provisioning.
 */
const provisioningInFlight = new Map<string, Promise<UserInfo>>();

/**
 * Strips any echoed Authorization bearer token from upstream LiteLLM error
 * messages before they're shipped back to the browser. LiteLLM normally does
 * not echo the master key, but defense in depth: never let a `Bearer …`
 * substring travel out in a response body.
 */
function sanitizeUpstreamMessage(message: string): string {
  if (!message) return 'unknown error';
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, 'sk-[redacted]')
    .slice(0, 500);
}

export class ProvisioningError extends Error {
  status: number;
  body: { error: string; hint: string; provisioning: boolean };

  constructor(
    message: string,
    hint: string,
    provisioning: boolean,
    status = 404,
  ) {
    super(message);
    this.status = status;
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

  const existing = await client.getUserInfo(userId);
  if (existing) {
    return existing;
  }

  if (!provisioningEnabled) {
    throw new ProvisioningError(
      'User not found in LiteLLM',
      'Enable litellm.provisioning.enabled in app-config.yaml or create the user manually',
      false,
    );
  }

  // Single-flight: if another request for the same userId is already
  // provisioning, await its result instead of starting a new /user/new.
  // This collapses the /keys + /teams + /usage page-load thundering
  // herd into a single LiteLLM round-trip.
  const pending = provisioningInFlight.get(userId);
  if (pending) {
    logger.info(
      `LiteLLM provisioning already in flight for ${userId} — joining`,
    );
    return pending;
  }

  const provisionPromise = (async () => {
    const catalogRef = tokenEntityRef ?? userId;
    const [matchedRole, profile] = await Promise.all([
      resolveUserRole(catalogRef, roleConfigs, catalogClient, auth, logger),
      tokenEntityRef
        ? resolveUserProfile(tokenEntityRef, catalogClient, auth, logger)
        : Promise.resolve<BackstageUserProfile>({}),
    ]);
    const effectiveDefaults = matchedRole
      ? applyRoleOverrides(provisioningDefaults, matchedRole)
      : provisioningDefaults;
    if (matchedRole) {
      logger.info(
        `User ${userId} matched role group ${matchedRole.group} — using role-specific provisioning`,
      );
    }
    try {
      const created = await provisionUser(
        client,
        userId,
        effectiveDefaults,
        profile,
        tokenEntityRef,
        logger,
      );
      if (!created) {
        throw new ProvisioningError(
          'User not found in LiteLLM',
          'Provisioning attempted but returned no user — check LiteLLM logs',
          true,
        );
      }
      return created;
    } catch (err: any) {
      // The single-flight cache should prevent the parallel-409 race,
      // but keep the recovery path: if /user/new still 409s (e.g.
      // multi-replica deploys where the lock is per-process), treat
      // it as "user exists" and re-fetch.
      if (err.status === 409 || /already exists/i.test(err.message ?? '')) {
        logger.info(
          `LiteLLM user ${userId} already exists during provisioning — re-fetching`,
        );
        const refetched = await client.getUserInfo(userId);
        if (refetched) {
          return refetched;
        }
      }
      if (err instanceof ProvisioningError) {
        throw err;
      }
      // Map upstream LiteLLM status to a Backstage-safe gateway status.
      // 401/403/5xx from LiteLLM mean the gateway (this plugin) cannot
      // talk to LiteLLM — they MUST NOT propagate as 401/403 to the
      // browser, otherwise Backstage's fetch middleware treats the
      // user's Backstage session as expired and forces a re-login.
      // Only safe client-semantic codes pass through.
      const upstreamStatus = err.status;
      const passThrough = [400, 404, 409, 422].includes(upstreamStatus)
        ? upstreamStatus
        : 502;
      throw new ProvisioningError(
        'LiteLLM auto-provisioning failed',
        `LiteLLM upstream ${
          upstreamStatus ?? 'error'
        }: ${sanitizeUpstreamMessage(err.message)}`,
        true,
        passThrough,
      );
    }
  })();

  provisioningInFlight.set(userId, provisionPromise);
  try {
    return await provisionPromise;
  } finally {
    provisioningInFlight.delete(userId);
  }
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
    logger.warn(
      `Could not resolve Backstage groups for ${userEntityRef}: ${err.message}`,
    );
    return undefined;
  }
}
