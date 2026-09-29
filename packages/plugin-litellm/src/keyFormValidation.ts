import { GenerateKeyRequest, UpdateKeyRequest } from './types';

export interface ValidationErrors {
  alias?: string;
  team?: string;
  budget?: string;
  duration?: string;
  models?: string;
}

export interface ValidationOptions {
  teamRequired?: boolean;
  /** True when the user has ticked the 'Unlimited budget' checkbox. */
  unlimitedBudget?: boolean;
  isCreate?: boolean;
}

/**
 * Validates a key form (create or edit mode).
 * Returns a map of field names to error messages.
 * A field with no error is absent from the map.
 */
export function validateKeyForm(
  formData: GenerateKeyRequest | UpdateKeyRequest,
  options: ValidationOptions = {},
): ValidationErrors {
  const {
    teamRequired = true,
    unlimitedBudget = false,
    isCreate = true,
  } = options;

  const errors: ValidationErrors = {};

  // Alias validation
  const alias = (isCreate ? (formData as GenerateKeyRequest).alias : (formData as UpdateKeyRequest).key_alias) ?? '';
  if (!alias.trim()) {
    errors.alias = 'Alias is required';
  }
  // A duplicate alias is only a warning in the UI (see aliasDuplicate), never a blocking error.

  // Team validation (create mode only)
  if (isCreate) {
    const teamId = (formData as GenerateKeyRequest).team_id;
    if (teamRequired && !teamId) {
      errors.team = 'Team is required';
    }
  }

  // Budget validation
  const maxBudget = formData.max_budget;
  if (!unlimitedBudget && (maxBudget === undefined || maxBudget === null || maxBudget <= 0)) {
    errors.budget = 'Enter a positive budget or tick "Unlimited"';
  }

  return errors;
}

/**
 * Returns the first field with an error, in a consistent order.
 * Used to focus the first invalid field on submit.
 */
export function firstInvalidField(
  errors: ValidationErrors,
  isCreate: boolean = true,
): string | null {
  const fieldOrder = isCreate
    ? ['team', 'alias', 'budget', 'duration', 'models']
    : ['alias', 'budget', 'models'];

  for (const field of fieldOrder) {
    if (errors[field as keyof ValidationErrors]) {
      return field;
    }
  }
  return null;
}

/**
 * Compute the expiry date from a duration string and the current date.
 * Supported: 'd' (days), 'w' (weeks), 'm' (months), 'y' (years).
 * Example: expiryPreview('30d', new Date('2026-09-29')) => 'Expires Oct 29, 2026'
 */
export function expiryPreview(duration: string | undefined, now: Date = new Date()): string | null {
  if (!duration) return null;

  const match = duration.match(/^(\d+)([dwmy])$/);
  if (!match) return null;

  const [, countStr, unit] = match;
  const count = parseInt(countStr, 10);
  if (isNaN(count)) return null;

  const expiry = new Date(now);

  switch (unit) {
    case 'd':
      expiry.setDate(expiry.getDate() + count);
      break;
    case 'w':
      expiry.setDate(expiry.getDate() + count * 7);
      break;
    case 'm':
      expiry.setMonth(expiry.getMonth() + count);
      break;
    case 'y':
      expiry.setFullYear(expiry.getFullYear() + count);
      break;
    default:
      return null;
  }

  // Format as "Expires Oct 29, 2026"
  const month = expiry.toLocaleString('en-US', { month: 'short' });
  const day = expiry.getDate();
  const year = expiry.getFullYear();
  return `Expires ${month} ${day}, ${year}`;
}

/**
 * Find the priciest input cost among selected models.
 * Returns null if no models have pricing data.
 */
export function priciestInputPrice(
  selectedModels: Array<{ input_cost_per_token?: number }>,
): number | null {
  const inputCosts = selectedModels
    .map(m => m.input_cost_per_token)
    .filter((c): c is number => typeof c === 'number' && c > 0);
  if (inputCosts.length === 0) return null;
  return Math.max(...inputCosts);
}
