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
import { LiteLLMClient } from './client';
import {
  GenerateKeyRequest,
  GenerateKeyResponse,
  ProvisioningDefaults,
  UserInfo,
  VirtualKey,
} from './types';
import { ProvisioningError, provisionUser } from './provisioning';

/** Claims extracted from a verified Keycloak access token. */
export interface BridgeClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  /** Authorized party — Keycloak sets this to the client_id of the requester. */
  azp?: string;
  aud?: string | string[];
}

/** A token verifier pluggable for tests. */
export interface TokenVerifier {
  verify(token: string): Promise<BridgeClaims>;
}

export interface BridgeConfig {
  enabled: boolean;
  /** Keycloak realm issuer, e.g. https://auth.ces.abssrv.it/realms/solution-innovation. */
  issuer?: string;
  /** OIDC public client the CLI uses; checked against azp / aud. */
  clientId: string;
}

export function readBridgeConfig(config: Config): BridgeConfig {
  const enabled =
    config.getOptionalBoolean('litellm.bridge.enabled') ?? false;
  const issuer = config.getOptionalString('litellm.bridge.issuer');
  const clientId =
    config.getOptionalString('litellm.bridge.clientId') ?? 'abby-cli';
  return { enabled, issuer, clientId };
}

/** Thrown when the bridge is misconfigured (e.g. enabled without an issuer). */
export class BridgeConfigError extends Error {}

/** Thrown when a presented token fails verification → maps to HTTP 401. */
export class BridgeAuthError extends Error {
  readonly status = 401;
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
    return {
      sub: payload.sub ?? '',
      email: payload.email as string | undefined,
      preferred_username: (payload as Record<string, unknown>)
        .preferred_username as string | undefined,
      name: payload.name as string | undefined,
      azp,
      aud,
    };
  }
}

/** Builds the default verifier from config, or throws BridgeConfigError. */
export function newDefaultVerifier(cfg: BridgeConfig): TokenVerifier {
  if (!cfg.issuer) {
    throw new BridgeConfigError(
      'litellm.bridge.issuer is required when litellm.bridge.enabled is true ' +
        '(e.g. https://auth.ces.abssrv.it/realms/solution-innovation)',
    );
  }
  return new KeycloakJWTVerifier({ issuer: cfg.issuer, clientId: cfg.clientId });
}

/** Picks the LiteLLM user_id from the verified claims (email → username → sub). */
export function resolveBridgeUserId(claims: BridgeClaims): string {
  return claims.email ?? claims.preferred_username ?? claims.sub;
}

/**
 * Ensures a LiteLLM user exists for the verified identity. If the user is
 * missing and provisioning is enabled, creates it from the JWT claims (email +
 * name); if provisioning is disabled, throws a 404 telling the caller to log
 * in to Backstage first (the UI is the primary provisioning entry point).
 */
export async function getOrProvisionUserFromClaims(
  client: LiteLLMClient,
  claims: BridgeClaims,
  provisioningEnabled: boolean,
  provisioningDefaults: ProvisioningDefaults,
  logger: { info: (...args: unknown[]) => void },
): Promise<UserInfo> {
  const userId = resolveBridgeUserId(claims);
  const existing = await client.getUserInfo(userId);
  if (existing) return existing;

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
  logger: { info: (...args: unknown[]) => void },
): Promise<VirtualKey[]> {
  await getOrProvisionUserFromClaims(
    client,
    claims,
    provisioningEnabled,
    provisioningDefaults,
    logger,
  );
  return client.listKeys(resolveBridgeUserId(claims));
}

/** Mints a new virtual key for the caller (provisioning the user first if needed). */
export async function bridgeGenerateKey(
  client: LiteLLMClient,
  claims: BridgeClaims,
  provisioningEnabled: boolean,
  provisioningDefaults: ProvisioningDefaults,
  logger: { info: (...args: unknown[]) => void },
  request: Partial<GenerateKeyRequest>,
): Promise<GenerateKeyResponse> {
  await getOrProvisionUserFromClaims(
    client,
    claims,
    provisioningEnabled,
    provisioningDefaults,
    logger,
  );
  const userId = resolveBridgeUserId(claims);
  const enriched: GenerateKeyRequest = {
    ...request,
    user_id: userId,
    metadata: {
      ...(request.metadata ?? {}),
      created_via: 'abby-cli',
      created_by: userId,
      created_at_iso: new Date().toISOString(),
    },
  };
  return client.generateKey(enriched);
}