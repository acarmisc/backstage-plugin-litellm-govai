import { Router, Request, Response } from 'express';
import { TeamInfo } from '../types';
import { toLiteLLMUserId, getOrProvisionUser, ProvisioningError } from '../provisioning';
import {
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
  litellmTeamDeletePermission,
} from '@acarmisc/backstage-plugin-litellm-common';
import { assertTeamAdmin, validateTeamWriteInput, validateTeamPatchInput } from '../teamAdmin';
import { redactTeamBudget } from '../teamBudgetVisibility';
import { sendError } from '../errors';
import type { RouterContext } from './context';
import { createRequireUser, getProvisionedUser } from './middleware/withUser';
import { respondTeamList } from '../http/respondTeam';

import { withTeamFetchRetry, teamCreateInFlight } from '../http/teamFetch';
export function registerTeamsRoutes(router: Router, ctx: RouterContext): void {
  const {
    client,
    catalogClient,
    auth,
    permissions,
    logger,
    userIdDomain,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
    teamAdminCfg,
    teamBudgetVisibility,
    requireTeamMgmt,
    sendTeamError,
    authorizeTeamSubresource,
  } = ctx;
  const requireUser = createRequireUser(ctx);

  router.get('/teams', requireUser, async (_req: Request, res: Response) => {
    try {
      const userInfo = await getProvisionedUser(ctx, res);

      if (!userInfo?.teams?.length) {
        res.json([]);
        return;
      }

      const teams = await Promise.all(
        userInfo.teams.map((teamId: string) =>
          withTeamFetchRetry(() => client.getTeamInfo(teamId)).catch(err => {
            logger.warn(`Failed to fetch team ${teamId} after retries: ${err.message}`);
            return null;
          }),
        ),
      );
      const list = teams.filter(Boolean) as TeamInfo[];
      // Member surface: strip dollar amounts when the operator hides them
      // from members. Managers who need the numbers use /teams/managed.
      respondTeamList(res, list, ctx, 'member');
    } catch (error: any) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch teams');
    }
  });


  router.post('/teams', async (req: Request, res: Response) => {
    if (!requireTeamMgmt(res)) return;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamCreatePermission,
      logger,
    });

    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const v = validateTeamWriteInput(req.body ?? {}, teamAdminCfg);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    const key = v.value.team_alias.trim().toLowerCase();
    const pending = teamCreateInFlight.get(key);
    if (pending) {
      logger.info(`Team creation already in flight for ${key} — joining`);
      try {
        const result = await pending;
        res.json(result);
      } catch (err: any) {
        sendTeamError(err, res);
      }
      return;
    }

    const payload = {
      team_alias: v.value.team_alias,
      models: v.value.models,
      ...(v.value.max_budget !== undefined && { max_budget: v.value.max_budget }),
      ...(v.value.budget_duration && { budget_duration: v.value.budget_duration }),
      ...(v.value.tpm_limit !== undefined && { tpm_limit: v.value.tpm_limit }),
      ...(v.value.rpm_limit !== undefined && { rpm_limit: v.value.rpm_limit }),
      metadata: {
        owning_group: teamAdminCfg.group,
        created_by_backstage_user: check.userEntityRef,
        created_via: 'backstage',
        created_at_iso: new Date().toISOString(),
      },
    };

    const createPromise = (async () => {
      const result = await client.createTeam(payload);
      logger.info({
        action: 'team.create',
        actor: check.userEntityRef,
        teamAlias: v.value.team_alias,
        owningGroup: teamAdminCfg.group,
      });
      return result;
    })();

    teamCreateInFlight.set(key, createPromise);
    try {
      const result = await createPromise;
      // Manager surface: redact dollars when hidden even from managers.
      res.json(
        teamBudgetVisibility.hideTeamBudgetForManagers
          ? redactTeamBudget(result as TeamInfo)
          : result,
      );
    } catch (err: any) {
      sendTeamError(err, res);
    } finally {
      teamCreateInFlight.delete(key);
    }
  });

  router.patch('/teams/:teamId', async (req: Request, res: Response) => {
    const authz = await authorizeTeamSubresource(
      req,
      res,
      litellmTeamManagePermission,
    );
    if (!authz) return;
    const { teamId, owningGroup, actor, team: existing } = authz;

    const v = validateTeamPatchInput(req.body ?? {}, teamAdminCfg);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    // Optimistic-concurrency guard (opt-in): when the client sends the
    // `expectedUpdatedAtIso` it based its edit on, reject if the stored value
    // has moved on — a concurrent edit landed in between. Callers that don't
    // send it are unaffected (last-writer-wins, as before).
    const expected = (req.body ?? {}).expectedUpdatedAtIso as
      | string
      | undefined;
    if (
      expected !== undefined &&
      expected !== (existing.metadata?.updated_at_iso as string | undefined)
    ) {
      res.status(409).json({
        error:
          'This team was modified since you loaded it. Reload and re-apply your change.',
      });
      return;
    }

    const payload = {
      team_id: teamId,
      ...v.value,
      metadata: {
        ...(existing.metadata ?? {}),
        updated_by_backstage_user: actor,
        updated_at_iso: new Date().toISOString(),
      },
    };

    try {
      const r = await client.updateTeam(payload);
      logger.info({
        action: 'team.update',
        actor,
        teamId,
        owningGroup,
      });
      res.json(
        teamBudgetVisibility.hideTeamBudgetForManagers
          ? redactTeamBudget(r as TeamInfo)
          : r,
      );
    } catch (err: any) {
      sendTeamError(err, res);
    }
  });

  // Delete a team the caller's group owns. Gated by litellm.teamAdmin.allowTeamDelete
  // (default false — deletion is destructive: it orphans keys and revokes access
  // for every member). Refuses when the team id is referenced by provisioning
  // config unless ?force=true. Prefer blocking a team over deleting it.
  router.delete('/teams/:teamId', async (req: Request, res: Response) => {
    const authz = await authorizeTeamSubresource(
      req,
      res,
      litellmTeamDeletePermission,
    );
    if (!authz) return;
    const { teamId, owningGroup, actor } = authz;

    if (!teamAdminCfg.allowTeamDelete) {
      res.status(403).json({
        error:
          'Team deletion is disabled (set litellm.teamAdmin.allowTeamDelete: true). Block the team instead.',
      });
      return;
    }

    const provisioningRefs = [
      ...provisioningDefaults.teams,
      ...roleConfigs.flatMap(r => r.teams ?? []),
    ];
    const force = String(req.query.force ?? '') === 'true';
    if (provisioningRefs.includes(teamId) && !force) {
      res.status(409).json({
        error: `Team ${teamId} is referenced by litellm.provisioning config; deleting it will break user provisioning. Re-send with ?force=true to override.`,
      });
      return;
    }

    try {
      await client.deleteTeam(teamId);
      logger.info({ action: 'team.delete', actor, teamId, owningGroup, force });
      res.json({ success: true });
    } catch (err: any) {
      sendTeamError(err, res);
    }
  });

  // Scoped listing for team admins: returns ONLY the teams whose
  // `metadata.owning_group` equals the configured admin group, so a team admin
  // can see and edit teams their group owns even when they are not a member.
  // This deliberately never returns a global team list. Registered before any
  // `/teams/:param` route so the literal path is not shadowed.
  router.get('/teams/managed', async (req: Request, res: Response) => {
    if (!requireTeamMgmt(res)) return;

    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group!,
      permission: litellmTeamManagePermission,
      logger,
    });

    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    try {
      const all = await client.listTeams();
      // TODO(multi-group): when litellm.teamAdmin.group becomes a list, resolve
      // the caller's group set and filter with includes().
      const owned = all.filter(
        t =>
          typeof t.metadata?.owning_group === 'string' &&
          t.metadata.owning_group === teamAdminCfg.group,
      );
      // Manager surface: strip dollar amounts when hidden even from managers.
      res.json(
        teamBudgetVisibility.hideTeamBudgetForManagers
          ? owned.map(redactTeamBudget)
          : owned,
      );
    } catch (err) {
      sendTeamError(err, res);
    }
  });

  // ── Team member routes ──────────────────────────────────────────────────
  //

  // Add a member to a team the caller's group owns. The member must (a) resolve
  // to a real User in the Backstage catalog and (b) exist in LiteLLM — we
  // provision them on the spot when auto-provisioning is enabled. Only the
  // 'user' team role can be assigned from Backstage.
  router.post(
    '/teams/:teamId/members',
    async (req: Request, res: Response) => {
      const authz = await authorizeTeamSubresource(req, res, litellmTeamMembersManagePermission);
      if (!authz) return;
      const { teamId, owningGroup, actor } = authz;

      const body = (req.body ?? {}) as {
        userEntityRef?: string;
        role?: string;
        maxBudgetInTeam?: number;
      };
      const userEntityRef = (body.userEntityRef ?? '').trim();
      if (!userEntityRef) {
        res.status(400).json({ error: 'userEntityRef is required' });
        return;
      }
      if (body.role !== undefined && body.role !== 'user') {
        res.status(400).json({
          error: "only the 'user' team role can be assigned from Backstage",
        });
        return;
      }
      let maxBudgetInTeam: number | undefined;
      if (body.maxBudgetInTeam !== undefined) {
        if (
          typeof body.maxBudgetInTeam !== 'number' ||
          !Number.isFinite(body.maxBudgetInTeam) ||
          body.maxBudgetInTeam <= 0
        ) {
          res
            .status(400)
            .json({ error: 'maxBudgetInTeam must be a positive number' });
          return;
        }
        maxBudgetInTeam = body.maxBudgetInTeam;
      }

      // (a) the member must be a real User in the Backstage catalog
      try {
        const { token } = await auth.getPluginRequestToken({
          onBehalfOf: await auth.getOwnServiceCredentials(),
          targetPluginId: 'catalog',
        });
        const entity = await catalogClient.getEntityByRef(userEntityRef, {
          token,
        });
        if (!entity || entity.kind !== 'User') {
          res.status(400).json({
            error: `${userEntityRef} is not a User in the Backstage catalog`,
          });
          return;
        }
      } catch (err: any) {
        logger.warn(
          `Catalog lookup failed for ${userEntityRef}: ${err.message}`,
        );
        res.status(400).json({
          error: `Could not verify ${userEntityRef} in the Backstage catalog`,
        });
        return;
      }

      // (b) the member must exist in LiteLLM — provision on the spot if enabled
      const litellmUserId = toLiteLLMUserId(userEntityRef, userIdDomain);
      try {
        await getOrProvisionUser(
          client,
          userEntityRef,
          litellmUserId,
          provisioningEnabled,
          provisioningDefaults,
          roleConfigs,
          catalogClient,
          auth,
          logger,
        );
      } catch (err: any) {
        if (err instanceof ProvisioningError) {
          res.status(err.status).json(err.body);
          return;
        }
        throw err;
      }

      try {
        await client.teamMemberAdd({
          team_id: teamId,
          user_id: litellmUserId,
          role: 'user',
          ...(maxBudgetInTeam !== undefined && {
            max_budget_in_team: maxBudgetInTeam,
          }),
        });
        logger.info({
          action: 'team.member.add',
          actor,
          teamId,
          member: litellmUserId,
          owningGroup,
        });
        const updated = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
        res.json(
          teamBudgetVisibility.hideTeamBudgetForManagers
            ? redactTeamBudget(updated as TeamInfo)
            : updated,
        );
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

  // Remove a member from a team the caller's group owns. The member ref comes
  // from the `userEntityRef` query param (entity refs contain ':' and '/', so
  // they can't be a path segment). No catalog re-check on removal.
  router.delete(
    '/teams/:teamId/members',
    async (req: Request, res: Response) => {
      const authz = await authorizeTeamSubresource(req, res, litellmTeamMembersManagePermission);
      if (!authz) return;
      const { teamId, owningGroup, actor } = authz;

      const userEntityRef = String(req.query.userEntityRef ?? '').trim();
      if (!userEntityRef) {
        res
          .status(400)
          .json({ error: 'userEntityRef query parameter is required' });
        return;
      }
      const litellmUserId = toLiteLLMUserId(userEntityRef, userIdDomain);
      try {
        await client.teamMemberDelete({
          team_id: teamId,
          user_id: litellmUserId,
        });
        logger.info({
          action: 'team.member.remove',
          actor,
          teamId,
          member: litellmUserId,
          owningGroup,
        });
        const updated = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
        res.json(
          teamBudgetVisibility.hideTeamBudgetForManagers
            ? redactTeamBudget(updated as TeamInfo)
            : updated,
        );
      } catch (err: any) {
        sendTeamError(err, res);
      }
    },
  );

}
