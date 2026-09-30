import { VirtualKey, ModelInfo, GenerateKeyRequest, UpdateKeyRequest } from '../types';
import { fmtInt } from '../format';
import { isModelAllowed } from '@acarmisc/backstage-plugin-litellm-common';

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
export function isModelAllowedByTeam(model: ModelInfo, teamModels?: string[]): boolean {
  return isModelAllowed(model, teamModels);
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


const sameStrings = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The fields of an edit that actually changed. Sending only these means an
 * untouched field (say a legacy budget above the current ceiling) can't make an
 * unrelated edit fail server-side validation. Returns `{}` when nothing changed.
 */
export function changedEditFields(
  original: UpdateKeyRequest,
  current: UpdateKeyRequest,
  unlimitedBudget: boolean,
): UpdateKeyRequest {
  const out: UpdateKeyRequest = {};
  if ((current.key_alias ?? '') !== (original.key_alias ?? '')) {
    out.key_alias = current.key_alias;
  }
  if (!sameStrings(current.models, original.models)) {
    out.models = current.models ?? [];
  }
  const nextBudget = unlimitedBudget ? null : current.max_budget;
  if ((nextBudget ?? null) !== (original.max_budget ?? null)) {
    out.max_budget = nextBudget;
  }
  if (current.tpm_limit !== original.tpm_limit) out.tpm_limit = current.tpm_limit;
  if (current.rpm_limit !== original.rpm_limit) out.rpm_limit = current.rpm_limit;
  return out;
}
