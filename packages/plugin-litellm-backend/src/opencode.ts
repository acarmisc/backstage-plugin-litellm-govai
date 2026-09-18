import { Config } from '@backstage/config';

/**
 * Configuration for the OpenCode SSO-connect integration (litellm.opencode.*).
 *
 * The connect flow is served by the opencode-portal-auth plugin client-side:
 * the user runs /connect in OpenCode, a browser opens
 *   GET {baseUrl}/api/litellm/opencode/connect?team=...&redirect_uri=...
 * and this backend generates (or reuses) a LiteLLM virtual key bound to the
 * signed-in Backstage user and, optionally, one of their teams, then 302s
 * back to the local OpenCode callback listener.
 */
export interface OpencodeConfig {
  /** Route is mounted only when true. Default false. */
  enabled: boolean;
  /**
   * Default duration for freshly generated keys, in LiteLLM format
   * (e.g. "30d"). Users can re-connect to rotate. Default '30d'.
   */
  keyDuration: string;
  /** Default max budget (USD) for keys created via the connect flow. Default 50. */
  maxBudget: number;
  /**
   * When true, a team query parameter must reference a team the user is a
   * member of (or manage); otherwise the key is personal-only.
   */
  requireTeam: boolean;
  /** Extra metadata stamped on keys created via this flow. */
  metadata: Record<string, string>;
}

export function readOpencodeConfig(config: Config): OpencodeConfig {
  const enabled = config.getOptionalBoolean('litellm.opencode.enabled') ?? false;
  return {
    enabled,
    keyDuration:
      config.getOptionalString('litellm.opencode.keyDuration') ?? '30d',
    maxBudget: config.getOptionalNumber('litellm.opencode.maxBudget') ?? 50,
    requireTeam:
      config.getOptionalBoolean('litellm.opencode.requireTeam') ?? false,
    metadata:
      config.getOptional<Record<string, string>>(
        'litellm.opencode.metadata',
      ) ?? {},
  };
}