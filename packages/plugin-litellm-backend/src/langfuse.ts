import { Config } from '@backstage/config';

/**
 * Generic Langfuse Metrics API v2 integration (litellm.langfuse.*).
 *
 * Powers the "Quality scores" card on the Insights tab with independent
 * answer-quality data. Nothing here is bound to a specific deployment:
 * the server version and the trace↔user join key vary, so a misconfigured
 * or v3 server degrades to `{configured:false}` instead of erroring.
 */
export interface LangfuseConfig {
  /** Mount GET /insights/quality and query Langfuse. Default false. */
  enabled: boolean;
  /** Langfuse host, e.g. https://langfuse.example.com. */
  baseUrl: string | null;
  /** Langfuse public key (Basic-auth username). */
  publicKey: string | null;
  /** Langfuse secret key (Basic-auth password). */
  secretKey: string | null;
  /**
   * The Langfuse observation field holding the LiteLLM user id, e.g.
   * 'userId'. Deployments whose agents tag traces differently change this
   * one key. Default 'userId'.
   */
  userIdField: string;
}

export function readLangfuseConfig(config: Config): LangfuseConfig {
  const enabled =
    config.getOptionalBoolean('litellm.langfuse.enabled') ?? false;
  return {
    enabled,
    baseUrl: config.getOptionalString('litellm.langfuse.baseUrl') ?? null,
    publicKey: config.getOptionalString('litellm.langfuse.publicKey') ?? null,
    secretKey: config.getOptionalString('litellm.langfuse.secretKey') ?? null,
    userIdField:
      config.getOptionalString('litellm.langfuse.userIdField') ?? 'userId',
  };
}

/** True only when the integration is enabled AND fully credentialed. */
export function isLangfuseConfigured(
  cfg: LangfuseConfig,
): cfg is LangfuseConfig & {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
} {
  return (
    cfg.enabled && !!cfg.baseUrl && !!cfg.publicKey && !!cfg.secretKey
  );
}
