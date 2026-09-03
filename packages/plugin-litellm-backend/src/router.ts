import express, { Router, Request, Response } from 'express';
import { Config } from '@backstage/config';
import { AuthService, DiscoveryService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthorizeResult, BasicPermission } from '@backstage/plugin-permission-common';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient, LiteLLMUpstreamError } from './client';
import { openApiSpec } from './openapi';
import {
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  UpdateKeyRequest,
} from './types';
import {
  toLiteLLMUserId,
  resolveUserId,
  resolveCredentials,
  resolveUserProfile,
  getOrProvisionUser,
  readProvisioningDefaults,
  readRoleConfigs,
  applyRoleOverrides,
  isUserMemberOfGroup,
  ProvisioningError,
} from './provisioning';
import {
  BridgeAuthError,
  BridgeClaims,
  TokenVerifier,
  bridgeGenerateKey,
  bridgeListKeys,
  newDefaultVerifier,
  readBridgeConfig,
} from './bridge';
import {
  litellmKeyCreatePermission,
  litellmKeyRevokePermission,
  litellmKeyManagePermission,
  litellmAuditReadPermission,
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
} from './permissions';
import { isTeamManagementEnabled, readTeamAdminConfig, assertTeamAdmin, validateTeamWriteInput, validateTeamPatchInput } from './teamAdmin';

export { ProvisioningError };

const teamCreateInFlight = new Map<string, Promise<unknown>>();

export interface RouterOptions {
  config: Config;
  logger: any;
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
  // snippets in the frontend. Falls back to baseUrl (the internal URL the
  // backend calls) when the operator has not configured a public one.
  const publicBaseUrl = config.getOptionalString('litellm.publicBaseUrl') ?? baseUrl;
  const client = options.client ?? new LiteLLMClient({ baseUrl, masterKey });
  const { enabled: provisioningEnabled, defaults: provisioningDefaults } =
    readProvisioningDefaults(config);
  const roleConfigs = readRoleConfigs(config);
  const auditGroup = config.getOptionalString('litellm.audit.group');
  const allowUnlimitedBudget = config.getOptionalBoolean('litellm.keyGeneration.allowUnlimitedBudget') ?? false;
  const teamRequired = config.getOptionalBoolean('litellm.keyGeneration.teamRequired') ?? true;
  const teamMgmtEnabled = isTeamManagementEnabled(config);
  const teamAdminCfg = readTeamAdminConfig(config);
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

  const router = Router();
  // JSON body parser. Without this, every POST/PUT endpoint sees an empty
  // req.body. Backstage's httpRouter does not apply a body parser at the
  // plugin-router level, so each plugin must attach its own.
  router.use(express.json());

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', provisioning: provisioningEnabled });
  });

  // Exposes the public LiteLLM proxy URL so the frontend can build
  // ready-to-paste curl / OpenAI-SDK snippets for freshly generated keys.
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      baseUrl: publicBaseUrl,
      keyGeneration: { allowUnlimitedBudget, teamRequired },
      teamManagement: {
        enabled: teamMgmtEnabled,
        maxBudgetCeiling: teamAdminCfg.maxBudgetCeiling ?? null,
        allowUnlimitedBudget: teamAdminCfg.allowUnlimitedBudget,
      },
    });
  });

  // Self-hosted OpenAPI 3.1 contract — lets integrators read a spec instead
  // of router.ts. No swagger-ui dependency; serve the JSON and point external
  // renderers (Stoplight, Swagger UI hosted elsewhere) at this endpoint.
  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  // Provisioning dry-run: resolves which role a Backstage group maps to and
  // echoes the effective defaults, collapsing the config → deploy → test loop
  // into one request. Admin-gated by the audit group (same RBAC as /audit).
  router.get('/provisioning/preview', async (req: Request, res: Response) => {
    if (!auditGroup) {
      res.status(403).json({ error: 'Preview is not configured (litellm.audit.group not set)' });
      return;
    }
    const tokenEntityRef = await resolveUserId(req, auth);
    if (!tokenEntityRef) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const allowed = await isUserMemberOfGroup(
      tokenEntityRef,
      auditGroup,
      catalogClient,
      auth,
      logger,
    );
    if (!allowed) {
      res.status(403).json({ error: 'Access denied: not a member of the audit group' });
      return;
    }
    const group = (req.query.group as string | undefined)?.trim();
    if (!group) {
      res.status(400).json({ error: 'group query parameter is required (e.g. group=group:default/ai-platform)' });
      return;
    }
    if (!roleConfigs.length) {
      res.json({
        group,
        matched_role: null,
        effective_defaults: provisioningDefaults,
        note: 'No litellm.provisioning.roles configured — every group receives the base defaults.',
      });
      return;
    }
    try {
      const matched = roleConfigs.find(rc => rc.group === group);
      const effective = matched
        ? applyRoleOverrides(provisioningDefaults, matched)
        : provisioningDefaults;
      res.json({
        group,
        matched_role: matched?.group ?? null,
        effective_defaults: effective,
      });
    } catch (error: any) {
      logger.error('Failed to resolve provisioning preview', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/user/info', async (req: Request, res: Response) => {
    try {
      const tokenEntityRef = await resolveUserId(req, auth);
      const userId = tokenEntityRef
        ? toLiteLLMUserId(tokenEntityRef, userIdDomain)
        : (req.query.user_id as string | undefined);

      const userInfo = await getOrProvisionUser(
        client,
        tokenEntityRef,
        userId,
        provisioningEnabled,
        provisioningDefaults,
        roleConfigs,
        catalogClient,
        auth,
        logger,
      );
      const canViewAudit =
        auditGroup && tokenEntityRef
          ? await isUserMemberOfGroup(
              tokenEntityRef,
              auditGroup,
              catalogClient,
              auth,
              logger,
            )
          : false;
      res.json({ ...userInfo, can_view_audit: canViewAudit });
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      logger.error('Failed to fetch user info', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/keys', async (req: Request, res: Response) => {
    try {
      const tokenEntityRef = await resolveUserId(req, auth);
      const userId = tokenEntityRef
        ? toLiteLLMUserId(tokenEntityRef, userIdDomain)
        : (req.query.user_id as string | undefined);

      await getOrProvisionUser(
        client,
        tokenEntityRef,
        userId,
        provisioningEnabled,
        provisioningDefaults,
        roleConfigs,
        catalogClient,
        auth,
        logger,
      );

      const keys: VirtualKey[] = await client.listKeys(userId);
      res.json(keys);
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      logger.error('Failed to list keys', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Key ownership guard ──────────────────────────────────────────────────
  //
  // Every key-mutation route below runs under the LiteLLM master key, so
  // without an explicit check any authenticated Backstage user could act on
  // any key whose token they learn (audit logs expose truncated tokens, and
  // anyone who has held the raw key knows it). We fetch the caller's own key
  // list and 403 if the target token isn't in it.
  //
  // Returns the caller's LiteLLM user_id (when resolvable) so handlers can
  // stamp it in logs without re-deriving it.
  async function authorizeKeyAction(
    req: Request,
    keyId: string,
  ): Promise<{ tokenEntityRef: string | undefined; userId: string | undefined }> {
    const tokenEntityRef = await resolveUserId(req, auth);
    const userId = tokenEntityRef
      ? toLiteLLMUserId(tokenEntityRef, userIdDomain)
      : (req.query.user_id as string | undefined);
    if (!userId) {
      throw Object.assign(new Error('Cannot verify key ownership without an authenticated user'), {
        status: 403,
        body: { error: 'Cannot verify key ownership without an authenticated user' },
      });
    }
    const ownKeys = await client.listKeys(userId);
    const owns = ownKeys.some(k => (k.token ?? k.key) === keyId);
    if (!owns) {
      throw Object.assign(new Error('Access denied: key does not belong to the caller'), {
        status: 403,
        body: { error: 'Access denied: key does not belong to the caller' },
      });
    }
    return { tokenEntityRef, userId };
  }

  // Normalize the ownership-guard rejection shape into a response.
  function sendOwnershipError(err: any, res: Response): boolean {
    if (err && typeof err.status === 'number' && err.body) {
      res.status(err.status).json(err.body);
      return true;
    }
    return false;
  }

  // ── Permission-framework guard ───────────────────────────────────────────
  //
  // Coarse-grained "is this identity allowed to do this at all" check, layered
  // on top of (not replacing) the ownership guard above. With no permission
  // policy installed (the default for a fresh Backstage instance) this always
  // resolves ALLOW, so behavior is unchanged until an operator wires up
  // @backstage-community/plugin-rbac or a custom PermissionPolicy.
  async function assertPermission(
    req: Request,
    permission: BasicPermission,
  ): Promise<boolean> {
    const credentials = await resolveCredentials(req, auth);
    if (!credentials) return false;
    const [decision] = await permissions.authorize([{ permission }], {
      credentials,
    });
    return decision.result === AuthorizeResult.ALLOW;
  }

  function sendPermissionDenied(res: Response, permission: BasicPermission): void {
    res.status(403).json({
      error: `Access denied: missing permission "${permission.name}"`,
    });
  }

  router.post('/keys/generate', async (req: Request, res: Response) => {
    try {
      // Only alias is hard-required. max_budget is optional: a positive
      // number caps spend, while null/undefined means "unlimited" (LiteLLM
      // supports null). An empty models array is intentional — in LiteLLM
      // `models: []` means "all models the user can access" which is the
      // desired default. Forcing a selection up front is too restrictive for
      // the common case.
      const body = (req.body ?? {}) as GenerateKeyRequest;
      const missing: string[] = [];
      if (!body.alias?.trim()) missing.push('alias');
      if (
        body.max_budget !== null &&
        body.max_budget !== undefined &&
        (typeof body.max_budget !== 'number' || body.max_budget <= 0)
      ) {
        missing.push('max_budget (positive number, or null for unlimited)');
      }
      if (missing.length) {
        res.status(400).json({
          error: 'Missing required fields',
          hint: `Required: ${missing.join(', ')}`,
        });
        return;
      }

      if (!(await assertPermission(req, litellmKeyCreatePermission))) {
        sendPermissionDenied(res, litellmKeyCreatePermission);
        return;
      }

      const tokenEntityRef = await resolveUserId(req, auth);
      const resolvedUserId = tokenEntityRef
        ? toLiteLLMUserId(tokenEntityRef, userIdDomain)
        : undefined;

      if (resolvedUserId) {
        await getOrProvisionUser(
          client,
          tokenEntityRef,
          resolvedUserId,
          provisioningEnabled,
          provisioningDefaults,
          roleConfigs,
          catalogClient,
          auth,
          logger,
        );
      }

      // Stamp ownership into LiteLLM key metadata. LiteLLM's native
      // `created_by` column is only populated when the caller authenticates
      // via JWT/SSO; we always call with the master key, so that column
      // stays null. Enriching `metadata` makes the owner identity visible
      // in LiteLLM's UI and queryable via API.
      const profile = tokenEntityRef
        ? await resolveUserProfile(tokenEntityRef, catalogClient, auth, logger)
        : {};
      const enrichedMetadata = {
        ...(body.metadata ?? {}),
        created_by_backstage_user: tokenEntityRef ?? 'unknown',
        ...(profile.email && { created_by_email: profile.email }),
        ...(profile.displayName && {
          created_by_display_name: profile.displayName,
        }),
        created_via: 'backstage',
        created_at_iso: new Date().toISOString(),
      };

      const request: GenerateKeyRequest = {
        ...body,
        metadata: enrichedMetadata,
        ...(resolvedUserId && { user_id: resolvedUserId }),
      };
      const result: GenerateKeyResponse = await client.generateKey(request);
      logger.info({ action: 'key.generate', userId: resolvedUserId ?? 'unknown', keyAlias: body.alias });
      res.json(result);
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      // LiteLLM's enterprise team-key hook silently overrides the requested
      // `duration` with the team's `metadata.team_member_key_duration` when a
      // team_id is set, before parsing it. A malformed value there 500s with
      // this exact message regardless of what we sent — surface that instead
      // of the opaque passthrough so it's actionable from the LiteLLM side.
      if (
        typeof error.message === 'string' &&
        error.message.includes('Invalid duration format') &&
        req.body?.team_id
      ) {
        res.status(502).json({
          error:
            'LiteLLM rejected the key duration for this team. The team has a ' +
            '"Team Member Key Duration" set in LiteLLM that is not in a valid ' +
            '<number><unit> format (e.g. "30d") and overrides whatever duration ' +
            'is requested. Fix or clear it in LiteLLM under Teams → this team → ' +
            'Team Settings, then retry.',
          teamId: req.body.team_id,
        });
        return;
      }
      // Preserve upstream LiteLLM status + structured error (e.g. a 400 with
      // param "key_alias" for a duplicate alias) so the frontend can
      // distinguish "alias taken" from a genuine server error.
      if (error instanceof LiteLLMUpstreamError) {
        res.status(error.status).json({
          error: error.message,
          ...(error.param ? { param: error.param } : {}),
        });
        return;
      }
      logger.error('Failed to generate key', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/keys/:keyId/update', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      if (!keyId) {
        res.status(400).json({ error: 'keyId is required' });
        return;
      }

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      const request: UpdateKeyRequest = { ...req.body, key: keyId };
      const result = await client.updateKey(request);
      logger.info({ action: 'key.update', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json(result);
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      logger.error('Failed to update key', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/keys/:keyId', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      if (!keyId) {
        res.status(400).json({ error: 'keyId is required' });
        return;
      }

      if (!(await assertPermission(req, litellmKeyRevokePermission))) {
        sendPermissionDenied(res, litellmKeyRevokePermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.deleteKeys({ keys: [keyId] });
      logger.info({ action: 'key.delete', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      logger.error('Failed to delete key', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/keys/:keyId/block', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.blockKey(keyId);
      logger.info({ action: 'key.block', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      logger.error('Failed to block key', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/keys/:keyId/unblock', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.unblockKey(keyId);
      logger.info({ action: 'key.unblock', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      logger.error('Failed to unblock key', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/keys/:keyId/reset_spend', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.resetKeySpend(keyId);
      logger.info({ action: 'key.reset_spend', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      logger.error('Failed to reset key spend', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/audit', async (req: Request, res: Response) => {
    if (!auditGroup) {
      res.status(403).json({ error: 'Audit log is not configured (litellm.audit.group not set)' });
      return;
    }
    const tokenEntityRef = await resolveUserId(req, auth);
    if (!tokenEntityRef) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const allowed = await isUserMemberOfGroup(
      tokenEntityRef,
      auditGroup,
      catalogClient,
      auth,
      logger,
    );
    if (!allowed) {
      res.status(403).json({ error: 'Access denied: not a member of the audit group' });
      return;
    }

    if (!(await assertPermission(req, litellmAuditReadPermission))) {
      sendPermissionDenied(res, litellmAuditReadPermission);
      return;
    }

    try {
      const { page, page_size, start_date, end_date, action, table_name, changed_by } =
        req.query as Record<string, string | undefined>;
      const result = await client.getAuditLogs({
        page: page ? Number(page) : undefined,
        page_size: page_size ? Number(page_size) : 25,
        start_date,
        end_date,
        action,
        table_name,
        changed_by,
      });
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to fetch audit logs', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/models', async (_req: Request, res: Response) => {
    try {
      const models: ModelInfo[] = await client.listModels();
      res.json(models);
    } catch (error: any) {
      logger.error('Failed to list models', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/teams', async (req: Request, res: Response) => {
    try {
      const tokenEntityRef = await resolveUserId(req, auth);
      const userId = tokenEntityRef
        ? toLiteLLMUserId(tokenEntityRef, userIdDomain)
        : (req.query.user_id as string | undefined);

      const userInfo = await getOrProvisionUser(
        client,
        tokenEntityRef,
        userId,
        provisioningEnabled,
        provisioningDefaults,
        roleConfigs,
        catalogClient,
        auth,
        logger,
      );

      if (!userInfo?.teams?.length) {
        res.json([]);
        return;
      }

      const teams = await Promise.all(
        userInfo.teams.map(teamId =>
          client.getTeamInfo(teamId).catch(err => {
            logger.warn(`Failed to fetch team ${teamId}: ${err.message}`);
            return null;
          }),
        ),
      );
      res.json(teams.filter(Boolean) as TeamInfo[]);
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      logger.error('Failed to fetch teams', error);
      res.status(500).json({ error: error.message });
    }
  });

  function requireTeamMgmt(res: Response): boolean {
    if (!teamMgmtEnabled) {
      res.status(403).json({
        error: 'Team management is disabled (requires permission.enabled and litellm.teamAdmin.group)',
      });
      return false;
    }
    return true;
  }

  function sendTeamError(err: any, res: Response): void {
    if (err instanceof LiteLLMUpstreamError) {
      res.status(err.status).json({
        error: err.message,
        ...(err.param ? { param: err.param } : {}),
      });
    } else {
      logger.error('Team operation failed', err);
      res.status(500).json({ error: err.message });
    }
  }

  router.post('/teams', async (req: Request, res: Response) => {
    if (!requireTeamMgmt(res)) return;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamCreatePermission,
      logger,
    });

    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const v = validateTeamWriteInput(req.body ?? {}, teamAdminCfg);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    const key = v.value.team_alias.trim().toLowerCase();
    const pending = teamCreateInFlight.get(key);
    if (pending) {
      logger.info(`Team creation already in flight for ${key} — joining`);
      try {
        const result = await pending;
        res.json(result);
      } catch (err: any) {
        sendTeamError(err, res);
      }
      return;
    }

    const payload = {
      team_alias: v.value.team_alias,
      models: v.value.models,
      ...(v.value.max_budget !== undefined && { max_budget: v.value.max_budget }),
      ...(v.value.budget_duration && { budget_duration: v.value.budget_duration }),
      ...(v.value.tpm_limit !== undefined && { tpm_limit: v.value.tpm_limit }),
      ...(v.value.rpm_limit !== undefined && { rpm_limit: v.value.rpm_limit }),
      metadata: {
        owning_group: teamAdminCfg.group,
        created_by_backstage_user: check.userEntityRef,
        created_via: 'backstage',
        created_at_iso: new Date().toISOString(),
      },
    };

    const createPromise = (async () => {
      const result = await client.createTeam(payload);
      logger.info({
        action: 'team.create',
        actor: check.userEntityRef,
        teamAlias: v.value.team_alias,
        owningGroup: teamAdminCfg.group,
      });
      return result;
    })();

    teamCreateInFlight.set(key, createPromise);
    try {
      const result = await createPromise;
      res.json(result);
    } catch (err: any) {
      sendTeamError(err, res);
    } finally {
      teamCreateInFlight.delete(key);
    }
  });

  router.patch('/teams/:teamId', async (req: Request, res: Response) => {
    if (!requireTeamMgmt(res)) return;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamManagePermission,
      logger,
    });

    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { teamId } = req.params;
    if (!teamId) {
      res.status(400).json({ error: 'teamId is required' });
      return;
    }

    let existing;
    try {
      existing = await client.getTeamInfo(teamId);
    } catch (err: any) {
      if (err instanceof LiteLLMUpstreamError && err.status === 404) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      sendTeamError(err, res);
      return;
    }

    const owningGroup = typeof existing.metadata?.owning_group === 'string' ? existing.metadata.owning_group : undefined;
    if (!owningGroup) {
      res.status(403).json({ error: 'This team is not managed by Backstage team admins and cannot be edited here' });
      return;
    }

    const owns = await isUserMemberOfGroup(check.userEntityRef, owningGroup, catalogClient, auth, logger);
    if (!owns) {
      res.status(403).json({ error: `Access denied: team is owned by ${owningGroup}` });
      return;
    }

    const v = validateTeamPatchInput(req.body ?? {}, teamAdminCfg);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    const payload = {
      team_id: teamId,
      ...v.value,
      metadata: {
        ...(existing.metadata ?? {}),
        updated_by_backstage_user: check.userEntityRef,
        updated_at_iso: new Date().toISOString(),
      },
    };

    try {
      const r = await client.updateTeam(payload);
      logger.info({
        action: 'team.update',
        actor: check.userEntityRef,
        teamId,
        owningGroup,
      });
      res.json(r);
    } catch (err: any) {
      sendTeamError(err, res);
    }
  });

  // Scoped listing for team admins: returns ONLY the teams whose
  // `metadata.owning_group` equals the configured admin group, so a team admin
  // can see and edit teams their group owns even when they are not a member.
  // This deliberately never returns a global team list. Registered before any
  // `/teams/:param` route so the literal path is not shadowed.
  router.get('/teams/managed', async (req: Request, res: Response) => {
    if (!requireTeamMgmt(res)) return;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamManagePermission,
      logger,
    });

    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    try {
      const all = await client.listTeams();
      // TODO(multi-group): when litellm.teamAdmin.group becomes a list, resolve
      // the caller's group set and filter with includes().
      const owned = all.filter(
        t =>
          typeof t.metadata?.owning_group === 'string' &&
          t.metadata.owning_group === teamAdminCfg.group,
      );
      res.json(owned);
    } catch (err) {
      sendTeamError(err, res);
    }
  });

  // ── Team member routes ──────────────────────────────────────────────────
  //
  // Shared preamble: team-mgmt enabled → assertTeamAdmin(members permission) →
  // load the team and enforce the owning-group object guard (same as PATCH
  // /teams/:id). Returns the resolved teamId + owningGroup, or null when a
  // response has already been sent.
  async function authorizeTeamMemberAction(
    req: Request,
    res: Response,
  ): Promise<
    | { teamId: string; owningGroup: string; actor: string }
    | null
  > {
    if (!requireTeamMgmt(res)) return null;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamMembersManagePermission,
      logger,
    });
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return null;
    }

    const { teamId } = req.params;
    if (!teamId) {
      res.status(400).json({ error: 'teamId is required' });
      return null;
    }

    let existing;
    try {
      existing = await client.getTeamInfo(teamId);
    } catch (err: any) {
      if (err instanceof LiteLLMUpstreamError && err.status === 404) {
        res.status(404).json({ error: 'Team not found' });
        return null;
      }
      sendTeamError(err, res);
      return null;
    }

    const owningGroup =
      typeof existing.metadata?.owning_group === 'string'
        ? existing.metadata.owning_group
        : undefined;
    if (!owningGroup) {
      res.status(403).json({
        error:
          'This team is not managed by Backstage team admins and cannot be edited here',
      });
      return null;
    }
    const owns = await isUserMemberOfGroup(
      check.userEntityRef,
      owningGroup,
      catalogClient,
      auth,
      logger,
    );
    if (!owns) {
      res
        .status(403)
        .json({ error: `Access denied: team is owned by ${owningGroup}` });
      return null;
    }

    return { teamId, owningGroup, actor: check.userEntityRef };
  }

  // Add a member to a team the caller's group owns. The member must (a) resolve
  // to a real User in the Backstage catalog and (b) exist in LiteLLM — we
  // provision them on the spot when auto-provisioning is enabled. Only the
  // 'user' team role can be assigned from Backstage.
  router.post(
    '/teams/:teamId/members',
    async (req: Request, res: Response) => {
      const authz = await authorizeTeamMemberAction(req, res);
      if (!authz) return;
      const { teamId, owningGroup, actor } = authz;

      const body = (req.body ?? {}) as {
        userEntityRef?: string;
        role?: string;
        maxBudgetInTeam?: number;
      };
      const userEntityRef = (body.userEntityRef ?? '').trim();
      if (!userEntityRef) {
        res.status(400).json({ error: 'userEntityRef is required' });
        return;
      }
      if (body.role !== undefined && body.role !== 'user') {
        res.status(400).json({
          error: "only the 'user' team role can be assigned from Backstage",
        });
        return;
      }
      let maxBudgetInTeam: number | undefined;
      if (body.maxBudgetInTeam !== undefined) {
        if (
          typeof body.maxBudgetInTeam !== 'number' ||
          !Number.isFinite(body.maxBudgetInTeam) ||
          body.maxBudgetInTeam <= 0
        ) {
          res
            .status(400)
            .json({ error: 'maxBudgetInTeam must be a positive number' });
          return;
        }
        maxBudgetInTeam = body.maxBudgetInTeam;
      }

      // (a) the member must be a real User in the Backstage catalog
      try {
        const { token } = await auth.getPluginRequestToken({
          onBehalfOf: await auth.getOwnServiceCredentials(),
          targetPluginId: 'catalog',
        });
        const entity = await catalogClient.getEntityByRef(userEntityRef, {
          token,
        });
        if (!entity || entity.kind !== 'User') {
          res.status(400).json({
            error: `${userEntityRef} is not a User in the Backstage catalog`,
          });
          return;
        }
      } catch (err: any) {
        logger.warn(
          `Catalog lookup failed for ${userEntityRef}: ${err.message}`,
        );
        res.status(400).json({
          error: `Could not verify ${userEntityRef} in the Backstage catalog`,
        });
        return;
      }

      // (b) the member must exist in LiteLLM — provision on the spot if enabled
      const litellmUserId = toLiteLLMUserId(userEntityRef, userIdDomain);
      try {
        await getOrProvisionUser(
          client,
          userEntityRef,
          litellmUserId,
          provisioningEnabled,
          provisioningDefaults,
          roleConfigs,
          catalogClient,
          auth,
          logger,
        );
      } catch (err: any) {
        if (err instanceof ProvisioningError) {
          res.status(err.status).json(err.body);
          return;
        }
        throw err;
      }

      try {
        await client.teamMemberAdd({
          team_id: teamId,
          user_id: litellmUserId,
          role: 'user',
          ...(maxBudgetInTeam !== undefined && {
            max_budget_in_team: maxBudgetInTeam,
          }),
        });
        logger.info({
          action: 'team.member.add',
          actor,
          teamId,
          member: litellmUserId,
          owningGroup,
        });
        const updated = await client.getTeamInfo(teamId);
        res.json(updated);
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

  // Remove a member from a team the caller's group owns. The member ref comes
  // from the `userEntityRef` query param (entity refs contain ':' and '/', so
  // they can't be a path segment). No catalog re-check on removal.
  router.delete(
    '/teams/:teamId/members',
    async (req: Request, res: Response) => {
      const authz = await authorizeTeamMemberAction(req, res);
      if (!authz) return;
      const { teamId, owningGroup, actor } = authz;

      const userEntityRef = String(req.query.userEntityRef ?? '').trim();
      if (!userEntityRef) {
        res
          .status(400)
          .json({ error: 'userEntityRef query parameter is required' });
        return;
      }
      const litellmUserId = toLiteLLMUserId(userEntityRef, userIdDomain);
      try {
        await client.teamMemberDelete({
          team_id: teamId,
          user_id: litellmUserId,
        });
        logger.info({
          action: 'team.member.remove',
          actor,
          teamId,
          member: litellmUserId,
          owningGroup,
        });
        const updated = await client.getTeamInfo(teamId);
        res.json(updated);
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

  router.get('/teams/:teamId/usage', async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }
      const usage: UsageMetrics = await client.getTeamUsage(
        teamId,
        start_date as string,
        end_date as string,
      );
      res.json(usage);
    } catch (error: any) {
      logger.error('Failed to fetch team usage', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }
      const tokenEntityRef = await resolveUserId(req, auth);
      const userId = tokenEntityRef
        ? toLiteLLMUserId(tokenEntityRef, userIdDomain)
        : (req.query.user_id as string | undefined);

      if (userId) {
        await getOrProvisionUser(
          client,
          tokenEntityRef,
          userId,
          provisioningEnabled,
          provisioningDefaults,
          roleConfigs,
          catalogClient,
          auth,
          logger,
        );
      }

      const usage: UsageMetrics = await client.getUsage(
        start_date as string,
        end_date as string,
        userId,
      );
      res.json(usage);
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      logger.error('Failed to fetch usage', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Bridge endpoints (CLI / Abby)
  //
  // Authenticated by a Keycloak access token (JWKS-verified), NOT by Backstage's
  // own auth. Lets CLI clients list/mint virtual keys without holding the master
  // key. Gated by litellm.bridge.enabled; the verifier needs litellm.bridge.issuer.
  const bridgeCfg = readBridgeConfig(config);
  let tokenVerifier: TokenVerifier | undefined = options.tokenVerifier;
  if (bridgeCfg.enabled && !tokenVerifier) {
    try {
      tokenVerifier = newDefaultVerifier(bridgeCfg);
    } catch (e) {
      logger.error(
        `LiteLLM bridge enabled but misconfigured: ${(e as Error).message}`,
      );
    }
  }

  if (bridgeCfg.enabled && tokenVerifier) {
    const requireClaims = async (req: Request): Promise<BridgeClaims> => {
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new BridgeAuthError('missing Bearer token');
      return tokenVerifier!.verify(token);
    };

    const handleBridgeError = (error: any, res: Response) => {
      if (error instanceof BridgeAuthError) {
        res.status(401).json({ error: 'unauthorized', hint: error.message });
        return;
      }
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      logger.error('Bridge request failed', error);
      res.status(500).json({ error: error.message });
    };

    router.get('/bridge/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', bridge: true, clientId: bridgeCfg.clientId });
    });

    router.get('/bridge/keys', async (req: Request, res: Response) => {
      try {
        const claims = await requireClaims(req);
        const keys = await bridgeListKeys(
          client,
          claims,
          provisioningEnabled,
          provisioningDefaults,
          logger,
          userIdDomain,
        );
        res.json(keys);
      } catch (error: any) {
        handleBridgeError(error, res);
      }
    });

    router.post('/bridge/keys', async (req: Request, res: Response) => {
      try {
        const claims = await requireClaims(req);
        const result = await bridgeGenerateKey(
          client,
          claims,
          provisioningEnabled,
          provisioningDefaults,
          logger,
          (req.body ?? {}) as Partial<GenerateKeyRequest>,
          userIdDomain,
        );
        res.json(result);
      } catch (error: any) {
        handleBridgeError(error, res);
      }
    });

    router.get('/bridge/models', async (req: Request, res: Response) => {
      try {
        await requireClaims(req); // authenticate only
        const models = await client.listModels();
        res.json(models);
      } catch (error: any) {
        handleBridgeError(error, res);
      }
    });
  } else if (bridgeCfg.enabled) {
    logger.warn(
      'litellm.bridge.enabled is true but no verifier could be built — bridge endpoints not mounted',
    );
  }

  return router;
}
