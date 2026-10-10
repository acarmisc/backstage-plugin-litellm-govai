# @acarmisc/backstage-plugin-litellm-common

Shared, dependency-light code for the LiteLLM Backstage plugin packages. This
changelog is maintained by hand.

## 0.2.0

### Minor Changes

- feat: `createGenerateKeyInputSchema` accepts an optional `budget_duration`
  (how often a key's budget resets), bounded by the new
  `KeyValidationConfig.allowedBudgetDurations` (default
  `DEFAULT_KEY_BUDGET_DURATIONS`: `1d`, `7d`, `30d`, `1mo`; an empty list
  allows any `<n><s|m|h|d|mo>`). `GenerateKeyRequest` gains the field (#88).
- feat: new `litellm.team.usage.read` permission
  (`litellmTeamUsageReadPermission`) and the `TeamMemberUsage` /
  `TeamMemberUsageRow` types for the per-member team usage breakdown (#86).

## 0.1.0

### Minor Changes

- Initial release: the `litellm.*` permissions (including the new
  `litellm.key.resetSpend` and `litellm.key.unblock`), the strict zod schemas for
  key generate/update, `DEFAULT_KEY_DURATIONS`, the shared API-contract types and
  the budget-status thresholds (`budgetStatusForPct`).
