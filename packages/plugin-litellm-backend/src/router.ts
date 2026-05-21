import express, { Router, Request, Response } from 'express';
import { Config } from '@backstage/config';
import { AuthService, DiscoveryService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient } from './client';
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
  resolveUserProfile,
  getOrProvisionUser,
  readProvisioningDefaults,
  readRoleConfigs,
  ProvisioningError,
} from './provisioning';

export { ProvisioningError };

export interface RouterOptions {
  config: Config;
  logger: any;
  auth: AuthService;
  discovery: DiscoveryService;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { config, logger, auth, discovery } = options;

  const baseUrl = config.getString('litellm.baseUrl');
  const masterKey = config.getString('litellm.masterKey');
  const userIdDomain = config.getOptionalString('litellm.userIdDomain');
  const client = new LiteLLMClient({ baseUrl, masterKey });
  const { enabled: provisioningEnabled, defaults: provisioningDefaults } =
    readProvisioningDefaults(config);
  const roleConfigs = readRoleConfigs(config);
  const catalogClient = new CatalogClient({ discoveryApi: discovery });

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

  const router = Router();
  // JSON body parser. Without this, every POST/PUT endpoint sees an empty
  // req.body. Backstage's httpRouter does not apply a body parser at the
  // plugin-router level, so each plugin must attach its own.
  router.use(express.json());

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', provisioning: provisioningEnabled });
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
      res.json(userInfo);
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

  router.post('/keys/generate', async (req: Request, res: Response) => {
    try {
      // Only alias + max_budget are required. An empty models array is
      // intentional — in LiteLLM `models: []` means "all models the user
      // can access" which is the desired default. Forcing a selection
      // up front is too restrictive for the common case.
      const body = (req.body ?? {}) as GenerateKeyRequest;
      const missing: string[] = [];
      if (!body.alias?.trim()) missing.push('alias');
      if (typeof body.max_budget !== 'number' || body.max_budget <= 0) {
        missing.push('max_budget (positive number)');
      }
      if (missing.length) {
        res.status(400).json({
          error: 'Missing required fields',
          hint: `Required: ${missing.join(', ')}`,
        });
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
      res.json(result);
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
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
      const request: UpdateKeyRequest = { ...req.body, key: keyId };
      const result = await client.updateKey(request);
      res.json(result);
    } catch (error: any) {
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
      await client.deleteKeys({ keys: [keyId] });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to delete key', error);
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
      const { start_date, end_date, group_by } = req.query;
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
        group_by as string | undefined,
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

  return router;
}
