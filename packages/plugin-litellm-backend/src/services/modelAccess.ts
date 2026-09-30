import { isModelAllowed, ALL_PROXY_MODELS } from '@acarmisc/backstage-plugin-litellm-common';
import type { LiteLLMClient } from '../client';

/**
 * Returns the requested models that the allow-list does not permit. The list is
 * the team's `models` (or the user's, without a team); entries may be literal
 * model names, access-group names, or the `all-proxy-models` sentinel — the same
 * rules the key form applies. Model metadata (for access groups) is only fetched
 * when a literal comparison isn't enough.
 */
export async function findDisallowedModels(
  client: Pick<LiteLLMClient, 'listModels'>,
  requested: string[],
  allowed: string[] | undefined,
): Promise<string[]> {
  if (!allowed || allowed.length === 0 || allowed.includes(ALL_PROXY_MODELS)) {
    return [];
  }
  const notLiteral = requested.filter(m => !allowed.includes(m));
  if (notLiteral.length === 0) return [];

  // Fail closed: if the model catalogue can't be read the error propagates.
  const catalogue = await client.listModels();
  // /model/info returns one row per deployment; a model name can appear several
  // times with different access groups, so merge them per name.
  const byName = new Map<string, { model_name: string; access_groups: string[] }>();
  for (const m of catalogue) {
    const entry = byName.get(m.model_name) ?? { model_name: m.model_name, access_groups: [] };
    entry.access_groups = [...new Set([...entry.access_groups, ...(m.access_groups ?? [])])];
    byName.set(m.model_name, entry);
  }
  return notLiteral.filter(name =>
    !isModelAllowed(byName.get(name) ?? { model_name: name }, allowed),
  );
}
