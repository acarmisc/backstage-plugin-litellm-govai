import { Router, Request, Response } from 'express';
import { Config } from '@backstage/config';
import { AuthService } from '@backstage/backend-plugin-api';
import { LiteLLMClient } from './client';
import {
  UserInfo,
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  ProvisioningDefaults,
} from './types';

export interface RouterOptions {
  config: Config;
  logger: any;
  auth: AuthService;
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
function readProvisioningDefaults(config: Config): { enabled: boolean; defaults: ProvisioningDefaults } {
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
async function resolveUserId(req: Request, auth: AuthService): Promise<string | undefined> {
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
async function provisionUser(
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

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { config, logger, auth } = options;

  const baseUrl = config.getString('litellm.baseUrl');
  const masterKey = config.getString('litellm.masterKey');
  const client = new LiteLLMClient({ baseUrl, masterKey });
  const { enabled: provisioningEnabled, defaults: provisioningDefaults } = readProvisioningDefaults(config);

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
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (req.query.user_id as string | undefined);

      let userInfo: UserInfo | null = await client.getUserInfo(userId);

      if (!userInfo) {
        if (provisioningEnabled && userId) {
          userInfo = await provisionUser(client, userId, provisioningDefaults, logger);
        }

        if (!userInfo) {
          res.status(404).json({
            error: 'User not found in LiteLLM',
            provisioning: provisioningEnabled,
            hint: provisioningEnabled
              ? 'Provisioning attempted but failed — check LiteLLM logs'
              : 'Enable litellm.provisioning.enabled in app-config.yaml or create the user manually',
          });
          return;
        }
      }

      res.json(userInfo);
    } catch (error: any) {
      logger.error('Failed to fetch user info', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/keys', async (req: Request, res: Response) => {
    try {
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (req.query.user_id as string | undefined);
      const keys: VirtualKey[] = await client.listKeys(userId);
      res.json(keys);
    } catch (error: any) {
      logger.error('Failed to list keys', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/keys/generate', async (req: Request, res: Response) => {
    try {
      const tokenUserId = await resolveUserId(req, auth);
      const request: GenerateKeyRequest = {
        ...req.body,
        ...(tokenUserId && { user_id: tokenUserId }),
      };
      const result: GenerateKeyResponse = await client.generateKey(request);
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to generate key', error);
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
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (req.query.user_id as string | undefined);
      const userInfo: UserInfo | null = await client.getUserInfo(userId);

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
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (req.query.user_id as string | undefined);
      const usage: UsageMetrics = await client.getUsage(
        start_date as string,
        end_date as string,
        userId,
        group_by as string | undefined,
      );
      res.json(usage);
    } catch (error: any) {
      logger.error('Failed to fetch usage', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
