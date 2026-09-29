import { VirtualKey, ModelInfo, GenerateKeyRequest, UpdateKeyRequest } from '../types';
import { fmtInt } from '../format';

export const generateDefaultAlias = (username?: string): string => {
  const base = (username || 'user')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
  const hash = Math.random().toString(36).slice(2, 8);
  return `${base}-${hash}`;
};

export const createForm = (username?: string): GenerateKeyRequest => ({
  alias: generateDefaultAlias(username),
  models: [],
  duration: '30d',
  max_budget: 100,
  tpm_limit: undefined,
  rpm_limit: undefined,
  team_id: undefined,
  key_type: 'llm_api',
});

export const editForm = (k: VirtualKey): UpdateKeyRequest => ({
  key_alias: k.key_alias ?? '',
  models: k.models ?? [],
  max_budget: k.max_budget,
  tpm_limit: k.tpm_limit,
  rpm_limit: k.rpm_limit,
});

// LiteLLM sentinel: a team's `models` list is `["all-proxy-models"]` when the
// team isn't restricted to specific models. A team's `models` entries can
// also be access-group names (see litellm model_info.access_groups) rather
// than literal model_name values. Treating either case as a literal
// model_name allowlist matches nothing, which previously made the whole
// "Models" field disappear for such teams.
const ALL_PROXY_MODELS = 'all-proxy-models';

export function isModelAllowedByTeam(model: ModelInfo, teamModels?: string[]): boolean {
  if (!teamModels || teamModels.length === 0) return true;
  if (teamModels.includes(ALL_PROXY_MODELS)) return true;
  if (teamModels.includes(model.model_name)) return true;
  return !!model.access_groups?.some(group => teamModels.includes(group));
}

export function aliasHelperText(aliasError: boolean, aliasDuplicate: boolean): string | undefined {
  if (aliasError) return 'Alias is required';
  if (aliasDuplicate) return 'This alias is already used by one of your keys — LiteLLM requires aliases to be unique across all keys';
  return undefined;
}

export function teamHelperText(teamError: boolean, teamRequired: boolean): string {
  if (teamError) return 'Team is required';
  if (teamRequired) return 'Bind this key to a team for scoped access';
  return 'Optional: bind this key to a specific team for scoped access';
}

export function budgetHelperText(budgetInvalid: boolean, budgetEstimate: number | null, unlimited: boolean): string | undefined {
  if (budgetInvalid && !unlimited) return 'Enter a positive budget or tick "Unlimited"';
  if (budgetEstimate !== null) return `≈ ${fmtInt(budgetEstimate)} tokens at the priciest selected model`;
  return 'Lifetime cap for this key. It never resets';
}

