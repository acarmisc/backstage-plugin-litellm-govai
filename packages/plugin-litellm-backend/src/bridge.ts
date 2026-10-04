/**
 * Bridge — lets CLI clients (Abby) list/mint LiteLLM virtual keys without ever
 * holding the LiteLLM master key.
 *
 * Trust model: the Backstage backend holds the master key (as it already does
 * for the UI). A CLI authenticates with its Keycloak access token (the same
 * Keycloak realm Backstage uses). This module verifies that JWT against the
 * realm JWKS, resolves the caller to a LiteLLM user_id, ensures that user
 * exists (provisioning from claims if enabled), and then lists/generates keys
 * via the existing master-key-authed {@link LiteLLMClient}.
 *
 * Unlike the UI endpoints in router.ts, the bridge routes do NOT call
 * Backstage's `auth.authenticate` (which expects a Backstage-issued token);
 * they verify the raw Keycloak JWT themselves.
 */
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { LiteLLMClient } from './client';
import {
  ProvisioningDefaults,
  UserInfo,
  VirtualKey,
} from './types';
import { ProvisioningError, provisionUser, toLiteLLMUserId } from './provisioning';

/** Claims extracted from a verified Keycloak access token. */
export interface BridgeClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  /** Authorized party — Keycloak sets this to the client_id of the requester. */
  azp?: string;
  aud?: string | string[];
  /** Keycloak payload `typ` claim: 'Bearer' for access tokens, 'ID' for ID tokens. */
  typ?: string;
}

/** A token verifier pluggable for tests. */
export interface TokenVerifier {
  verify(token: string): Promise<BridgeClaims>;
}

export interface BridgeConfig {
  enabled: boolean;
  /** Keycloak realm issuer, e.g. https://auth.example.com/realms/solution-innovation. */
  issuer?: string;
  /** OIDC public client the CLI uses; checked against azp / aud. */
  clientId: string;
  /**
   * Email domains whose verified addresses may use the bridge. Defaults to
   * `litellm.userIdDomain` when that is set; with neither, the bridge rejects
   * every caller (fail closed).
   */
  allowedEmailDomains: string[];
}

export function readBridgeConfig(config: Config): BridgeConfig {
  const enabled =
    config.getOptionalBoolean('litellm.bridge.enabled') ?? false;
  const issuer = config.getOptionalString('litellm.bridge.issuer');
  const clientId =
    config.getOptionalString('litellm.bridge.clientId') ?? 'abby-cli';
  const allowedEmailDomains = (
    config.getOptionalStringArray('litellm.bridge.allowedEmailDomains') ?? []
  ).map(d => d.trim().toLowerCase()).filter(Boolean);
  return { enabled, issuer, clientId, allowedEmailDomains };
}

/** Thrown when the bridge is misconfigured (e.g. enabled without an issuer). */
export class BridgeConfigError extends Error {}

/** Thrown when a presented token fails verification → maps to HTTP 401. */
export class BridgeAuthError extends Error {
  readonly status = 401;
}

/** Thrown when the caller's identity fails validation (e.g. email domain mismatch) → maps to HTTP 403. */
export class BridgeIdentityError extends Error {
  readonly status = 403;
}

export interface KeycloakJWTVerifierOptions {
  issuer: string;
  clientId: string;
}

/**
 * Verifies a Keycloak access token against the realm JWKS and ensures it was
 * issued for {@link clientId} (via azp, falling back to aud). Uses jose's
 * remote JWKS client (cached, with cooldown on errors).
 */
export class KeycloakJWTVerifier implements TokenVerifier {
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(opts: KeycloakJWTVerifierOptions) {
    this.issuer = opts.issuer.replace(/\/$/, '');
    this.clientId = opts.clientId;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/protocol/openid-connect/certs`),
    );
  }

  async verify(token: string): Promise<BridgeClaims> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
      });
      payload = result.payload;
    } catch (err) {
      // Expired, bad signature, wrong issuer, malformed, JWKS unreachable, etc.
      throw new BridgeAuthError(
        `invalid keycloak token: ${(err as Error).message ?? err}`,
      );
    }
    const azp = (payload as Record<string, unknown>).azp as
      | string
      | undefined;
    const aud = payload.aud;
    const audMatches = Array.isArray(aud)
      ? aud.includes(this.clientId)
      : aud === this.clientId;
    if (azp !== this.clientId && !audMatches) {
      throw new BridgeAuthError(
        `token not issued for client "${this.clientId}" (azp=${azp ?? 'none'})`,
      );
    }
    // Keycloak marks the token kind in the PAYLOAD `typ` claim ('Bearer' for
    // access tokens, 'ID' for ID tokens); the JWT header `typ` is just 'JWT'.
    // Reject anything that isn't an access token.
    const typ = (payload as Record<string, unknown>).typ as string | undefined;
    if (typ && typ !== 'Bearer') {
      throw new BridgeAuthError(
        `token type must be Bearer or absent, got: ${typ}`,
      );
    }
    return {
      sub: payload.sub ?? '',
      email: payload.email as string | undefined,
      email_verified: (payload as Record<string, unknown>).email_verified as boolean | undefined,
      preferred_username: (payload as Record<string, unknown>)
        .preferred_username as string | undefined,
      name: payload.name as string | undefined,
      azp,
      aud,
      typ,
    };
  }
}

/** Builds the default verifier from config, or throws BridgeConfigError. */
export function newDefaultVerifier(cfg: BridgeConfig): TokenVerifier {
  if (!cfg.issuer) {
    throw new BridgeConfigError(
      'litellm.bridge.issuer is required when litellm.bridge.enabled is true ' +
        '(e.g. https://auth.example.com/realms/solution-innovation)',
    );
  }
  return new KeycloakJWTVerifier({ issuer: cfg.issuer, clientId: cfg.clientId });
}

/**
 * How the bridge maps a verified token to a LiteLLM user.
 * - `userIdDomain`: the same `litellm.userIdDomain` the UI uses to build ids.
 * - `trustedEmailDomains`: email domains allowed to use the bridge; defaults to
 *   `[userIdDomain]` when that is set.
 */
export interface BridgeIdentityOptions {
  userIdDomain?: string;
  trustedEmailDomains?: string[];
}

function normalizeIdentityOptions(
  opts: BridgeIdentityOptions,
): { userIdDomain?: string; trusted: string[] } {
  let domains: string[] = [];
  if (opts.trustedEmailDomains?.length) {
    domains = opts.trustedEmailDomains;
  } else if (opts.userIdDomain) {
    domains = [opts.userIdDomain];
  }
  const trusted = domains.map(d => d.toLowerCase());
  return { userIdDomain: opts.userIdDomain, trusted };
}

/**
 * Resolves the LiteLLM user_id for a verified bridge token.
 *
 * Two separate questions, answered separately:
 * 1. Is this person allowed in? The token must carry a *verified* email whose
 *    domain is in the trusted list (`litellm.bridge.allowedEmailDomains`,
 *    defaulting to `litellm.userIdDomain`). With no trusted domain configured
 *    everyone is rejected (fail closed). Failure → 403.
 * 2. Which LiteLLM user are they? The same one the UI addresses: the Backstage
 *    user entity name (the Keycloak `preferred_username`) run through the same
 *    `litellm.userIdDomain` rule the UI applies. Using the email local part
 *    here would address a different user whenever a Keycloak username differs
 *    from the email (and would provision a duplicate). The realm is the same
 *    IdP Backstage signs users in with, so its usernames are the entity names.
 *
 *    When `preferred_username` is email-shaped (contains '@') and its domain
 *    is in the trusted list, we extract the local part and use that as the
 *    username instead. This handles the Abby CLI case where `preferred_username`
 *    is the full email.
 *
 * @throws BridgeIdentityError (403) if identity validation fails
 */
export function resolveBridgeUserId(
  claims: BridgeClaims,
  identity?: BridgeIdentityOptions,
): string {
  const { userIdDomain, trusted } = normalizeIdentityOptions(identity ?? {});
  if (trusted.length === 0) {
    throw new BridgeIdentityError(
      'set litellm.bridge.allowedEmailDomains (or litellm.userIdDomain) to use the CLI bridge',
    );
  }
  if (!claims.email) {
    throw new BridgeIdentityError('no email found in token');
  }
  if (claims.email_verified !== true) {
    throw new BridgeIdentityError('email is not verified');
  }
  const parts = claims.email.split('@');
  if (parts.length !== 2 || !parts[0]) {
    throw new BridgeIdentityError('malformed email in token');
  }
  const [emailLocalPart, domain] = parts;
  if (!trusted.includes(domain.toLowerCase())) {
    throw new BridgeIdentityError(
      `email domain mismatch: "${domain}" is not allowed for this deployment`,
    );
  }
  let name = claims.preferred_username?.trim();
  // If preferred_username is email-shaped and its domain is trusted, use the
  // local part so the CLI (which uses full email as preferred_username) maps
  // to the same user as the UI (which uses bare entity name).
  if (name && name.includes('@')) {
    const usernameParts = name.split('@');
    if (usernameParts.length === 2 && usernameParts[0]) {
      const [userLocal, userDomain] = usernameParts;
      if (trusted.includes(userDomain.toLowerCase())) {
        name = userLocal;
      }
    }
  }
  name = name || emailLocalPart;
  return toLiteLLMUserId(name, userIdDomain);
}

/**
 * Ensures a LiteLLM user exists for the verified identity. If the user is
 * missing and provisioning is enabled, creates it from the JWT claims (email +
 * name); if provisioning is disabled, throws a 404 telling the caller to log
 * in to Backstage first (the UI is the primary provisioning entry point).
 *
 * When the computed userId is not found, before provisioning we also search
 * for an existing user by email. This handles the case where a UI user (created
 * with a bare entity name) is accessed via the CLI (which uses email-shaped
 * preferred_username), and helps recover from cases where the bridge's userId
 * computation and the UI's differ.
 */
export async function getOrProvisionUserFromClaims(
  client: LiteLLMClient,
  claims: BridgeClaims,
  provisioningEnabled: boolean,
  provisioningDefaults: ProvisioningDefaults,
  logger: LoggerService,
  identity?: BridgeIdentityOptions,
): Promise<UserInfo> {
  const userId = resolveBridgeUserId(claims, identity);
  const existing = await client.getUserInfo(userId);
  if (existing) return existing;

  // Before provisioning, try to find an existing user by email.
  // This handles the case where the UI created a user under a different ID
  // (e.g. bare entity name) but the same email.
  if (claims.email) {
    const byEmail = await client.getUserByEmail(claims.email);
    if (byEmail) {
      logger.info(
        `Found existing LiteLLM user ${byEmail.user_id} by email ${claims.email}, reusing for ${userId}`,
      );
      return byEmail;
    }
  }

  if (!provisioningEnabled) {
    throw new ProvisioningError(
      'User not found in LiteLLM',
      'No LiteLLM user for this identity. Log in to Backstage once to be provisioned, or enable litellm.provisioning.enabled.',
      false,
    );
  }

  const profile = {
    email: claims.email ?? claims.preferred_username,
    displayName: claims.name ?? claims.preferred_username,
  };
  const created = await provisionUser(
    client,
    userId,
    provisioningDefaults,
    profile,
    undefined,
    logger,
  );
  if (!created) {
    throw new ProvisioningError(
      'User not found in LiteLLM',
      'Provisioning attempted but returned no user — check LiteLLM logs',
      true,
      500,
    );
  }
  return created;
}

/** Lists the caller's virtual keys (provisioning the user first if needed). */
export async function bridgeListKeys(
  client: LiteLLMClient,
  claims: BridgeClaims,
  provisioningEnabled: boolean,
  provisioningDefaults: ProvisioningDefaults,
  logger: LoggerService,
  identity?: BridgeIdentityOptions,
): Promise<VirtualKey[]> {
  const user = await getOrProvisionUserFromClaims(
    client,
    claims,
    provisioningEnabled,
    provisioningDefaults,
    logger,
    identity,
  );
  return client.listKeys(user.user_id);
}

