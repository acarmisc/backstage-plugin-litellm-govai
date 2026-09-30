import { Router, Request, Response } from 'express';
import { Config } from '@backstage/config';
import { ProvisioningError } from '../provisioning';
import {
  BridgeAuthError,
  BridgeIdentityError,
  BridgeClaims,
  TokenVerifier,
  bridgeListKeys,
  getOrProvisionUserFromClaims,
  newDefaultVerifier,
  readBridgeConfig,
  resolveBridgeUserId,
  type BridgeIdentityOptions,
} from '../bridge';
import { isModelAllowed, ALL_PROXY_MODELS, type GenerateKeyInput } from '@acarmisc/backstage-plugin-litellm-common';
import { createKeyForUser, KeyServiceError, type KeyCreateContext } from '../services/keyService';
import { sendError } from '../errors';
import { createGenerateKeyInputSchema } from '@acarmisc/backstage-plugin-litellm-common';
import type { RouterContext } from './context';

export function registerBridgeRoutes(router: Router, ctx: RouterContext, bridgeOpts: { config: Config; tokenVerifier?: TokenVerifier }): void {
  const {
    client,
    logger,
    userIdDomain,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
    allowUnlimitedBudget,
    teamRequired,
    keyValidationConfig,
  } = ctx;
  const { config } = bridgeOpts;
  const generateKeyInputSchema = createGenerateKeyInputSchema(ctx.keyValidationConfig);

  // ---------------------------------------------------------------------------
  // Bridge endpoints (CLI / Abby)
  //
  // Authenticated by a Keycloak access token (JWKS-verified), NOT by Backstage's
  // own auth. Lets CLI clients list/mint virtual keys without holding the master
  // key. Gated by litellm.bridge.enabled; the verifier needs litellm.bridge.issuer.
  const bridgeCfg = readBridgeConfig(config);
  // Same userIdDomain rule as the UI; the trusted email domains gate who may use the bridge.
  const bridgeIdentity: BridgeIdentityOptions = {
    userIdDomain,
    trustedEmailDomains: bridgeCfg.allowedEmailDomains,
  };
  let tokenVerifier: TokenVerifier | undefined = bridgeOpts.tokenVerifier;
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
    // Capture tokenVerifier in the closure to avoid non-null assertion
    const verifier = tokenVerifier;
    const requireClaims = async (req: Request): Promise<BridgeClaims> => {
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new BridgeAuthError('missing Bearer token');
      return verifier.verify(token);
    };

    const handleBridgeError = (error: unknown, res: Response) => {
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
          bridgeIdentity,
        );
        res.json(keys);
      } catch (error: unknown) {
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

        // CLI clients don't know the budget policy. When unlimited budgets are
        // not allowed and the caller sent no max_budget, fall back to the
        // provisioning default instead of rejecting the mint. An explicit
        // value (including null) is left alone and validated as usual.
        if (!allowUnlimitedBudget && input.max_budget === undefined) {
          input.max_budget = provisioningDefaults.maxBudget;
        }

        // ── Resolve user identity from verified claims ───────────────────────
        const userId = resolveBridgeUserId(claims, bridgeIdentity);

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
      } catch (error: unknown) {
        handleBridgeError(error, res);
      }
    });

    // Caller's LiteLLM identity: user id + team memberships. Lets CLI clients
    // offer a team picker and mint keys under a valid team.
    router.get('/bridge/user/info', async (req: Request, res: Response) => {
      try {
        const claims = await requireClaims(req);
        const user = await getOrProvisionUserFromClaims(
          client,
          claims,
          provisioningEnabled,
          provisioningDefaults,
          logger,
          bridgeIdentity,
        );

        // Enrich team list with metadata (display names, etc.)
        const teamIds = user.teams ?? [];
        const teamMetadata: Array<{ id: string; name?: string }> = [];
        for (const teamId of teamIds) {
          try {
            const teamInfo = await client.getTeamInfo(teamId);
            teamMetadata.push({
              id: teamId,
              name: teamInfo.team_alias || teamId, // Use alias as display name, fallback to ID
            });
          } catch (e) {
            // If we can't fetch team info, just use the ID
            logger.debug(`Could not fetch team info for ${teamId}: ${(e as Error).message}`);
            teamMetadata.push({ id: teamId });
          }
        }

        res.json({ user_id: user.user_id, teams: teamIds, team_metadata: teamMetadata });
      } catch (error: unknown) {
        handleBridgeError(error, res);
      }
    });

    // Model catalogue. With ?team_id=X the list is narrowed to the models the
    // team may use (its `models` plus access groups); the caller must belong
    // to that team. Without it the full catalogue is returned, as before.
    router.get('/bridge/models', async (req: Request, res: Response) => {
      try {
        const claims = await requireClaims(req);
        const teamId = typeof req.query.team_id === 'string' ? req.query.team_id : '';
        const models = await client.listModels();
        if (!teamId) {
          res.json(models);
          return;
        }
        const user = await getOrProvisionUserFromClaims(
          client,
          claims,
          provisioningEnabled,
          provisioningDefaults,
          logger,
          bridgeIdentity,
        );
        if (!(user.teams ?? []).includes(teamId)) {
          res.status(403).json({ error: 'Access denied: team is not one of your teams', team_id: teamId });
          return;
        }
        const team = await client.getTeamInfo(teamId);
        const allowed = team.models;
        if (!allowed || allowed.length === 0 || allowed.includes(ALL_PROXY_MODELS)) {
          res.json(models);
          return;
        }
        res.json(models.filter(m => isModelAllowed(m, allowed)));
      } catch (error: unknown) {
        handleBridgeError(error, res);
      }
    });
  } else if (bridgeCfg.enabled) {
    logger.warn(
      'litellm.bridge.enabled is true but no verifier could be built — bridge endpoints not mounted',
    );
  }

}
