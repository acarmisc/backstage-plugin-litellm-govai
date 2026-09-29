import { Router, Request, Response } from 'express';
import { VirtualKey, ModelInfo, UsageMetrics, UpdateKeyRequest } from '../types';
import {
  resolveUserId,
  getOrProvisionUser,
  isUserMemberOfGroup,
  ProvisioningError,
} from '../provisioning';
import {
  litellmKeyCreatePermission,
  litellmKeyRevokePermission,
  litellmKeyManagePermission,
  litellmKeyResetSpendPermission,
  litellmKeyUnblockPermission,
  litellmAuditReadPermission,
  createGenerateKeyInputSchema,
  createUpdateKeyInputSchema,
  type GenerateKeyInput,
  type UpdateKeyInput,
} from '@acarmisc/backstage-plugin-litellm-common';
import { createKeyForUser, KeyServiceError, type KeyCreateContext } from '../services/keyService';
import { sendError, sanitizeUpstreamMessage } from '../errors';
import type { RouterContext } from './context';
import { getProvisionedUser } from './middleware/withUser';


/**
 * Register key and user routes: /user/info, /keys*, key mutations, /audit,
 * /models and /usage. Handlers are unchanged from router.ts; only their
 * location and access to shared state (via ctx) differ.
 */
export function registerKeysRoutes(router: Router, ctx: RouterContext): void {
  const {
    client,
    catalogClient,
    auth,
    logger,
    userIdDomain,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
    auditGroup,
    allowUnlimitedBudget,
    teamRequired,
    allowOwnerResetSpend,
    keyValidationConfig,
    authorizeKeyAction,
    sendOwnershipError,
    assertPermission,
    sendPermissionDenied,
  } = ctx;
  const generateKeyInputSchema = createGenerateKeyInputSchema(keyValidationConfig);
  const updateKeyInputSchema = createUpdateKeyInputSchema(keyValidationConfig);

  router.get('/user/info', async (_req: Request, res: Response) => {
    try {
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userInfo = await getProvisionedUser(ctx, res);
      const canViewAudit =
        auditGroup && tokenEntityRef
          ? await isUserMemberOfGroup(
              tokenEntityRef,
              auditGroup,
              catalogClient,
              auth,
              logger,
            )
          : false;
      res.json({ ...userInfo, can_view_audit: canViewAudit });
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch user info');
    }
  });

  router.get('/keys', async (_req: Request, res: Response) => {
    try {
      const userId = res.locals.userId as string;

      await getProvisionedUser(ctx, res);

      const keys: VirtualKey[] = await client.listKeys(userId);
      res.json(keys);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'list keys');
    }
  });

  router.post('/keys/prune-expired', async (_req: Request, res: Response) => {
    try {
      // Permission check
      if (!(await assertPermission(_req, litellmKeyRevokePermission))) {
        sendPermissionDenied(res, litellmKeyRevokePermission);
        return;
      }

      const userId = res.locals.userId as string;

      // Ensure the user is provisioned
      await getProvisionedUser(ctx, res);

      // Load the caller's keys
      const keys: VirtualKey[] = await client.listKeys(userId);

      // Identify expired keys (expires_at in the past)
      const now = Date.now();
      const expiredKeys = keys.filter(k => {
        if (!k.expires_at) return false;
        return new Date(k.expires_at).getTime() < now;
      });

      if (expiredKeys.length === 0) {
        res.json({ pruned: 0, failed: 0 });
        return;
      }

      // Delete expired keys, tracking failures
      let pruned = 0;
      let failed = 0;
      const failures: Array<{ keyId: string; error: string }> = [];

      for (const key of expiredKeys) {
        try {
          const keyId = key.token ?? key.key;
          await client.deleteKeys({ keys: [keyId] });
          pruned++;
          logger.info('key.prune-expired', { userId, keyId });
        } catch (err: unknown) {
          failed++;
          const keyId = key.token ?? key.key;
          let errorMsg = 'Unknown error';
          if (err instanceof Error) {
            errorMsg = sanitizeUpstreamMessage(err.message) || 'Unknown error';
          }
          failures.push({ keyId, error: errorMsg });
          logger.warn('key.prune-expired failed', {
            userId,
            keyId,
            error: errorMsg,
          });
        }
      }

      const response: any = { pruned, failed };
      if (failures.length > 0) {
        response.failures = failures;
      }
      res.json(response);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'prune expired keys');
    }
  });

  router.post('/keys/generate', async (req: Request, res: Response) => {
    try {
      // ── Parse & validate input with strict schema ────────────────────────
      const parseResult = generateKeyInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessages = parseResult.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        res.status(400).json({
          error: 'Invalid request body',
          details: errorMessages,
        });
        return;
      }
      const input: GenerateKeyInput = parseResult.data;

      // ── Permission check ────────────────────────────────────────────────
      if (!(await assertPermission(req, litellmKeyCreatePermission))) {
        sendPermissionDenied(res, litellmKeyCreatePermission);
        return;
      }

      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const resolvedUserId = res.locals.userId as string;

      // ── Create key via unified service ──────────────────────────────────
      const keyCreateCtx: KeyCreateContext = {
        client,
        config: {
          allowUnlimitedBudget,
          teamRequired,
        },
        catalogClient,
        auth,
        logger,
        keyValidationConfig,
        provisioningEnabled,
        provisioningDefaults,
        roleConfigs,
        userIdDomain,
      };
      const result = await createKeyForUser(
        { tokenEntityRef, userId: resolvedUserId },
        input,
        keyCreateCtx,
      );
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof KeyServiceError) {
        res.status(error.status).json(error.body);
        return;
      }
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      // LiteLLM's enterprise team-key hook silently overrides the requested
      // `duration` with the team's `metadata.team_member_key_duration` when a
      // team_id is set, before parsing it. A malformed value there 500s with
      // this exact message regardless of what we sent — surface that instead
      // of the opaque passthrough so it's actionable from the LiteLLM side.
      const teamId = (req.body as any)?.team_id;
      if (
        error instanceof Error &&
        error.message.includes('Invalid duration format') &&
        teamId
      ) {
        res.status(502).json({
          error:
            'LiteLLM rejected the key duration for this team. The team has a ' +
            '"Team Member Key Duration" set in LiteLLM that is not in a valid ' +
            '<number><unit> format (e.g. "30d") and overrides whatever duration ' +
            'is requested. Fix or clear it in LiteLLM under Teams → this team → ' +
            'Team Settings, then retry.',
          teamId,
        });
        return;
      }
      sendError(res, error, logger, 'generate key');
    }
  });

  router.post('/keys/:keyId/update', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      if (!keyId) {
        res.status(400).json({ error: 'keyId is required' });
        return;
      }

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef, userId, key } = await authorizeKeyAction(req, keyId);

      // ── Parse and validate request with strict schema ──────────────────────
      // This will reject unknown fields including team_id, user_id, spend, blocked, key, budget_duration.
      let input: UpdateKeyInput;
      try {
        input = updateKeyInputSchema.parse(req.body);
      } catch (error: unknown) {
        const errorMessage =
          error && typeof error === 'object' && 'errors' in error
            ? (error as any).errors?.[0]?.message || 'Invalid request'
            : 'Invalid request';
        const details =
          error && typeof error === 'object' && 'errors' in error
            ? (error as any).errors
            : undefined;
        res.status(400).json({
          error: errorMessage,
          ...(details && { details }),
        });
        return;
      }

      // ── Enforce budget rules ──────────────────────────────────────────────
      // allowUnlimitedBudget===false rejects max_budget:null explicitly sent
      if (!allowUnlimitedBudget && input.max_budget === null) {
        res.status(400).json({
          error: 'max_budget cannot be null when unlimited budgets are not allowed',
        });
        return;
      }

      // ── Validate models are subset of allowed using the key's team_id ─────
      if (input.models && input.models.length > 0) {
        let allowedModels: string[] = [];
        if (key.team_id) {
          // Fetch team info to get its allowed models.
          // Fail closed: if the team can't be fetched, the error propagates.
          try {
            const teamInfo = await client.getTeamInfo(key.team_id);
            allowedModels = teamInfo?.models ?? [];
          } catch (err) {
            sendError(res, err, logger, 'fetch team info for model validation');
            return;
          }
        } else {
          // Use user's models if no team
          const userInfo = await client.getUserInfo(userId);
          allowedModels = userInfo?.models ?? [];
        }

        // Only enforce if the allowedModels list is non-empty (non-empty = restricted)
        if (allowedModels.length > 0) {
          const disallowed = input.models.filter(m => !allowedModels.includes(m));
          if (disallowed.length > 0) {
            res.status(400).json({
              error: 'One or more requested models are not allowed',
              disallowed_models: disallowed,
            });
            return;
          }
        }
      }

      // ── Build upstream request EXPLICITLY from parsed fields ──────────────
      // Never spread the raw body; only include fields we've explicitly validated.
      const upstreamRequest: UpdateKeyRequest = {
        key: keyId,
      };

      if (input.key_alias !== undefined) {
        upstreamRequest.key_alias = input.key_alias;
      }
      if (input.models !== undefined) {
        upstreamRequest.models = input.models;
      }
      if (input.max_budget !== undefined) {
        // max_budget from input can be null (unlimited) or a number
        upstreamRequest.max_budget = input.max_budget;
      }
      if (input.tpm_limit !== undefined) {
        upstreamRequest.tpm_limit = input.tpm_limit;
      }
      if (input.rpm_limit !== undefined) {
        upstreamRequest.rpm_limit = input.rpm_limit;
      }

      const result = await client.updateKey(upstreamRequest);
      logger.info('key.update', { userId: tokenEntityRef ?? 'unknown', keyId });
      res.json(result);
    } catch (error: unknown) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'update key');
    }
  });

  router.delete('/keys/:keyId', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      if (!keyId) {
        res.status(400).json({ error: 'keyId is required' });
        return;
      }

      if (!(await assertPermission(req, litellmKeyRevokePermission))) {
        sendPermissionDenied(res, litellmKeyRevokePermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.deleteKeys({ keys: [keyId] });
      logger.info('key.delete', { userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: unknown) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'delete key');
    }
  });

  router.post('/keys/:keyId/block', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      if (!(await assertPermission(req, litellmKeyManagePermission))) {
        sendPermissionDenied(res, litellmKeyManagePermission);
        return;
      }

      const { tokenEntityRef, key } = await authorizeKeyAction(req, keyId);

      // Record metadata: who blocked this key and when
      const updatedMetadata = {
        ...(key.metadata ?? {}),
        blocked_by: tokenEntityRef,
        blocked_at: new Date().toISOString(),
      };

      await client.blockKey(keyId);
      // Also update the key's metadata to record blocked_by and blocked_at
      await client.updateKey({
        key: keyId,
        metadata: updatedMetadata,
      });

      logger.info('key.block', { userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: unknown) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'block key');
    }
  });

  router.post('/keys/:keyId/unblock', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      const { tokenEntityRef, key } = await authorizeKeyAction(req, keyId);

      // Check if the key can be unblocked:
      // - Owner can unblock a self-blocked key (metadata.blocked_by === tokenEntityRef)
      // - Otherwise require the unblock permission
      const isOwnerUnblockingOwnBlock = key.metadata?.blocked_by === tokenEntityRef;

      if (!isOwnerUnblockingOwnBlock) {
        if (!(await assertPermission(req, litellmKeyUnblockPermission))) {
          sendPermissionDenied(res, litellmKeyUnblockPermission);
          return;
        }
      }

      await client.unblockKey(keyId);

      // Clear the blocked_by metadata on unblock
      const updatedMetadata = {
        ...(key.metadata ?? {}),
      };
      delete updatedMetadata.blocked_by;
      delete updatedMetadata.blocked_at;

      await client.updateKey({
        key: keyId,
        metadata: updatedMetadata,
      });

      logger.info('key.unblock', { userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: unknown) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'unblock key');
    }
  });

  router.post('/keys/:keyId/reset_spend', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      // Fail closed: check the config flag first — if false, always deny even with an allow-all permission
      if (!allowOwnerResetSpend) {
        res.status(403).json({
          error: 'Reset spend is not allowed. Contact your administrator to enable this action.',
        });
        return;
      }

      // Then check permissions
      if (!(await assertPermission(req, litellmKeyResetSpendPermission))) {
        sendPermissionDenied(res, litellmKeyResetSpendPermission);
        return;
      }

      const { tokenEntityRef } = await authorizeKeyAction(req, keyId);
      await client.resetKeySpend(keyId);
      logger.info('key.reset_spend', { userId: tokenEntityRef ?? 'unknown', keyId });
      res.json({ success: true });
    } catch (error: unknown) {
      if (sendOwnershipError(error, res)) return;
      sendError(res, error, logger, 'reset key spend');
    }
  });

  router.get('/audit', async (req: Request, res: Response) => {
    if (!auditGroup) {
      res.status(403).json({ error: 'Audit log is not configured (litellm.audit.group not set)' });
      return;
    }
    const tokenEntityRef = await resolveUserId(req, auth);
    if (!tokenEntityRef) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const allowed = await isUserMemberOfGroup(
      tokenEntityRef,
      auditGroup,
      catalogClient,
      auth,
      logger,
    );
    if (!allowed) {
      res.status(403).json({ error: 'Access denied: not a member of the audit group' });
      return;
    }

    if (!(await assertPermission(req, litellmAuditReadPermission))) {
      sendPermissionDenied(res, litellmAuditReadPermission);
      return;
    }

    try {
      const { page, page_size, start_date, end_date, action, table_name, changed_by } =
        req.query as Record<string, string | undefined>;
      const result = await client.getAuditLogs({
        page: page ? Number(page) : undefined,
        page_size: page_size ? Number(page_size) : 25,
        start_date,
        end_date,
        action,
        table_name,
        changed_by,
      });
      res.json(result);
    } catch (error: unknown) {
      sendError(res, error, logger, 'fetch audit logs');
    }
  });

  router.get('/models', async (_req: Request, res: Response) => {
    try {
      const models: ModelInfo[] = await client.listModels();
      res.json(models);
    } catch (error: unknown) {
      sendError(res, error, logger, 'list models');
    }
  });

  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }
      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userId = res.locals.userId as string;

      await getOrProvisionUser(
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

      const usage: UsageMetrics = await client.getUsage(
        start_date as string,
        end_date as string,
        userId,
      );
      res.json(usage);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch usage');
    }
  });
}
