import { z } from 'zod';

/**
 * Configuration for key validation ceilings and allowed values.
 */
export interface KeyValidationConfig {
  maxBudget: number;
  maxTpm: number;
  maxRpm: number;
  allowedDurations: string[];
}

/**
 * Creates a strict Zod schema for GenerateKeyInput validation.
 * Rejects unknown fields and enforces server-side ceilings.
 *
 * @param config Server configuration with ceiling values and allowed durations
 * @returns A Zod object schema that validates the input
 */
export function createGenerateKeyInputSchema(config: KeyValidationConfig) {
  // When allowedDurations is set, restrict to that list.
  // Otherwise, allow any string matching the duration format regex.
  const durationSchema = config.allowedDurations.length > 0
    ? z.string().refine(
        (val) => config.allowedDurations.includes(val),
        {
          message: `duration must be one of: ${config.allowedDurations.join(', ')}`,
        },
      )
    : z.string().regex(/^\d+[smhdwy]$/, {
        message: 'duration must match format <number><unit> (e.g. "30d", "1h")',
      });

  return z
    .object({
      alias: z
        .string()
        .trim()
        .min(1, 'alias is required')
        .max(128, 'alias must be at most 128 characters'),
      models: z
        .array(z.string())
        .max(100, 'models array is too large')
        .optional(),
      duration: durationSchema.optional(),
      max_budget: z
        .number()
        .positive('max_budget must be a positive number')
        .max(config.maxBudget, `max_budget must not exceed ${config.maxBudget}`)
        .nullable()
        .optional(),
      tpm_limit: z
        .number()
        .int('tpm_limit must be an integer')
        .positive('tpm_limit must be a positive number')
        .max(config.maxTpm, `tpm_limit must not exceed ${config.maxTpm}`)
        .optional(),
      rpm_limit: z
        .number()
        .int('rpm_limit must be an integer')
        .positive('rpm_limit must be a positive number')
        .max(config.maxRpm, `rpm_limit must not exceed ${config.maxRpm}`)
        .optional(),
      team_id: z.string().optional(),
      // The UI always sends 'llm_api'; no other key type may be requested.
      key_type: z.literal('llm_api').optional(),
      metadata: z
        .record(z.string(), z.string())
        .optional(),
    })
    .strict();
}

export type GenerateKeyInput = z.infer<
  ReturnType<typeof createGenerateKeyInputSchema>
>;
