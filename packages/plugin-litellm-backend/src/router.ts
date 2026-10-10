import express, { Router, Request, Response } from 'express';
import { AuthService, DiscoveryService, PermissionsService, LoggerService, RootConfigService } from '@backstage/backend-plugin-api';
import { AuthorizeResult, BasicPermission } from '@backstage/plugin-permission-common';
import { NotAllowedError } from '@backstage/errors';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient, LiteLLMUpstreamError } from './client';
import { TeamInfo } from './types';
import {
  resolveCredentials,
  resolveUserId,
  toLiteLLMUserId,
  readProvisioningDefaults,
  readRoleConfigs,
  isUserMemberOfGroup,
  ProvisioningError,
  findLiteLLMUser,
  effectiveUserId,
} from './provisioning';
import { TokenVerifier } from './bridge';
import {
  type KeyValidationConfig,
  DEFAULT_KEY_BUDGET_DURATIONS,
  DEFAULT_KEY_DURATIONS,
} from '@acarmisc/backstage-plugin-litellm-common';
import {
  isTeamManagementEnabled,
  isObjectPermissionsEnabled,
  readTeamAdminConfig,
  assertTeamAdmin,
} from './teamAdmin';
import { readTeamBudgetVisibility } from './teamBudgetVisibility';
import { readOpencodeConfig } from './opencode';
import { readMemberBreakdownConfig } from './teamMemberUsage';
import { sendError } from './errors';
import type { RouterContext } from './routes/context';
import { createRequireUser } from './routes/middleware/withUser';
import { withUserInfoCache } from './services/userInfoCache';
import { registerConfigRoutes } from './routes/config';
import { registerKeysRoutes } from './routes/keys';
import { registerOpencodeRoutes } from './routes/opencode';
import { registerTeamsRoutes } from './routes/teams';
import { registerObjectPermissionsRoutes } from './routes/objectPermissions';
import { registerTeamUsageRoutes } from './routes/teamUsage';
import { registerBridgeRoutes } from './routes/bridge';
import { withTeamFetchRetry } from './http/teamFetch';

export { ProvisioningError };

export interface RouterOptions {
  config: RootConfigService;
  logger: LoggerService;
  auth: AuthService;
  discovery: DiscoveryService;
  permissions: PermissionsService;
  /** Override the LiteLLM client (tests). Defaults to one built from config. */
  client?: LiteLLMClient;
  /** Override the catalog client (tests). Defaults to one built from discovery. */
  catalogClient?: CatalogClient;
  /** Override the bridge token verifier (tests). Defaults to a Keycloak JWKS verifier. */
  tokenVerifier?: TokenVerifier;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { config, logger, auth, discovery, permissions } = options;

  const baseUrl = config.getString('litellm.baseUrl');
  const masterKey = config.getString('litellm.masterKey');
  const userIdDomain = config.getOptionalString('litellm.userIdDomain');
  // Publicly reachable LiteLLM proxy URL, used to build ready-to-paste
  // snippets in the frontend. Only exposed if explicitly configured.
  // When unset, returned as null to the FE.
  const publicBaseUrl = config.getOptionalString('litellm.publicBaseUrl') ?? null;
  // Support contact for unprovisioned users (optional).
  const supportContact = config.getOptionalString('litellm.supportContact');
  const baseClient = options.client ?? new LiteLLMClient({ baseUrl, masterKey });

  // Wrap client with userInfoCache. TTL is configurable (default 10s, 0 disables).
  const userInfoCacheTtlSeconds = config.getOptionalNumber('litellm.cache.userInfoTtlSeconds') ?? 10;
  const client = userInfoCacheTtlSeconds > 0
    ? withUserInfoCache(baseClient, { ttlMs: userInfoCacheTtlSeconds * 1000 })
    : baseClient;

  const { enabled: provisioningEnabled, defaults: provisioningDefaults } =
    readProvisioningDefaults(config);
  const roleConfigs = readRoleConfigs(config);
  const auditGroup = config.getOptionalString('litellm.audit.group');
  const allowUnlimitedBudget = config.getOptionalBoolean('litellm.keyGeneration.allowUnlimitedBudget') ?? false;
  const teamRequired = config.getOptionalBoolean('litellm.keyGeneration.teamRequired') ?? true;
  const allowOwnerResetSpend = config.getOptionalBoolean('litellm.keys.allowOwnerResetSpend') ?? false;
  // Key validation ceilings (PR-2)
  const keyMaxBudget = config.getOptionalNumber('litellm.keys.maxBudget') ?? 100;
  const keyMaxTpm = config.getOptionalNumber('litellm.keys.maxTpm') ?? 100000;
  const keyMaxRpm = config.getOptionalNumber('litellm.keys.maxRpm') ?? 1000;
  const keyAllowedDurations = config.getOptionalStringArray('litellm.keys.allowedDurations') ?? DEFAULT_KEY_DURATIONS;
  const keyValidationConfig: KeyValidationConfig = {
    maxBudget: keyMaxBudget,
    maxTpm: keyMaxTpm,
    maxRpm: keyMaxRpm,
    allowedDurations: keyAllowedDurations,
    allowedBudgetDurations:
      config.getOptionalStringArray('litellm.keys.allowedBudgetDurations') ??
      DEFAULT_KEY_BUDGET_DURATIONS,
  };
  const teamMgmtEnabled = isTeamManagementEnabled(config);
  const objectPermsEnabled = isObjectPermissionsEnabled(config);
  const teamAdminCfg = readTeamAdminConfig(config);
  const teamBudgetVisibility = readTeamBudgetVisibility(config);
  const opencodeCfg = readOpencodeConfig(config);
  const memberBreakdownCfg = readMemberBreakdownConfig(config);
  const catalogClient = options.catalogClient ?? new CatalogClient({ discoveryApi: discovery });

  if (provisioningEnabled) {
    logger.info(
      `LiteLLM auto-provisioning enabled — defaults: budget=$${
        provisioningDefaults.maxBudget
      }/${provisioningDefaults.budgetDuration}, models=${
        provisioningDefaults.models.length
          ? provisioningDefaults.models.join(',')
          : 'all'
      }, teams=[${provisioningDefaults.teams.join(',')}]`,
    );
  }

  if (config.getOptional('litellm.teamAdmin') && !teamMgmtEnabled) {
    logger.warn(
      'litellm.teamAdmin is configured but team management is disabled — set permission.enabled: true and litellm.teamAdmin.group to enable it.',
    );
  }

  if (
    teamBudgetVisibility.hideTeamBudgetForMembers ||
    teamBudgetVisibility.hideTeamBudgetForManagers
  ) {
    logger.info(
      `LiteLLM team budget hiding enabled — members: ${teamBudgetVisibility.hideTeamBudgetForMembers}, managers: ${teamBudgetVisibility.hideTeamBudgetForManagers}`,
    );
  }

  // LiteLLM user id of a Backstage user: the computed id, or the id of an
  // existing user with the same catalog email.
  const resolveMemberUserId = async (userEntityRef: string): Promise<string> => {
    const computed = toLiteLLMUserId(userEntityRef, userIdDomain);
    await findLiteLLMUser(client, userEntityRef, computed, catalogClient, auth, logger);
    return effectiveUserId(computed);
  };

  // Build shared RouterContext with config and helpers
  const ctx: RouterContext = {
    resolveMemberUserId,
    client,
    catalogClient,
    auth,
    permissions,
    logger,
    baseUrl,
    publicBaseUrl,
    supportContact,
    userIdDomain,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
    auditGroup,
    allowUnlimitedBudget,
    teamRequired,
    allowOwnerResetSpend,
    keyValidationConfig,
    teamMgmtEnabled,
    objectPermsEnabled,
    teamAdminCfg,
    teamBudgetVisibility,
    opencodeCfg,
    memberBreakdownCfg,

    // Helper functions - defined inline below this object
    authorizeKeyAction: async (req: Request, keyId: string) => {
      // Express middleware should have populated req.res.locals with user info
      if (!req.res || !req.res.locals.tokenEntityRef || !req.res.locals.userId) {
        throw new NotAllowedError('User identity not found in request');
      }
      const tokenEntityRef = req.res.locals.tokenEntityRef as string;
      // The LiteLLM user may exist under a different id, found by email.
      const userId = await resolveMemberUserId(tokenEntityRef);
      const ownKeys = await client.listKeys(userId);
      const key = ownKeys.find(k => (k.token ?? k.key) === keyId);
      if (!key) {
        throw new NotAllowedError('Access denied: key does not belong to the caller');
      }
      return { tokenEntityRef, userId, key };
    },

    assertPermission: async (req: Request, permission: BasicPermission): Promise<boolean> => {
      const credentials = await resolveCredentials(req, auth);
      if (!credentials) return false;
      const [decision] = await permissions.authorize([{ permission }], {
        credentials,
      });
      return decision.result === AuthorizeResult.ALLOW;
    },

    sendPermissionDenied: (res: Response, permission: BasicPermission): void => {
      res.status(403).json({
        error: `Access denied: missing permission "${permission.name}"`,
      });
    },

    requireTeamMgmt: (res: Response): boolean => {
      if (!teamMgmtEnabled) {
        res.status(403).json({
          error: 'Team management is disabled (requires permission.enabled and litellm.teamAdmin.group)',
        });
        return false;
      }
      return true;
    },

    requireObjectPerms: (res: Response): boolean => {
      if (!ctx.requireTeamMgmt(res)) return false;
      if (!objectPermsEnabled) {
        res.status(403).json({
          error:
            'Knowledge-base / MCP management is disabled (set litellm.teamAdmin.objectPermissions.enabled: true, with a permission policy and the allowlists in place)',
        });
        return false;
      }
      return true;
    },

    sendTeamError: (err: unknown, res: Response): void => {
      sendError(res, err, logger, 'team operation');
    },

    authorizeTeamSubresource: async (
      req: Request,
      res: Response,
      permission: BasicPermission,
      opts?: { allowTeamRole?: boolean },
    ): Promise<
      | {
          teamId: string;
          owningGroup: string;
          actor: string;
          team: TeamInfo;
          via: 'group' | 'teamRole';
        }
      | null
    > => {
      if (!ctx.requireTeamMgmt(res)) return null;
      if (!teamAdminCfg.group) {
        res.status(500).json({ error: 'Team management is misconfigured (group is missing)' });
        return null;
      }
      if (teamAdminCfg.readOnly) {
        res.status(403).json({
          error:
            'Team management is read-only (litellm.teamAdmin.readOnly): teams are managed outside Backstage',
        });
        return null;
      }

      const check = await assertTeamAdmin({
        req,
        auth,
        permissions,
        catalogClient,
        teamAdminGroup: teamAdminCfg.group,
        permission,
        logger,
      });
      // A caller outside the admin group may still qualify through their
      // LiteLLM team role (litellm.teamAdmin.memberManagerRoles), so a 403
      // here is deferred until that path has been tried.
      const teamRoleEligible =
        !!opts?.allowTeamRole && teamAdminCfg.memberManagerRoles.length > 0;
      if (!check.ok && !(check.status === 403 && teamRoleEligible)) {
        res.status(check.status).json({ error: check.error });
        return null;
      }

      const { teamId } = req.params;
      if (!teamId) {
        res.status(400).json({ error: 'teamId is required' });
        return null;
      }

      let existing: TeamInfo;
      try {
        existing = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
      } catch (err: unknown) {
        if (err instanceof LiteLLMUpstreamError && err.status === 404) {
          res.status(404).json({ error: 'Team not found' });
          return null;
        }
        ctx.sendTeamError(err, res);
        return null;
      }

      const owningGroup =
        typeof existing.metadata?.owning_group === 'string'
          ? existing.metadata.owning_group
          : undefined;

      // Group path: admin-group member whose group owns the team.
      let denial: { status: number; error: string };
      if (!check.ok) {
        denial = { status: check.status, error: check.error };
      } else if (!owningGroup) {
        denial = {
          status: 403,
          error:
            'This team is not managed by Backstage team admins and cannot be edited here',
        };
      } else if (
        await isUserMemberOfGroup(
          check.userEntityRef,
          owningGroup,
          catalogClient,
          auth,
          logger,
        )
      ) {
        return {
          teamId,
          owningGroup,
          actor: check.userEntityRef,
          team: existing,
          via: 'group',
        };
      } else {
        denial = {
          status: 403,
          error: `Access denied: team is owned by ${owningGroup}`,
        };
      }

      // Team-role path: the caller holds an allowed role in this very team.
      // The permission framework still has the final say.
      if (teamRoleEligible) {
        const actor = await resolveUserId(req, auth);
        const litellmUserId =
          actor &&
          (await resolveMemberUserId(actor));
        const role = existing.members_with_roles?.find(
          m => m.user_id === litellmUserId,
        )?.role;
        if (
          actor &&
          role &&
          teamAdminCfg.memberManagerRoles.includes(role) &&
          (await ctx.assertPermission(req, permission))
        ) {
          return {
            teamId,
            owningGroup: owningGroup ?? '',
            actor,
            team: existing,
            via: 'teamRole',
          };
        }
      }

      res.status(denial.status).json({ error: denial.error });
      return null;
    },
  };


  const router = Router();
  // JSON body parser. Without this, every POST/PUT endpoint sees an empty
  // req.body. Backstage's httpRouter does not apply a body parser at the
  // plugin-router level, so each plugin must attach its own.
  router.use(express.json());
  // URL-encoded form parser for POST /opencode/connect (confirmation form).
  router.use(express.urlencoded({ extended: false }));

  // User-scoped routes act on the caller's own LiteLLM identity. That identity
  // comes ONLY from a verified Backstage user principal — never from the query
  // string or body — so service/external principals (and anonymous callers)
  // are rejected instead of being allowed to name an arbitrary user_id.
  const requireUser = createRequireUser(ctx);
  router.use(['/user/info', '/keys', '/usage'], requireUser);

  // Register config routes (/health, /config, /openapi.json, /provisioning/preview)
  registerConfigRoutes(router, ctx);
  registerKeysRoutes(router, ctx);

  registerOpencodeRoutes(router, ctx);
  registerTeamsRoutes(router, ctx);
  registerObjectPermissionsRoutes(router, ctx);
  registerTeamUsageRoutes(router, ctx);
  registerBridgeRoutes(router, ctx, { config, tokenVerifier: options.tokenVerifier });

  return router;
}
