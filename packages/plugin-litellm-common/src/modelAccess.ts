/**
 * LiteLLM sentinel: a team's (or user's) `models` list is `["all-proxy-models"]`
 * when it isn't restricted to specific models.
 */
export const ALL_PROXY_MODELS = 'all-proxy-models';

/**
 * Whether a model is allowed by an allow-list. The list is unrestricted when it
 * is empty/missing or contains the `all-proxy-models` sentinel. Entries may be
 * literal model names OR access-group names (litellm model_info.access_groups),
 * so a model also passes when one of its access groups is listed.
 */
export function isModelAllowed(
  model: { model_name: string; access_groups?: string[] },
  allowed?: string[],
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (allowed.includes(ALL_PROXY_MODELS)) return true;
  if (allowed.includes(model.model_name)) return true;
  return !!model.access_groups?.some(group => allowed.includes(group));
}
