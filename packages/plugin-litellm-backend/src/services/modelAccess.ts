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
  const byName = new Map(catalogue.map(m => [m.model_name, m]));
  return notLiteral.filter(name =>
    !isModelAllowed(byName.get(name) ?? { model_name: name }, allowed),
  );
}
