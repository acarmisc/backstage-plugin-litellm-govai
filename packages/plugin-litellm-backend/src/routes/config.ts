import { Router, Request, Response } from 'express';
import { applyRoleOverrides, resolveUserId, isUserMemberOfGroup } from '../provisioning';
import { openApiSpec } from '../openapi';
import { sendError } from '../errors';
import type { RouterContext } from './context';

/**
 * Register config-related routes (/health, /config, /openapi.json, /provisioning/preview).
 * These routes expose configuration and metadata for the LiteLLM plugin.
 */
export function registerConfigRoutes(router: Router, ctx: RouterContext): void {
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', provisioning: ctx.provisioningEnabled });
  });

  // Exposes the public LiteLLM proxy URL so the frontend can build
  // ready-to-paste curl / OpenAI-SDK snippets for freshly generated keys.
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      baseUrl: ctx.publicBaseUrl,
      supportContact: ctx.supportContact,
      keyGeneration: { allowUnlimitedBudget: ctx.allowUnlimitedBudget, teamRequired: ctx.teamRequired },
      keyActions: { allowOwnerResetSpend: ctx.allowOwnerResetSpend },
      opencode: { enabled: ctx.opencodeCfg.enabled },
      teamManagement: {
        enabled: ctx.teamMgmtEnabled,
        maxBudgetCeiling: ctx.teamAdminCfg.maxBudgetCeiling,
        allowUnlimitedBudget: ctx.teamAdminCfg.allowUnlimitedBudget,
        objectPermissionsEnabled: ctx.objectPermsEnabled,
        readOnly: ctx.teamAdminCfg.readOnly,
        memberManagerRoles: ctx.teamAdminCfg.memberManagerRoles,
      },
      display: {
        hideTeamBudgetForMembers:
          ctx.teamBudgetVisibility.hideTeamBudgetForMembers,
        hideTeamBudgetForManagers:
          ctx.teamBudgetVisibility.hideTeamBudgetForManagers,
      },
    });
  });

  // Self-hosted OpenAPI 3.1 contract — lets integrators read a spec instead
  // of router.ts. No swagger-ui dependency; serve the JSON and point external
  // renderers (Stoplight, Swagger UI hosted elsewhere) at this endpoint.
  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  // Provisioning dry-run: resolves which role a Backstage group maps to and
  // echoes the effective defaults, collapsing the config → deploy → test loop
  // into one request. Admin-gated by the audit group (same RBAC as /audit).
  router.get('/provisioning/preview', async (req: Request, res: Response) => {
    if (!ctx.auditGroup) {
      res.status(403).json({ error: 'Preview is not configured (litellm.audit.group not set)' });
      return;
    }
    const tokenEntityRef = await resolveUserId(req, ctx.auth);
    if (!tokenEntityRef) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const allowed = await isUserMemberOfGroup(
      tokenEntityRef,
      ctx.auditGroup,
      ctx.catalogClient,
      ctx.auth,
      ctx.logger,
    );
    if (!allowed) {
      res.status(403).json({ error: 'Access denied: not a member of the audit group' });
      return;
    }
    const group = (req.query.group as string | undefined)?.trim();
    if (!group) {
      res.status(400).json({ error: 'group query parameter is required (e.g. group=group:default/ai-platform)' });
      return;
    }
    if (!ctx.roleConfigs.length) {
      res.json({
        group,
        matched_role: null,
        effective_defaults: ctx.provisioningDefaults,
        note: 'No litellm.provisioning.roles configured — every group receives the base defaults.',
      });
      return;
    }
    try {
      const matched = ctx.roleConfigs.find(rc => rc.group === group);
      const effective = matched
        ? applyRoleOverrides(ctx.provisioningDefaults, matched)
        : ctx.provisioningDefaults;
      res.json({
        group,
        matched_role: matched?.group ?? null,
        effective_defaults: effective,
      });
    } catch (error: unknown) {
      sendError(res, error, ctx.logger, 'resolve provisioning preview');
    }
  });
}
