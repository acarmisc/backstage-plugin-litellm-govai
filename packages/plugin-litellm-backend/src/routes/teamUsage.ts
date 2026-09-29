import { Router, Request, Response } from 'express';
import { UsageMetrics } from '../types';
import { getOrProvisionUser, isUserMemberOfGroup, ProvisioningError } from '../provisioning';
import { redactTeamUsage } from '../teamBudgetVisibility';
import { sendError } from '../errors';
import type { RouterContext } from './context';
import { createRequireUser } from './middleware/withUser';

export function registerTeamUsageRoutes(router: Router, ctx: RouterContext): void {
  const {
    client,
    catalogClient,
    auth,
    logger,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
    teamAdminCfg,
    teamBudgetVisibility,
  } = ctx;
  const requireUser = createRequireUser(ctx);

  router.get('/teams/:teamId/usage', requireUser, async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }

      // Authorize: member of the team OR a team manager
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

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

      // Check membership: user must be in the team OR be a team manager
      const isMember = userInfo?.teams?.includes(teamId) ?? false;
      let isManager = false;
      if (teamAdminCfg.group) {
        try {
          isManager = await isUserMemberOfGroup(
            tokenEntityRef,
            teamAdminCfg.group,
            catalogClient,
            auth,
            logger,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`Team-manager check failed: ${message}`);
        }
      }

      if (!isMember && !isManager) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const usage: UsageMetrics = await client.getTeamUsage(
        teamId,
        start_date as string,
        end_date as string,
      );
      // Spend figures would let a client derive a hidden budget
      // (budget = spend / pct), so they follow the same hiding flags.
      // Which flag applies depends on whether the caller is a team manager;
      // catalog failures fail closed to the member rule.
      let hide = teamBudgetVisibility.hideTeamBudgetForMembers;
      if (isManager) {
        hide = teamBudgetVisibility.hideTeamBudgetForManagers;
      }
      res.json(hide ? redactTeamUsage(usage) : usage);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch team usage');
    }
  });

}
