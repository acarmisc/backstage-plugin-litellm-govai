# @acarmisc/backstage-plugin-litellm-common

Shared, dependency-light code for the LiteLLM Backstage plugin packages. This
changelog is maintained by hand.

## 0.1.0

### Minor Changes

- Initial release: the `litellm.*` permissions (including the new
  `litellm.key.resetSpend` and `litellm.key.unblock`), the strict zod schemas for
  key generate/update, `DEFAULT_KEY_DURATIONS`, the shared API-contract types and
  the budget-status thresholds (`budgetStatusForPct`).
