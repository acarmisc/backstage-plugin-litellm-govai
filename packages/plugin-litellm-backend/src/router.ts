import express, { Router, Request, Response, NextFunction } from 'express';
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
  BridgeIdentityError,
  BridgeClaims,
  TokenVerifier,
  bridgeListKeys,
  newDefaultVerifier,
  readBridgeConfig,
  resolveBridgeUserId,
} from './bridge';
import {
  litellmKeyCreatePermission,
  litellmKeyRevokePermission,
  litellmKeyManagePermission,
  litellmKeyResetSpendPermission,
  litellmKeyUnblockPermission,
  litellmAuditReadPermission,
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
  litellmTeamKnowledgebaseManagePermission,
  litellmTeamMcpManagePermission,
  litellmTeamDeletePermission,
  createGenerateKeyInputSchema,
  createUpdateKeyInputSchema,
  type KeyValidationConfig,
  type GenerateKeyInput,
  type UpdateKeyInput,
  DEFAULT_KEY_DURATIONS,
} from '@acarmisc/backstage-plugin-litellm-common';
import {
  createKeyForUser,
  KeyServiceError,
  type KeyCreateContext,
} from './services/keyService';
import {
  isTeamManagementEnabled,
  isObjectPermissionsEnabled,
  readTeamAdminConfig,
  assertTeamAdmin,
  validateTeamWriteInput,
  validateTeamPatchInput,
} from './teamAdmin';
import {
  readTeamBudgetVisibility,
  redactTeamBudget,
  redactTeamUsage,
} from './teamBudgetVisibility';
import { readOpencodeConfig } from './opencode';
import { sendError } from './errors';

export { ProvisioningError };

const teamCreateInFlight = new Map<string, Promise<unknown>>();

/** Backoff schedule for `withTeamFetchRetry` — 3 retries over ~1.3s total. */
const TEAM_FETCH_RETRY_DELAYS_MS = [100, 300, 900];

/**
 * Only 5xx (and network/timeout) failures are treated as transient — a 4xx
 * like "team not found" or "forbidden" is a deterministic answer from the
 * upstream and retrying it would just add latency for the same result.
 */
function isRetryableTeamFetchError(err: unknown): boolean {
  if (err instanceof LiteLLMUpstreamError) {
    return err.status >= 500;
  }
  return true;
}

/**
 * Retries a LiteLLM team-info fetch with the given backoff schedule.
 *
 * LiteLLM proxies are commonly run behind multiple replicas; a request can
 * land on a replica that hasn't yet caught up with a very recent write
 * (team create/update, membership change), or on one that is transiently
 * unhealthy. Both surface as a failed `getTeamInfo` call that would
 * otherwise be swallowed (e.g. GET /teams silently drops the team from the
 * response) or bubble up as a spurious 500/404 right after a write this
 * same request just made. A short retry smooths over that window without
 * masking a genuine, persistent failure.
 */
async function withTeamFetchRetry<T>(
  fn: () => Promise<T>,
  delaysMs: number[] = TEAM_FETCH_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delaysMs.length || !isRetryableTeamFetchError(err)) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

/**
 * Only loopback http://localhost:<port>/callback redirect URIs are accepted —
 * the OpenCode plugin runs its callback listener on 127.0.0.1. This
 * keeps the flow from being usable as an open redirect.
 */
function isValidRedirectUri(uri: string | undefined): boolean {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname === '/callback'
    );
  } catch {
    return false;
  }
}

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
  // snippets in the frontend. Only exposed if explicitly configured.
  // When unset, returned as null to the FE.
  const publicBaseUrl = config.getOptionalString('litellm.publicBaseUrl') ?? null;
  const client = options.client ?? new LiteLLMClient({ baseUrl, masterKey });
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
  };
  const generateKeyInputSchema = createGenerateKeyInputSchema(keyValidationConfig);
  const updateKeyInputSchema = createUpdateKeyInputSchema(keyValidationConfig);
  const teamMgmtEnabled = isTeamManagementEnabled(config);
  const objectPermsEnabled = isObjectPermissionsEnabled(config);
  const teamAdminCfg = readTeamAdminConfig(config);
  const teamBudgetVisibility = readTeamBudgetVisibility(config);
  const opencodeCfg = readOpencodeConfig(config);
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
  const requireUser = async (req: Request, res: Response, next: NextFunction) => {
    const tokenEntityRef = await resolveUserId(req, auth);
    if (!tokenEntityRef) {
      res.status(401).json({ error: 'A Backstage user credential is required' });
      return;
    }
    res.locals.tokenEntityRef = tokenEntityRef;
    res.locals.userId = toLiteLLMUserId(tokenEntityRef, userIdDomain);
    next();
  };
  router.use(['/user/info', '/keys', '/usage'], requireUser);

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', provisioning: provisioningEnabled });
  });

  // Exposes the public LiteLLM proxy URL so the frontend can build
  // ready-to-paste curl / OpenAI-SDK snippets for freshly generated keys.
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      baseUrl: publicBaseUrl,
      keyGeneration: { allowUnlimitedBudget, teamRequired },
      keyActions: { allowOwnerResetSpend },
      opencode: { enabled: opencodeCfg.enabled },
      teamManagement: {
        enabled: teamMgmtEnabled,
        maxBudgetCeiling: teamAdminCfg.maxBudgetCeiling,
        allowUnlimitedBudget: teamAdminCfg.allowUnlimitedBudget,
        objectPermissionsEnabled: objectPermsEnabled,
      },
      display: {
        hideTeamBudgetForMembers:
          teamBudgetVisibility.hideTeamBudgetForMembers,
        hideTeamBudgetForManagers:
          teamBudgetVisibility.hideTeamBudgetForManagers,
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
      sendError(res, error, logger, 'resolve provisioning preview');
    }
  });

  router.get('/user/info', async (_req: Request, res: Response) => {
    try {
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

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
      sendError(res, error, logger, 'fetch user info');
    }
  });

  router.get('/keys', async (_req: Request, res: Response) => {
    try {
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

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
      sendError(res, error, logger, 'list keys');
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
  ): Promise<{ tokenEntityRef: string; userId: string; key: VirtualKey }> {
    const tokenEntityRef = req.res!.locals.tokenEntityRef as string;
    const userId = req.res!.locals.userId as string;
    const ownKeys = await client.listKeys(userId);
    const key = ownKeys.find(k => (k.token ?? k.key) === keyId);
    if (!key) {
      throw Object.assign(new Error('Access denied: key does not belong to the caller'), {
        status: 403,
        body: { error: 'Access denied: key does not belong to the caller' },
      });
    }
    return { tokenEntityRef, userId, key };
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
      // ── Parse & validate input with strict schema ────────────────────────
      const parseResult = generateKeyInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessages = parseResult.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        res.status(400).json({
          error: 'Invalid request body',
          details: errorMessages,
        });
        return;
      }
      const input: GenerateKeyInput = parseResult.data;

      // ── Permission check ────────────────────────────────────────────────
      if (!(await assertPermission(req, litellmKeyCreatePermission))) {
        sendPermissionDenied(res, litellmKeyCreatePermission);
        return;
      }

      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const resolvedUserId = res.locals.userId as string;

      // ── Create key via unified service ──────────────────────────────────
      const keyCreateCtx: KeyCreateContext = {
        client,
        config: {
          allowUnlimitedBudget,
          teamRequired,
        },
        catalogClient,
        auth,
        logger,
        keyValidationConfig,
        provisioningEnabled,
        provisioningDefaults,
        roleConfigs,
        userIdDomain,
      };
      const result = await createKeyForUser(
        { tokenEntityRef, userId: resolvedUserId },
        input,
        keyCreateCtx,
      );
      res.json(result);
    } catch (error: any) {
      if (error instanceof KeyServiceError) {
        res.status(error.status).json(error.body);
        return;
      }
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      // LiteLLM's enterprise team-key hook silently overrides the requested
      // `duration` with the team's `metadata.team_member_key_duration` when a
      // team_id is set, before parsing it. A malformed value there 500s with
      // this exact message regardless of what we sent — surface that instead
      // of the opaque passthrough so it's actionable from the LiteLLM side.
      const teamId = (req.body as any)?.team_id;
      if (
        typeof error.message === 'string' &&
        error.message.includes('Invalid duration format') &&
        teamId
      ) {
        res.status(502).json({
          error:
            'LiteLLM rejected the key duration for this team. The team has a ' +
            '"Team Member Key Duration" set in LiteLLM that is not in a valid ' +
            '<number><unit> format (e.g. "30d") and overrides whatever duration ' +
            'is requested. Fix or clear it in LiteLLM under Teams → this team → ' +
            'Team Settings, then retry.',
          teamId,
        });
        return;
      }
      sendError(res, error, logger, 'generate key');
    }
  });

  // ── OpenCode SSO-connect ─────────────────────────────────────────────────
  //
  // Client side: the opencode-portal-auth plugin. Handshake contract (see
  // that package's README):
  //
  //   GET /opencode/connect?team=<id>&redirect_uri=http://localhost:<port>/callback
  //     → (SSO-authenticated) returns an HTML confirmation form (no state change)
  //
  //   POST /opencode/connect with form data (team, redirect_uri)
  //     → validates all conditions, rotates or generates a key
  //     → 302 redirect to {redirect_uri}?key=<plaintext-key>
  //
  // Mounted only when litellm.opencode.enabled is true. Key creation is
  // gated by the same litellmKeyCreatePermission as POST /keys/generate.
  if (opencodeCfg.enabled) {
    logger.info(
      `OpenCode connect endpoint enabled — duration=${opencodeCfg.keyDuration}, maxBudget=$${opencodeCfg.maxBudget}`,
    );

    // Helper to validate auth, permissions, redirect_uri, and team membership.
    // Reused by both GET and POST.
    // Returns null if validation fails (response already sent).
    // Returns an object with validated values if all checks pass.
    // Note: after successful validation, redirectUri is guaranteed to be a valid string.
    const validateOpenCodeRequest = async (
      req: Request,
      res: Response,
    ): Promise<
      | { tokenEntityRef: string; userId: string; userInfo: any; teamId: string | undefined; redirectUri: string }
      | null
    > => {
      const tokenEntityRef = await resolveUserId(req, auth);
      if (!tokenEntityRef) {
        res.status(401).json({ error: 'Authentication required' });
        return null;
      }

      // For GET, redirectUri is in query; for POST, it's in body.
      const redirectUriParam = (req.query.redirect_uri || req.body.redirect_uri) as string | undefined;
      if (!isValidRedirectUri(redirectUriParam)) {
        res.status(400).json({
          error: 'Invalid redirect_uri — expected http://localhost:<port>/callback',
        });
        return null;
      }
      // After isValidRedirectUri check, we know redirectUriParam is a valid string (! to tell TS).
      const redirectUri = redirectUriParam!;

      if (!(await assertPermission(req, litellmKeyCreatePermission))) {
        sendPermissionDenied(res, litellmKeyCreatePermission);
        return null;
      }

      const userId = toLiteLLMUserId(tokenEntityRef, userIdDomain);
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

      // Optional team binding: must be one of the user's own teams.
      const teamId = (req.query.team || req.body.team) as string | undefined;
      if (teamId) {
        const userTeams = userInfo?.teams ?? [];
        if (!userTeams.includes(teamId)) {
          res.status(403).json({
            error: 'Access denied: team is not one of your teams',
            team: teamId,
          });
          return null;
        }
      } else if (opencodeCfg.requireTeam) {
        res.status(400).json({ error: 'A team is required for this connection' });
        return null;
      }

      return { tokenEntityRef, userId, userInfo, teamId, redirectUri };
    };

    router.get('/opencode/connect', async (req: Request, res: Response) => {
      try {
        const validation = await validateOpenCodeRequest(req, res);
        if (!validation) return;

        const { teamId, redirectUri } = validation;

        // GET returns an HTML form without changing state (no key mint/rotate yet).
        // The form allows the user to review the connection and submit to POST.
        const teamDisplay = teamId ? ` for team ${escapeHtml(teamId)}` : '';
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCode Connect</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; background: #f5f5f5; }
    .container { max-width: 400px; margin: 0 auto; background: white; border-radius: 8px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { margin-top: 0; color: #333; font-size: 1.5rem; }
    p { color: #666; line-height: 1.5; }
    button { background: #0066cc; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #0052a3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connect to OpenCode</h1>
    <p>This will create or rotate your OpenCode API key${teamDisplay}.</p>
    <form method="POST">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      ${teamId ? `<input type="hidden" name="team" value="${escapeHtml(teamId)}">` : ''}
      <button type="submit">Connect</button>
    </form>
  </div>
</body>
</html>`;

        res.set('Cache-Control', 'no-store');
        res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
      } catch (error: any) {
        if (error instanceof ProvisioningError) {
          res.status(error.status).json(error.body);
          return;
        }
        sendError(res, error, logger, 'OpenCode connect GET');
      }
    });

    router.post('/opencode/connect', async (req: Request, res: Response) => {
      try {
        const validation = await validateOpenCodeRequest(req, res);
        if (!validation) return;

        const { tokenEntityRef, userId, teamId, redirectUri } = validation;

        // Alias is stable per user+team so re-connecting rotates the same
        // logical key slot. Check if an existing key exists for this slot.
        const alias = teamId ? `opencode-${userId}-${teamId}` : `opencode-${userId}`;
        const existing = await client
          .listKeys(userId)
          .catch(() => [] as VirtualKey[]);

        // Find a healthy existing key (not blocked).
        const reusable = existing.find(
          k => k.key_alias === alias && !k.blocked && k.user_id === userId,
        );

        let key: string;
        let rotated = false;

        if (reusable?.token ?? reusable?.key) {
          // Rotate the existing key by regenerating it.
          const keyHashOrId = reusable.token ?? reusable.key!;
          const result = await client.regenerateKey(keyHashOrId);
          if (!result.key) {
            res.status(502).json({ error: 'LiteLLM returned no key material on regenerate' });
            return;
          }
          key = result.key;
          rotated = true;
        } else {
          // Generate a new key.
          const profile = await resolveUserProfile(
            tokenEntityRef,
            catalogClient,
            auth,
            logger,
          );
          const result = await client.generateKey({
            alias,
            duration: opencodeCfg.keyDuration,
            max_budget: opencodeCfg.maxBudget,
            team_id: teamId,
            metadata: {
              ...opencodeCfg.metadata,
              created_via: 'opencode-connect',
              created_by_backstage_user: tokenEntityRef,
              ...(profile.email && { created_by_email: profile.email }),
              ...(teamId && { opencode_team: teamId }),
            },
            user_id: userId,
          } as GenerateKeyRequest);
          if (!result.key) {
            res.status(502).json({ error: 'LiteLLM returned no key material' });
            return;
          }
          key = result.key;
        }

        const url = new URL(redirectUri);
        url.searchParams.set('key', key);
        if (teamId) url.searchParams.set('team', teamId);
        logger.info({
          action: 'opencode.connect',
          userId,
          team: teamId ?? null,
          rotated,
        });
        res.redirect(302, url.href);
      } catch (error: any) {
        if (error instanceof ProvisioningError) {
          res.status(error.status).json(error.body);
          return;
        }
        sendError(res, error, logger, 'OpenCode connect POST');
      }
    });
  }

  /**
   * Escape HTML special characters in strings to prevent XSS.
   * Used when interpolating team IDs and redirect URIs into the confirmation form.
   */
  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, c => map[c]);
  }

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

      const { tokenEntityRef, userId, key } = await authorizeKeyAction(req, keyId);

      // ── Parse and validate request with strict schema ──────────────────────
      // This will reject unknown fields including team_id, user_id, spend, blocked, key, budget_duration.
      let input: UpdateKeyInput;
      try {
        input = updateKeyInputSchema.parse(req.body);
      } catch (error: any) {
        res.status(400).json({
          error: error.errors?.[0]?.message || 'Invalid request',
          details: error.errors,
        });
        return;
      }

      // ── Enforce budget rules ──────────────────────────────────────────────
      // allowUnlimitedBudget===false rejects max_budget:null explicitly sent
      if (!allowUnlimitedBudget && input.max_budget === null) {
        res.status(400).json({
          error: 'max_budget cannot be null when unlimited budgets are not allowed',
        });
        return;
      }

      // ── Validate models are subset of allowed using the key's team_id ─────
      if (input.models && input.models.length > 0) {
        let allowedModels: string[] = [];
        if (key.team_id) {
          // Fetch team info to get its allowed models.
          // Fail closed: if the team can't be fetched, the error propagates.
          try {
            const teamInfo = await client.getTeamInfo(key.team_id);
            allowedModels = teamInfo?.models ?? [];
          } catch (err) {
            sendError(res, err, logger, 'fetch team info for model validation');
            return;
          }
        } else {
          // Use user's models if no team
          const userInfo = await client.getUserInfo(userId);
          allowedModels = userInfo?.models ?? [];
        }

        // Only enforce if the allowedModels list is non-empty (non-empty = restricted)
        if (allowedModels.length > 0) {
          const disallowed = input.models.filter(m => !allowedModels.includes(m));
          if (disallowed.length > 0) {
            res.status(400).json({
              error: 'One or more requested models are not allowed',
              disallowed_models: disallowed,
            });
            return;
          }
        }
      }

      // ── Build upstream request EXPLICITLY from parsed fields ──────────────
      // Never spread the raw body; only include fields we've explicitly validated.
      const upstreamRequest: UpdateKeyRequest = {
        key: keyId,
      };

      if (input.key_alias !== undefined) {
        upstreamRequest.key_alias = input.key_alias;
      }
      if (input.models !== undefined) {
        upstreamRequest.models = input.models;
      }
      if (input.max_budget !== undefined) {
        // max_budget from input can be null (unlimited) or a number
        upstreamRequest.max_budget = input.max_budget;
      }
      if (input.tpm_limit !== undefined) {
        upstreamRequest.tpm_limit = input.tpm_limit;
      }
      if (input.rpm_limit !== undefined) {
        upstreamRequest.rpm_limit = input.rpm_limit;
      }

      const result = await client.updateKey(upstreamRequest);
      logger.info({ action: 'key.update', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json(result);
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'update key');
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
      sendError(res, error, logger, 'delete key');
    }
  });

  router.post('/keys/:keyId/block', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef, key } = await authorizeKeyAction(req, keyId);

      // Record metadata: who blocked this key and when
      const updatedMetadata = {
        ...(key.metadata ?? {}),
        blocked_by: tokenEntityRef,
        blocked_at: new Date().toISOString(),
      };

      await client.blockKey(keyId);
      // Also update the key's metadata to record blocked_by and blocked_at
      await client.updateKey({
        key: keyId,
        metadata: updatedMetadata,
      });

      logger.info({ action: 'key.block', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'block key');
    }
  });

  router.post('/keys/:keyId/unblock', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      const { tokenEntityRef, key } = await authorizeKeyAction(req, keyId);

      // Check if the key can be unblocked:
      // - Owner can unblock a self-blocked key (metadata.blocked_by === tokenEntityRef)
      // - Otherwise require the unblock permission
      const isOwnerUnblockingOwnBlock = key.metadata?.blocked_by === tokenEntityRef;

      if (!isOwnerUnblockingOwnBlock) {
        if (!(await assertPermission(req, litellmKeyUnblockPermission))) {
          sendPermissionDenied(res, litellmKeyUnblockPermission);
          return;
        }
      }

      await client.unblockKey(keyId);

      // Clear the blocked_by metadata on unblock
      const updatedMetadata = {
        ...(key.metadata ?? {}),
      };
      delete updatedMetadata.blocked_by;
      delete updatedMetadata.blocked_at;

      await client.updateKey({
        key: keyId,
        metadata: updatedMetadata,
      });

      logger.info({ action: 'key.unblock', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'unblock key');
    }
  });

  router.post('/keys/:keyId/reset_spend', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      // Fail closed: check the config flag first — if false, always deny even with an allow-all permission
      if (!allowOwnerResetSpend) {
        res.status(403).json({
          error: 'Reset spend is not allowed. Contact your administrator to enable this action.',
        });
        return;
      }

      // Then check permissions
      if (!(await assertPermission(req, litellmKeyResetSpendPermission))) {
        sendPermissionDenied(res, litellmKeyResetSpendPermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.resetKeySpend(keyId);
      logger.info({ action: 'key.reset_spend', userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: any) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'reset key spend');
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
      sendError(res, error, logger, 'fetch audit logs');
    }
  });

  router.get('/models', async (_req: Request, res: Response) => {
    try {
      const models: ModelInfo[] = await client.listModels();
      res.json(models);
    } catch (error: any) {
      sendError(res, error, logger, 'list models');
    }
  });

  router.get('/teams', requireUser, async (_req: Request, res: Response) => {
    try {
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

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
          withTeamFetchRetry(() => client.getTeamInfo(teamId)).catch(err => {
            logger.warn(`Failed to fetch team ${teamId} after retries: ${err.message}`);
            return null;
          }),
        ),
      );
      const list = teams.filter(Boolean) as TeamInfo[];
      // Member surface: strip dollar amounts when the operator hides them
      // from members. Managers who need the numbers use /teams/managed.
      res.json(
        teamBudgetVisibility.hideTeamBudgetForMembers
          ? list.map(redactTeamBudget)
          : list,
      );
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch teams');
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

  function requireObjectPerms(res: Response): boolean {
    if (!requireTeamMgmt(res)) return false;
    if (!objectPermsEnabled) {
      res.status(403).json({
        error:
          'Knowledge-base / MCP management is disabled (set litellm.teamAdmin.objectPermissions.enabled: true, with a permission policy and the allowlists in place)',
      });
      return false;
    }
    return true;
  }

  function sendTeamError(err: any, res: Response): void {
    sendError(res, err, logger, 'team operation');
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
      // Manager surface: redact dollars when hidden even from managers.
      res.json(
        teamBudgetVisibility.hideTeamBudgetForManagers
          ? redactTeamBudget(result as TeamInfo)
          : result,
      );
    } catch (err: any) {
      sendTeamError(err, res);
    } finally {
      teamCreateInFlight.delete(key);
    }
  });

  router.patch('/teams/:teamId', async (req: Request, res: Response) => {
    const authz = await authorizeTeamSubresource(
      req,
      res,
      litellmTeamManagePermission,
    );
    if (!authz) return;
    const { teamId, owningGroup, actor, team: existing } = authz;

    const v = validateTeamPatchInput(req.body ?? {}, teamAdminCfg);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    // Optimistic-concurrency guard (opt-in): when the client sends the
    // `expectedUpdatedAtIso` it based its edit on, reject if the stored value
    // has moved on — a concurrent edit landed in between. Callers that don't
    // send it are unaffected (last-writer-wins, as before).
    const expected = (req.body ?? {}).expectedUpdatedAtIso as
      | string
      | undefined;
    if (
      expected !== undefined &&
      expected !== (existing.metadata?.updated_at_iso as string | undefined)
    ) {
      res.status(409).json({
        error:
          'This team was modified since you loaded it. Reload and re-apply your change.',
      });
      return;
    }

    const payload = {
      team_id: teamId,
      ...v.value,
      metadata: {
        ...(existing.metadata ?? {}),
        updated_by_backstage_user: actor,
        updated_at_iso: new Date().toISOString(),
      },
    };

    try {
      const r = await client.updateTeam(payload);
      logger.info({
        action: 'team.update',
        actor,
        teamId,
        owningGroup,
      });
      res.json(
        teamBudgetVisibility.hideTeamBudgetForManagers
          ? redactTeamBudget(r as TeamInfo)
          : r,
      );
    } catch (err: any) {
      sendTeamError(err, res);
    }
  });

  // Delete a team the caller's group owns. Gated by litellm.teamAdmin.allowTeamDelete
  // (default false — deletion is destructive: it orphans keys and revokes access
  // for every member). Refuses when the team id is referenced by provisioning
  // config unless ?force=true. Prefer blocking a team over deleting it.
  router.delete('/teams/:teamId', async (req: Request, res: Response) => {
    const authz = await authorizeTeamSubresource(
      req,
      res,
      litellmTeamDeletePermission,
    );
    if (!authz) return;
    const { teamId, owningGroup, actor } = authz;

    if (!teamAdminCfg.allowTeamDelete) {
      res.status(403).json({
        error:
          'Team deletion is disabled (set litellm.teamAdmin.allowTeamDelete: true). Block the team instead.',
      });
      return;
    }

    const provisioningRefs = [
      ...provisioningDefaults.teams,
      ...roleConfigs.flatMap(r => r.teams ?? []),
    ];
    const force = String(req.query.force ?? '') === 'true';
    if (provisioningRefs.includes(teamId) && !force) {
      res.status(409).json({
        error: `Team ${teamId} is referenced by litellm.provisioning config; deleting it will break user provisioning. Re-send with ?force=true to override.`,
      });
      return;
    }

    try {
      await client.deleteTeam(teamId);
      logger.info({ action: 'team.delete', actor, teamId, owningGroup, force });
      res.json({ success: true });
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
      // Manager surface: strip dollar amounts when hidden even from managers.
      res.json(
        teamBudgetVisibility.hideTeamBudgetForManagers
          ? owned.map(redactTeamBudget)
          : owned,
      );
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
  // Shared preamble for a team sub-resource mutation (members, knowledge bases,
  // MCP servers): team-mgmt enabled → assertTeamAdmin(<the given permission>) →
  // load the team and enforce the owning-group object guard. Returns the
  // resolved teamId + owningGroup + actor, or null when a response was sent.
  async function authorizeTeamSubresource(
    req: Request,
    res: Response,
    permission: BasicPermission,
  ): Promise<
    | { teamId: string; owningGroup: string; actor: string; team: TeamInfo }
    | null
  > {
    if (!requireTeamMgmt(res)) return null;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission,
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
      existing = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
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

    return { teamId, owningGroup, actor: check.userEntityRef, team: existing };
  }

  // Add a member to a team the caller's group owns. The member must (a) resolve
  // to a real User in the Backstage catalog and (b) exist in LiteLLM — we
  // provision them on the spot when auto-provisioning is enabled. Only the
  // 'user' team role can be assigned from Backstage.
  router.post(
    '/teams/:teamId/members',
    async (req: Request, res: Response) => {
      const authz = await authorizeTeamSubresource(req, res, litellmTeamMembersManagePermission);
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
        const updated = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
        res.json(
          teamBudgetVisibility.hideTeamBudgetForManagers
            ? redactTeamBudget(updated as TeamInfo)
            : updated,
        );
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
      const authz = await authorizeTeamSubresource(req, res, litellmTeamMembersManagePermission);
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
        const updated = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
        res.json(
          teamBudgetVisibility.hideTeamBudgetForManagers
            ? redactTeamBudget(updated as TeamInfo)
            : updated,
        );
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

  // ── Knowledge-base (vector store) management ────────────────────────────
  //
  // Attaching a vector store to a team exposes its documents to every team
  // key. Team admins may only reference stores that the operator has
  // allowlisted in litellm.teamAdmin.allowedVectorStores — anything outside
  // the allowlist is rejected, never silently dropped.

  // The vector stores a team admin is allowed to attach (allowlist ∩ proxy).
  router.get('/vector-stores', async (req: Request, res: Response) => {
    if (!requireObjectPerms(res)) return;
    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamKnowledgebaseManagePermission,
      logger,
    });
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const allowed = new Set(teamAdminCfg.allowedVectorStores);
    try {
      const all = await client.listVectorStores();
      res.json(all.filter(s => allowed.has(s.id) || (s.name && allowed.has(s.name))));
    } catch (err: any) {
      sendTeamError(err, res);
    }
  });

  // Replace the set of knowledge bases attached to a team the caller's group
  // owns. Body: { vector_stores: string[] }. Every id must be in the
  // allowlist. The other object_permission facets (mcp_servers) are preserved.
  router.put(
    '/teams/:teamId/knowledge-bases',
    async (req: Request, res: Response) => {
      if (!requireObjectPerms(res)) return;
      const authz = await authorizeTeamSubresource(
        req,
        res,
        litellmTeamKnowledgebaseManagePermission,
      );
      if (!authz) return;
      const { teamId, owningGroup, actor, team } = authz;

      const requested = (req.body?.vector_stores ?? []) as unknown;
      if (
        !Array.isArray(requested) ||
        !requested.every(v => typeof v === 'string')
      ) {
        res
          .status(400)
          .json({ error: 'vector_stores must be an array of strings' });
        return;
      }
      const allowed = new Set(teamAdminCfg.allowedVectorStores);
      const offenders = requested.filter(v => !allowed.has(v));
      if (offenders.length) {
        res.status(400).json({
          error: `vector store(s) not in the allowed set for team admins: ${offenders.join(
            ', ',
          )}`,
        });
        return;
      }

      const objectPermission = {
        ...(team.object_permission ?? {}),
        vector_stores: requested as string[],
      };
      try {
        const updated = await client.updateTeam({
          team_id: teamId,
          object_permission: objectPermission,
          // /team/update replaces metadata wholesale — re-send the merged
          // object so owning_group / created_* survive and the change is
          // attributed.
          metadata: {
            ...(team.metadata ?? {}),
            updated_by_backstage_user: actor,
            updated_at_iso: new Date().toISOString(),
          },
        });
        logger.info({
          action: 'team.knowledgebase.set',
          actor,
          teamId,
          owningGroup,
          vector_stores: requested,
        });
        res.json(
          teamBudgetVisibility.hideTeamBudgetForManagers
            ? redactTeamBudget(updated as TeamInfo)
            : updated,
        );
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

  // ── MCP server management ──────────────────────────────────────────────
  //
  // Attaching an MCP server to a team grants every team key the ability to
  // invoke that server's tools through the model. Same allowlist + hard-reject
  // discipline as knowledge bases, plus a structured audit event on every
  // change so attaches are always attributable.

  router.get('/mcp-servers', async (req: Request, res: Response) => {
    if (!requireObjectPerms(res)) return;
    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamMcpManagePermission,
      logger,
    });
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const allowed = new Set(teamAdminCfg.allowedMcpServers);
    try {
      const all = await client.listMcpServers();
      res.json(all.filter(s => allowed.has(s.id) || (s.name && allowed.has(s.name))));
    } catch (err: any) {
      sendTeamError(err, res);
    }
  });

  // Replace the set of MCP servers attached to a team the caller's group owns.
  // Body: { mcp_servers: string[] }. Every id must be allowlisted. The
  // vector_stores facet of object_permission is preserved.
  router.put(
    '/teams/:teamId/mcp-servers',
    async (req: Request, res: Response) => {
      if (!requireObjectPerms(res)) return;
      const authz = await authorizeTeamSubresource(
        req,
        res,
        litellmTeamMcpManagePermission,
      );
      if (!authz) return;
      const { teamId, owningGroup, actor, team } = authz;

      const requested = (req.body?.mcp_servers ?? []) as unknown;
      if (
        !Array.isArray(requested) ||
        !requested.every(v => typeof v === 'string')
      ) {
        res
          .status(400)
          .json({ error: 'mcp_servers must be an array of strings' });
        return;
      }
      const allowed = new Set(teamAdminCfg.allowedMcpServers);
      const offenders = requested.filter(v => !allowed.has(v));
      if (offenders.length) {
        res.status(400).json({
          error: `MCP server(s) not in the allowed set for team admins: ${offenders.join(
            ', ',
          )}`,
        });
        return;
      }

      const before = team.object_permission?.mcp_servers ?? [];
      const objectPermission = {
        ...(team.object_permission ?? {}),
        mcp_servers: requested as string[],
      };
      try {
        const updated = await client.updateTeam({
          team_id: teamId,
          object_permission: objectPermission,
          // /team/update replaces metadata wholesale — re-send the merged
          // object so owning_group / created_* survive and the change is
          // attributed.
          metadata: {
            ...(team.metadata ?? {}),
            updated_by_backstage_user: actor,
            updated_at_iso: new Date().toISOString(),
          },
        });
        logger.info({
          action: 'team.mcp.set',
          actor,
          teamId,
          owningGroup,
          before,
          after: requested,
        });
        res.json(
          teamBudgetVisibility.hideTeamBudgetForManagers
            ? redactTeamBudget(updated as TeamInfo)
            : updated,
        );
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

  router.get('/teams/:teamId/usage', requireUser, async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }

      // Authorize: member of the team OR a team manager
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

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

      // Check membership: user must be in the team OR be a team manager
      const isMember = userInfo?.teams?.includes(teamId) ?? false;
      let isManager = false;
      if (teamAdminCfg.group) {
        try {
          isManager = await isUserMemberOfGroup(
            tokenEntityRef,
            teamAdminCfg.group,
            catalogClient,
            auth,
            logger,
          );
        } catch (err: any) {
          logger.warn(`Team-manager check failed: ${err.message}`);
        }
      }

      if (!isMember && !isManager) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const usage: UsageMetrics = await client.getTeamUsage(
        teamId,
        start_date as string,
        end_date as string,
      );
      // Spend figures would let a client derive a hidden budget
      // (budget = spend / pct), so they follow the same hiding flags.
      // Which flag applies depends on whether the caller is a team manager;
      // catalog failures fail closed to the member rule.
      let hide = teamBudgetVisibility.hideTeamBudgetForMembers;
      if (isManager) {
        hide = teamBudgetVisibility.hideTeamBudgetForManagers;
      }
      res.json(hide ? redactTeamUsage(usage) : usage);
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch team usage');
    }
  });

  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

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
      sendError(res, error, logger, 'fetch usage');
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
        // Log the jose error details server-side, send opaque 401 to client
        logger.warn(`Bridge auth error: ${error.message}`);
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      if (error instanceof BridgeIdentityError) {
        res.status(403).json({ error: 'forbidden', detail: error.message });
        return;
      }
      if (error instanceof KeyServiceError) {
        res.status(error.status).json(error.body);
        return;
      }
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'bridge request');
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

        // ── Parse & validate input with strict schema ────────────────────────
        const parseResult = generateKeyInputSchema.safeParse(req.body);
        if (!parseResult.success) {
          const errorMessages = parseResult.error.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
          res.status(400).json({
            error: 'Invalid request body',
            details: errorMessages,
          });
          return;
        }
        const input: GenerateKeyInput = parseResult.data;

        // ── Resolve user identity from verified claims ───────────────────────
        const userId = resolveBridgeUserId(claims, userIdDomain);

        // ── Create key via unified service ──────────────────────────────────
        const keyCreateCtx: KeyCreateContext = {
          client,
          config: {
            allowUnlimitedBudget,
            teamRequired,
          },
          // Bridge does not have Backstage catalogClient/auth
          // so provisioning from JWT claims only (no Backstage profile enrichment)
          catalogClient: undefined,
          auth: undefined,
          logger,
          keyValidationConfig,
          provisioningEnabled,
          provisioningDefaults,
          roleConfigs,
          userIdDomain,
        };
        const result = await createKeyForUser(
          { userId },
          input,
          keyCreateCtx,
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
