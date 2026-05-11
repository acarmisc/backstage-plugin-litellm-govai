import { Router, Request, Response } from 'express';
import { Config } from '@backstage/config';
import { LiteLLMClient } from './client';
import {
  UserInfo,
  VirtualKey,
  ModelInfo,
  UsageMetrics,
  GenerateKeyRequest,
  GenerateKeyResponse,
} from './types';

export interface RouterOptions {
  config: Config;
  logger: any;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { config, logger } = options;

  const baseUrl = config.getString('litellm.baseUrl');
  const masterKey = config.getString('litellm.masterKey');
  const client = new LiteLLMClient({ baseUrl, masterKey });

  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  router.get('/user/info', async (req: Request, res: Response) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const userInfo: UserInfo = await client.getUserInfo(userId);
      res.json(userInfo);
    } catch (error: any) {
      logger.error('Failed to fetch user info', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/keys', async (req: Request, res: Response) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const keys: VirtualKey[] = await client.listKeys(userId);
      res.json(keys);
    } catch (error: any) {
      logger.error('Failed to list keys', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/keys/generate', async (req: Request, res: Response) => {
    try {
      const request: GenerateKeyRequest = req.body;
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

  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const { start_date, end_date, user_id, group_by } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }
      const usage: UsageMetrics = await client.getUsage(
        start_date as string,
        end_date as string,
        user_id as string | undefined,
        group_by as string | undefined
      );
      res.json(usage);
    } catch (error: any) {
      logger.error('Failed to fetch usage', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}