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
} from './types';

export interface RouterOptions {
  config: Config;
  logger: any;
  auth: AuthService;
}

/**
 * Extracts the authenticated Backstage user identity from the request token.
 * Returns the userEntityRef (e.g. "user:default/john.doe") or undefined if
 * the request carries no user credential (service-to-service calls).
 */
async function resolveUserId(req: Request, auth: AuthService): Promise<string | undefined> {
  const rawToken = req.headers.authorization?.slice(7); // strip "Bearer "
  if (!rawToken) return undefined;
  try {
    const credentials = await auth.authenticate(rawToken);
    const principal = credentials.principal as any;
    if (principal?.type === 'user') {
      return principal.userEntityRef as string;
    }
  } catch {
    // token invalid or service token — fall through
  }
  return undefined;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { config, logger, auth } = options;

  const baseUrl = config.getString('litellm.baseUrl');
  const masterKey = config.getString('litellm.masterKey');
  const client = new LiteLLMClient({ baseUrl, masterKey });

  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Resolve user: prefer the identity extracted from the Backstage token so the
  // caller cannot spoof another user_id. Falls back to the query param only when
  // no user token is present (e.g. admin tooling using a service token).
  router.get('/user/info', async (req: Request, res: Response) => {
    try {
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (req.query.user_id as string | undefined);
      const userInfo: UserInfo = await client.getUserInfo(userId);
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
        // Bind generated key to the authenticated user so LiteLLM enforces their limits.
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

  // Returns TeamInfo for every team the authenticated user belongs to.
  // Team membership is read from /user/info .teams[], then each team is
  // resolved in parallel via /team/info.
  router.get('/teams', async (req: Request, res: Response) => {
    try {
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (req.query.user_id as string | undefined);
      const userInfo: UserInfo = await client.getUserInfo(userId);

      if (!userInfo.teams?.length) {
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
      const { start_date, end_date, user_id, group_by } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }
      const tokenUserId = await resolveUserId(req, auth);
      const userId = tokenUserId ?? (user_id as string | undefined);
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
