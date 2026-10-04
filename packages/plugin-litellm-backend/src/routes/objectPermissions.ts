import { Router, Request, Response } from 'express';
import { TeamInfo } from '../types';
import { litellmTeamKnowledgebaseManagePermission, litellmTeamMcpManagePermission } from '@acarmisc/backstage-plugin-litellm-common';
import { assertTeamAdmin } from '../teamAdmin';
import type { RouterContext } from './context';
import { respondTeam } from '../http/respondTeam';

export function registerObjectPermissionsRoutes(router: Router, ctx: RouterContext): void {
  const {
    client,
    catalogClient,
    auth,
    permissions,
    logger,
    teamAdminCfg,
    requireObjectPerms,
    sendTeamError,
    authorizeTeamSubresource,
  } = ctx;

  // ── Knowledge-base (vector store) management ────────────────────────────
  //
  // Attaching a vector store to a team exposes its documents to every team
  // key. Team admins may only reference stores that the operator has
  // allowlisted in litellm.teamAdmin.allowedVectorStores — anything outside
  // the allowlist is rejected, never silently dropped.

  // The vector stores a team admin is allowed to attach (allowlist ∩ proxy).
  router.get('/vector-stores', async (req: Request, res: Response) => {
    if (!requireObjectPerms(res)) return;
    if (!teamAdminCfg.group) {
      res.status(500).json({ error: 'Team management is misconfigured (group is missing)' });
      return;
    }
    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group,
      permission: litellmTeamKnowledgebaseManagePermission,
      logger,
    });
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const allowed = new Set(teamAdminCfg.allowedVectorStores);
    try {
      const all = await client.listVectorStores();
      res.json(all.filter(s => allowed.has(s.id) || (s.name && allowed.has(s.name))));
    } catch (err: unknown) {
      sendTeamError(err, res);
    }
  });

  // Replace the set of knowledge bases attached to a team the caller's group
  // owns. Body: { vector_stores: string[] }. Every id must be in the
  // allowlist. The other object_permission facets (mcp_servers) are preserved.
  router.put(
    '/teams/:teamId/knowledge-bases',
    async (req: Request, res: Response) => {
      if (!requireObjectPerms(res)) return;
      const authz = await authorizeTeamSubresource(
        req,
        res,
        litellmTeamKnowledgebaseManagePermission,
      );
      if (!authz) return;
      const { teamId, owningGroup, actor, team } = authz;

      const requested = (req.body?.vector_stores ?? []) as unknown;
      if (
        !Array.isArray(requested) ||
        !requested.every(v => typeof v === 'string')
      ) {
        res
          .status(400)
          .json({ error: 'vector_stores must be an array of strings' });
        return;
      }
      const allowed = new Set(teamAdminCfg.allowedVectorStores);
      const offenders = requested.filter(v => !allowed.has(v));
      if (offenders.length) {
        res.status(400).json({
          error: `vector store(s) not in the allowed set for team admins: ${offenders.join(
            ', ',
          )}`,
        });
        return;
      }

      const objectPermission = {
        ...(team.object_permission ?? {}),
        vector_stores: requested as string[],
      };
      try {
        const updated = await client.updateTeam({
          team_id: teamId,
          object_permission: objectPermission,
          // /team/update replaces metadata wholesale — re-send the merged
          // object so owning_group / created_* survive and the change is
          // attributed.
          metadata: {
            ...(team.metadata ?? {}),
            updated_by_backstage_user: actor,
            updated_at_iso: new Date().toISOString(),
          },
        });
        logger.info('team.knowledgebase.set', {
          actor,
          teamId,
          owningGroup,
          vector_stores: requested,
        });
        respondTeam(res, updated as TeamInfo, ctx, 'manager');
      } catch (err: unknown) {
        sendTeamError(err, res);
      }
    },
  );

  // ── MCP server management ──────────────────────────────────────────────
  //
  // Attaching an MCP server to a team grants every team key the ability to
  // invoke that server's tools through the model. Same allowlist + hard-reject
  // discipline as knowledge bases, plus a structured audit event on every
  // change so attaches are always attributable.

  router.get('/mcp-servers', async (req: Request, res: Response) => {
    if (!requireObjectPerms(res)) return;
    if (!teamAdminCfg.group) {
      res.status(500).json({ error: 'Team management is misconfigured (group is missing)' });
      return;
    }
    const check = await assertTeamAdmin({
      req,
      auth,
      permissions,
      catalogClient,
      teamAdminGroup: teamAdminCfg.group,
      permission: litellmTeamMcpManagePermission,
      logger,
    });
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const allowed = new Set(teamAdminCfg.allowedMcpServers);
    try {
      const all = await client.listMcpServers();
      res.json(all.filter(s => allowed.has(s.id) || (s.name && allowed.has(s.name))));
    } catch (err: unknown) {
      sendTeamError(err, res);
    }
  });

  // Replace the set of MCP servers attached to a team the caller's group owns.
  // Body: { mcp_servers: string[] }. Every id must be allowlisted. The
  // vector_stores facet of object_permission is preserved.
  router.put(
    '/teams/:teamId/mcp-servers',
    async (req: Request, res: Response) => {
      if (!requireObjectPerms(res)) return;
      const authz = await authorizeTeamSubresource(
        req,
        res,
        litellmTeamMcpManagePermission,
      );
      if (!authz) return;
      const { teamId, owningGroup, actor, team } = authz;

      const requested = (req.body?.mcp_servers ?? []) as unknown;
      if (
        !Array.isArray(requested) ||
        !requested.every(v => typeof v === 'string')
      ) {
        res
          .status(400)
          .json({ error: 'mcp_servers must be an array of strings' });
        return;
      }
      const allowed = new Set(teamAdminCfg.allowedMcpServers);
      const offenders = requested.filter(v => !allowed.has(v));
      if (offenders.length) {
        res.status(400).json({
          error: `MCP server(s) not in the allowed set for team admins: ${offenders.join(
            ', ',
          )}`,
        });
        return;
      }

      const before = team.object_permission?.mcp_servers ?? [];
      const objectPermission = {
        ...(team.object_permission ?? {}),
        mcp_servers: requested as string[],
      };
      try {
        const updated = await client.updateTeam({
          team_id: teamId,
          object_permission: objectPermission,
          // /team/update replaces metadata wholesale — re-send the merged
          // object so owning_group / created_* survive and the change is
          // attributed.
          metadata: {
            ...(team.metadata ?? {}),
            updated_by_backstage_user: actor,
            updated_at_iso: new Date().toISOString(),
          },
        });
        logger.info('team.mcp.set', {
          actor,
          teamId,
          owningGroup,
          before,
          after: requested,
        });
        respondTeam(res, updated as TeamInfo, ctx, 'manager');
      } catch (err: unknown) {
        sendTeamError(err, res);
      }
    },
  );

}
