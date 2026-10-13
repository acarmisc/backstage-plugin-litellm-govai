import { Router, Request, Response } from 'express';
import { PaginatedSpendLogs } from '../types';
import { isUserMemberOfGroup, ProvisioningError } from '../provisioning';
import { sendError } from '../errors';
import type { RouterContext } from './context';
import { createRequireUser, getProvisionedUser } from './middleware/withUser';
import { isLangfuseConfigured } from '../langfuse';
import { getQualitySummary } from '../langfuseClient';

export function registerInsightsRoutes(router: Router, ctx: RouterContext): void {
  const { client, catalogClient, auth, logger, auditGroup } = ctx;
  const requireUser = createRequireUser(ctx);

  router.get('/insights/spend-logs', requireUser, async (req: Request, res: Response) => {
    try {
      const { start_date, end_date, userId, teamId, page, page_size } =
        req.query as Record<string, string | undefined>;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }

      const tokenEntityRef = res.locals.tokenEntityRef as string;
      await getProvisionedUser(ctx, res);
      const callerId = res.locals.userId as string;
      const isAudit = auditGroup
        ? await isUserMemberOfGroup(
            tokenEntityRef,
            auditGroup,
            catalogClient,
            auth,
            logger,
          )
        : false;
      // Server-side scoping: only audit-group members may query other
      // users/teams — everyone else is forced to their own user_id.
      const result: PaginatedSpendLogs = await client.getSpendLogs({
        startDate: start_date,
        endDate: end_date,
        userId: isAudit ? userId || callerId : callerId,
        teamId: isAudit ? teamId : undefined,
        page: page ? Number(page) : undefined,
        pageSize: page_size ? Number(page_size) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch spend logs');
    }
  });

  router.get('/insights/quality', requireUser, async (req: Request, res: Response) => {
    try {
      const { start_date, end_date, userId } =
        req.query as Record<string, string | undefined>;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }

      const tokenEntityRef = res.locals.tokenEntityRef as string;
      await getProvisionedUser(ctx, res);
      const callerId = res.locals.userId as string;
      const isAudit = auditGroup
        ? await isUserMemberOfGroup(
            tokenEntityRef,
            auditGroup,
            catalogClient,
            auth,
            logger,
          )
        : false;
      if (!isLangfuseConfigured(ctx.langfuseCfg)) {
        res.json({ configured: false });
        return;
      }
      // Server-side scoping, same as spend-logs: only audit-group members
      // may query other users — everyone else is forced to their own user_id.
      // Unreachable / v3 servers degrade to {configured:false}, never a 500.
      const summary = await getQualitySummary(ctx.langfuseCfg, {
        from: start_date,
        to: end_date,
        userId: isAudit ? userId || callerId : callerId,
      });
      res.json(summary ?? { configured: false });
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch quality summary');
    }
  });
}
