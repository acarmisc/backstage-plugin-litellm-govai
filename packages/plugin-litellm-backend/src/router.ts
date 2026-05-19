import { Router, Request, Response } from 'express';
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
  const { enabled: provisioningEnabled, defaults: provisioningDefaults } = readProvisioningDefaults(config);
  const roleConfigs = readRoleConfigs(config);
  const catalogClient = new CatalogClient({ discoveryApi: discovery });

  if (provisioningEnabled) {
    logger.info(
      `LiteLLM auto-provisioning enabled — defaults: budget=$${provisioningDefaults.maxBudget}/${provisioningDefaults.budgetDuration}, models=${provisioningDefaults.models.length ? provisioningDefaults.models.join(',') : 'all'}, teams=[${provisioningDefaults.teams.join(',')}]`,
    );
  }

  const router = Router();

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
      const tokenEntityRef = await resolveUserId(req, auth);
      const resolvedUserId = tokenEntityRef ? toLiteLLMUserId(tokenEntityRef, userIdDomain) : undefined;

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

      const request: GenerateKeyRequest = {
        ...req.body,
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
      // Handle 404 as "already deleted" (idempotent operation)
      if (error.status === 404 || error.message.includes('404')) {
        logger.warn(`Key ${keyId} not found (already deleted or never existed)`);
        res.status(200).json({ 
          success: true, 
          message: 'Key was already deleted or never existed' 
        });
        return;
      }
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
