import { Config } from '@backstage/config';
import type { IdentityService } from '@backstage/backend-plugin-api';
import express from 'express';
import { Logger } from 'winston';
import { LiteLLMClient } from './client';
import type { UserContext } from './types';

export interface RouterOptions {
  config: Config;
  identity: IdentityService;
  logger: Logger;
}

export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const { config, identity, logger } = options;

  const litellmConfig = config.getConfig('litellm');
  const client = new LiteLLMClient({
    litellm: {
      baseUrl: litellmConfig.getString('baseUrl'),
      masterKey: litellmConfig.getString('masterKey'),
    },
  });

  const router = express.Router();

  router.get('/info', async (req, res) => {
    try {
      const userContext = await resolveUserContext(identity, req);
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
      const userContext = await resolveUserContext(identity, req);
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
  identity: IdentityService,
  req: express.Request,
): Promise<UserContext> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('Missing authorization token');
  }

  const userInfo = await identity.getIdentity({ token });

  if (!userInfo?.user) {
    throw new Error('Unable to resolve user identity');
  }

  const entityRef = userInfo.user.ref;
  const parts = entityRef.split('/');
  const username = parts[parts.length - 1];

  // Use email as user_id for LiteLLM (as per spec)
  const email = userInfo.user.email || `${username}@unknown`;

  return {
    userId: email,
    email,
    entityRef,
  };
}