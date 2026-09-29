"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_KEY_DURATIONS = void 0;
exports.createGenerateKeyInputSchema = createGenerateKeyInputSchema;
exports.createUpdateKeyInputSchema = createUpdateKeyInputSchema;
const zod_1 = require("zod");
/**
 * Creates a strict Zod schema for GenerateKeyInput validation.
 * Rejects unknown fields and enforces server-side ceilings.
 *
 * @param config Server configuration with ceiling values and allowed durations
 * @returns A Zod object schema that validates the input
 */
function createGenerateKeyInputSchema(config) {
    // When allowedDurations is set, restrict to that list.
    // Otherwise, allow any string matching the duration format regex.
    const durationSchema = config.allowedDurations.length > 0
        ? zod_1.z.string().refine((val) => config.allowedDurations.includes(val), {
            message: `duration must be one of: ${config.allowedDurations.join(', ')}`,
        })
        : zod_1.z.string().regex(/^\d+[smhdwy]$/, {
            message: 'duration must match format <number><unit> (e.g. "30d", "1h")',
        });
    return zod_1.z
        .object({
        alias: zod_1.z
            .string()
            .trim()
            .min(1, 'alias is required')
            .max(128, 'alias must be at most 128 characters'),
        models: zod_1.z
            .array(zod_1.z.string())
            .max(100, 'models array is too large')
            .optional(),
        duration: durationSchema.optional(),
        max_budget: zod_1.z
            .number()
            .positive('max_budget must be a positive number')
            .max(config.maxBudget, `max_budget must not exceed ${config.maxBudget}`)
            .nullable()
            .optional(),
        tpm_limit: zod_1.z
            .number()
            .int('tpm_limit must be an integer')
            .positive('tpm_limit must be a positive number')
            .max(config.maxTpm, `tpm_limit must not exceed ${config.maxTpm}`)
            .optional(),
        rpm_limit: zod_1.z
            .number()
            .int('rpm_limit must be an integer')
            .positive('rpm_limit must be a positive number')
            .max(config.maxRpm, `rpm_limit must not exceed ${config.maxRpm}`)
            .optional(),
        team_id: zod_1.z.string().optional(),
        // The UI always sends 'llm_api'; no other key type may be requested.
        key_type: zod_1.z.literal('llm_api').optional(),
        metadata: zod_1.z
            .record(zod_1.z.string(), zod_1.z.string())
            .optional(),
    })
        .strict();
}
/**
 * Creates a strict Zod schema for UpdateKeyInput validation.
 * Only allows key_alias, models, max_budget, tpm_limit, and rpm_limit fields.
 * Rejects all other fields including team_id, user_id, spend, blocked, key, and budget_duration.
 *
 * @param config Server configuration with ceiling values
 * @returns A Zod object schema that validates the input
 */
function createUpdateKeyInputSchema(config) {
    return zod_1.z
        .object({
        key_alias: zod_1.z
            .string()
            .trim()
            .min(1, 'key_alias is required')
            .max(128, 'key_alias must be at most 128 characters')
            .optional(),
        models: zod_1.z
            .array(zod_1.z.string())
            .max(100, 'models array is too large')
            .optional(),
        max_budget: zod_1.z
            .number()
            .positive('max_budget must be a positive number')
            .max(config.maxBudget, `max_budget must not exceed ${config.maxBudget}`)
            .nullable()
            .optional(),
        tpm_limit: zod_1.z
            .number()
            .int('tpm_limit must be an integer')
            .positive('tpm_limit must be a positive number')
            .max(config.maxTpm, `tpm_limit must not exceed ${config.maxTpm}`)
            .optional(),
        rpm_limit: zod_1.z
            .number()
            .int('rpm_limit must be an integer')
            .positive('rpm_limit must be a positive number')
            .max(config.maxRpm, `rpm_limit must not exceed ${config.maxRpm}`)
            .optional(),
    })
        .strict();
}
/**
 * Default key duration presets. Used as server-side defaults and UI options.
 */
exports.DEFAULT_KEY_DURATIONS = ['1d', '7d', '30d', '90d'];
