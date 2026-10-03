import { Request, Response, NextFunction } from 'express';
import { toLiteLLMUserId, resolveUserId, getOrProvisionUser } from '../../provisioning';
import { UserInfo } from '../../types';
import type { RouterContext } from '../context';

/**
 * Express middleware that resolves a Backstage user principal to a LiteLLM user ID.
 * Stores both `tokenEntityRef` and `userId` in res.locals for downstream handlers.
 *
 * Returns 401 if the request lacks a valid Backstage user credential.
 */
export function createRequireUser(ctx: RouterContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokenEntityRef = await resolveUserId(req, ctx.auth);
      if (!tokenEntityRef) {
        res.status(401).json({ error: 'A Backstage user credential is required' });
        return;
      }
      res.locals.tokenEntityRef = tokenEntityRef;
      res.locals.userId = toLiteLLMUserId(tokenEntityRef, ctx.userIdDomain);
      next();
    } catch (error) {
      res.status(401).json({ error: 'A Backstage user credential is required' });
    }
  };
}

/**
 * Helper to fetch and provision a user from res.locals (populated by requireUser middleware).
 * Returns the user info or throws ProvisioningError (which the caller must handle and respond to).
 *
 * This deduplicates the repeated pattern:
 *   const userInfo = await getProvisionedUser(...);
 *   if (error instanceof ProvisioningError) { res.status(...).json(...); return; }
 */
export async function getProvisionedUser(
  ctx: RouterContext,
  res: Response,
): Promise<UserInfo> {
  const tokenEntityRef = res.locals.tokenEntityRef as string;
  const userId = res.locals.userId as string;

  return getOrProvisionUser(
    ctx.client,
    tokenEntityRef,
    userId,
    ctx.provisioningEnabled,
    ctx.provisioningDefaults,
    ctx.roleConfigs,
    ctx.catalogClient,
    ctx.auth,
    ctx.logger,
  );
}
