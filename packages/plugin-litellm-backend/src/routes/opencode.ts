import { Router, Request, Response } from 'express';
import { VirtualKey, GenerateKeyRequest } from '../types';
import {
  toLiteLLMUserId,
  resolveUserId,
  resolveUserProfile,
  getOrProvisionUser,
  ProvisioningError,
} from '../provisioning';
import { litellmKeyCreatePermission } from '@acarmisc/backstage-plugin-litellm-common';
import { LiteLLMUpstreamError } from '../client';
import { sendError } from '../errors';
import type { RouterContext } from './context';

/**
 * Only loopback http://localhost:<port>/callback redirect URIs are accepted —
 * the OpenCode plugin runs its callback listener on 127.0.0.1. This
 * keeps the flow from being usable as an open redirect.
 */
function isValidRedirectUri(uri: string | undefined): boolean {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname === '/callback'
    );
  } catch {
    return false;
  }
}


export function registerOpencodeRoutes(router: Router, ctx: RouterContext): void {
  const {
    client,
    catalogClient,
    auth,
    logger,
    userIdDomain,
    provisioningEnabled,
    provisioningDefaults,
    roleConfigs,
    opencodeCfg,
    assertPermission,
    sendPermissionDenied,
  } = ctx;

  // ── OpenCode SSO-connect ─────────────────────────────────────────────────
  //
  // Client side: the opencode-portal-auth plugin. Handshake contract (see
  // that package's README):
  //
  //   GET /opencode/connect?team=<id>&redirect_uri=http://localhost:<port>/callback
  //     → (SSO-authenticated) returns an HTML confirmation form (no state change)
  //
  //   POST /opencode/connect with form data (team, redirect_uri)
  //     → validates all conditions, rotates or generates a key
  //     → 302 redirect to {redirect_uri}?key=<plaintext-key>
  //
  // Mounted only when litellm.opencode.enabled is true. Key creation is
  // gated by the same litellmKeyCreatePermission as POST /keys/generate.
  if (opencodeCfg.enabled) {
    logger.info(
      `OpenCode connect endpoint enabled — duration=${opencodeCfg.keyDuration}, maxBudget=$${opencodeCfg.maxBudget}`,
    );

    // Helper to validate auth, permissions, redirect_uri, and team membership.
    // Reused by both GET and POST.
    // Returns null if validation fails (response already sent).
    // Returns an object with validated values if all checks pass.
    // Note: after successful validation, redirectUri is guaranteed to be a valid string.
    const validateOpenCodeRequest = async (
      req: Request,
      res: Response,
    ): Promise<
      | { tokenEntityRef: string; userId: string; userInfo: any; teamId: string | undefined; redirectUri: string }
      | null
    > => {
      const tokenEntityRef = await resolveUserId(req, auth);
      if (!tokenEntityRef) {
        res.status(401).json({ error: 'Authentication required' });
        return null;
      }

      // For GET, redirectUri is in query; for POST, it's in body.
      const redirectUriParam = (req.query.redirect_uri || req.body.redirect_uri) as string | undefined;
      if (!isValidRedirectUri(redirectUriParam)) {
        res.status(400).json({
          error: 'Invalid redirect_uri — expected http://localhost:<port>/callback',
        });
        return null;
      }
      // After isValidRedirectUri check, we know redirectUriParam is a valid string (! to tell TS).
      const redirectUri = redirectUriParam!;

      if (!(await assertPermission(req, litellmKeyCreatePermission))) {
        sendPermissionDenied(res, litellmKeyCreatePermission);
        return null;
      }

      const userId = toLiteLLMUserId(tokenEntityRef, userIdDomain);
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

      // Optional team binding: must be one of the user's own teams.
      const teamId = (req.query.team || req.body.team) as string | undefined;
      if (teamId) {
        const userTeams = userInfo?.teams ?? [];
        if (!userTeams.includes(teamId)) {
          res.status(403).json({
            error: 'Access denied: team is not one of your teams',
            team: teamId,
          });
          return null;
        }
      } else if (opencodeCfg.requireTeam) {
        res.status(400).json({ error: 'A team is required for this connection' });
        return null;
      }

      return { tokenEntityRef, userId, userInfo, teamId, redirectUri };
    };

    router.get('/opencode/connect', async (req: Request, res: Response) => {
      try {
        const validation = await validateOpenCodeRequest(req, res);
        if (!validation) return;

        const { teamId, redirectUri } = validation;

        // GET returns an HTML form without changing state (no key mint/rotate yet).
        // The form allows the user to review the connection and submit to POST.
        const teamDisplay = teamId ? ` for team ${escapeHtml(teamId)}` : '';
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCode Connect</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; background: #f5f5f5; }
    .container { max-width: 400px; margin: 0 auto; background: white; border-radius: 8px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { margin-top: 0; color: #333; font-size: 1.5rem; }
    p { color: #666; line-height: 1.5; }
    button { background: #0066cc; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #0052a3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connect to OpenCode</h1>
    <p>This will create or rotate your OpenCode API key${teamDisplay}.</p>
    <form method="POST">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      ${teamId ? `<input type="hidden" name="team" value="${escapeHtml(teamId)}">` : ''}
      <button type="submit">Connect</button>
    </form>
  </div>
</body>
</html>`;

        res.set('Cache-Control', 'no-store');
        res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://localhost:* http://127.0.0.1:*");
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
      } catch (error: unknown) {
        if (error instanceof ProvisioningError) {
          res.status(error.status).json(error.body);
          return;
        }
        sendError(res, error, logger, 'OpenCode connect GET');
      }
    });

    router.post('/opencode/connect', async (req: Request, res: Response) => {
      try {
        const validation = await validateOpenCodeRequest(req, res);
        if (!validation) return;

        const { tokenEntityRef, userId, teamId, redirectUri } = validation;

        // Alias is stable per user+team so re-connecting rotates the same
        // logical key slot. Check if an existing key exists for this slot.
        const alias = teamId ? `opencode-${userId}-${teamId}` : `opencode-${userId}`;
        const existing = await client
          .listKeys(userId)
          .catch(() => [] as VirtualKey[]);

        // Find a healthy existing key (not blocked).
        const reusable = existing.find(
          k => k.key_alias === alias && !k.blocked && k.user_id === userId,
        );

        // Mint a brand-new key bound to this user (and team) under the slot alias.
        const mintNewKey = async (): Promise<string | undefined> => {
          const profile = await resolveUserProfile(
            tokenEntityRef,
            catalogClient,
            auth,
            logger,
          );
          const result = await client.generateKey({
            alias,
            duration: opencodeCfg.keyDuration,
            max_budget: opencodeCfg.maxBudget,
            team_id: teamId,
            metadata: {
              ...opencodeCfg.metadata,
              created_via: 'opencode-connect',
              created_by_backstage_user: tokenEntityRef,
              ...(profile.email && { created_by_email: profile.email }),
              ...(teamId && { opencode_team: teamId }),
            },
            user_id: userId,
          } as GenerateKeyRequest);
          return result.key;
        };

        let key: string | undefined;
        let rotated = false;

        if (reusable?.token ?? reusable?.key) {
          const keyHashOrId = (reusable.token ?? reusable.key)!;
          try {
            // Rotate the existing key in place via LiteLLM's key regeneration.
            key = (await client.regenerateKey(keyHashOrId)).key;
            rotated = true;
          } catch (err: unknown) {
            // Key regeneration isn't available on every LiteLLM edition. Only
            // "not supported / not found" answers fall back to replacing the
            // key (delete + generate under the same alias); auth, upstream
            // outages and everything else still fail the request.
            const unsupported =
              err instanceof LiteLLMUpstreamError &&
              [400, 404, 405, 501].includes(err.status);
            if (!unsupported) throw err;
            logger.warn('LiteLLM key regeneration unavailable; replacing the OpenCode key instead');
            await client.deleteKeys({ keys: [keyHashOrId] });
            key = await mintNewKey();
            rotated = true;
          }
        } else {
          key = await mintNewKey();
        }

        if (!key) {
          res.status(502).json({ error: 'LiteLLM returned no key material' });
          return;
        }

        const url = new URL(redirectUri);
        url.searchParams.set('key', key);
        if (teamId) url.searchParams.set('team', teamId);
        logger.info('opencode.connect', {
          userId,
          team: teamId ?? null,
          rotated,
        });
        res.redirect(302, url.href);
      } catch (error: unknown) {
        if (error instanceof ProvisioningError) {
          res.status(error.status).json(error.body);
          return;
        }
        sendError(res, error, logger, 'OpenCode connect POST');
      }
    });
  }

  /**
   * Escape HTML special characters in strings to prevent XSS.
   * Used when interpolating team IDs and redirect URIs into the confirmation form.
   */
  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, c => map[c]);
  }

}
