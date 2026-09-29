import { Router, Request, Response } from 'express';
import { Config } from '@backstage/config';
import { ProvisioningError } from '../provisioning';
import {
  BridgeAuthError,
  BridgeIdentityError,
  BridgeClaims,
  TokenVerifier,
  bridgeListKeys,
  newDefaultVerifier,
  readBridgeConfig,
  resolveBridgeUserId,
} from '../bridge';
import { type GenerateKeyInput } from '@acarmisc/backstage-plugin-litellm-common';
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

}
