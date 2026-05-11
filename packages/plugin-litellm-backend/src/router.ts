import { Config } from '@backstage/config';
import type { HttpAuthService } from '@backstage/backend-plugin-api';
import express from 'express';
import { Logger } from 'winston';
import { LiteLLMClient } from './client';
import type { UserContext } from './types';

export interface RouterOptions {
  config: Config;
  httpAuth: HttpAuthService;
  logger: Logger;
}

export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const { config, httpAuth, logger } = options;

  const client = new LiteLLMClient(config);

  const router = express.Router();

  router.get('/info', async (req, res) => {
    try {
      const userContext = await resolveUserContext(httpAuth, req);
      logger.info(`Fetching user info for: ${userContext.userId}`);

      const userInfo = await client.getUserInfo(userContext.userId);
      res.json({
        ...userInfo,
        context: userContext,
      });
    } catch (error) {
      logger.error('Failed to fetch user info', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  router.get('/teams', async (_req, res) => {
    try {
      const teams = await client.listTeams();
      res.json(teams);
    } catch (error) {
      logger.error('Failed to fetch teams', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  router.get('/usage', async (req, res) => {
    try {
      const userContext = await resolveUserContext(httpAuth, req);
      const days = parseInt(req.query.days as string, 10) || 7;

      logger.info(`Fetching usage for: ${userContext.userId}, days: ${days}`);
      const usage = await client.getDailyActivity(userContext.userId, days);
      res.json({ usage });
    } catch (error) {
      logger.error('Failed to fetch usage', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return router;
}

async function resolveUserContext(
  httpAuth: HttpAuthService,
  req: express.Request,
): Promise<UserContext> {
  // Allow unauthenticated requests by explicitly requesting 'none' credentials.
  // This is safe because `dangerouslyDisableDefaultAuthPolicy: true` is set in app-config.
  const credentials = await httpAuth.credentials(req, { allow: ['none'] });

  // Use entity ref from credentials principal if available
  const principal = credentials.principal as { userEntityRef?: string; subject?: string };
  const principalRef = principal?.userEntityRef ?? principal?.subject ?? '';
  const email = principalRef ? principalRef.split(':').pop() || 'user@unknown' : 'user@unknown';

  return {
    userId: email,
    email,
    entityRef: principalRef,
  };
}