# @acarmisc/backstage-plugin-litellm-common

Shared, dependency-light code for the LiteLLM Backstage plugin packages. This
changelog is maintained by hand.

## 0.10.0

### Minor Changes

- feat (#102): `UserInfo.managed_groups` and `UsersMonitoringLogs.scope`.

## 0.9.0

### Minor Changes

- feat: `UsersMonitoringLogs` is now `{ rows, truncated, teams }`, one `UserKeyUsage` per key (user, team, key alias, spend, tokens, requests). Breaking for the `data` field of the old shape.

## 0.8.0

### Minor Changes

- feat: `UsersMonitoringLogs` type; `SpendLogEntry` gains optional `userAgent` and `tags`.

## 0.7.0

### Minor Changes

- feat: `NEVER_KEY_DURATION` constant; `"never"` is accepted in `allowedDurations` and `formatDurationLabel('never')` returns "Never". Thanks @jozsefurak-seon (#96).

## 0.6.0

### Minor Changes

- feat: `TeamKeyUsage` and `TeamKeyUsageRow` types for a team's keys with
  per-key usage.

## 0.5.0

### Minor Changes

- feat: `mcp_servers` on the key-creation schema (names only, `[]` = none) and
  `object_permission` on `GenerateKeyRequest`, so a key can be bound to a subset
  of its team's MCP servers.

## 0.4.0

### Minor Changes

- feat: `QualityByModel`, `QualityScore`, `QualitySummary` and
  `QualityResponse` types for the Langfuse quality integration.

## 0.3.0

### Minor Changes

- feat: `InsightSummary`, `PracticeScore` and `ModelOpportunity` types for the
  Insights tab, plus the `SpendLogEntry` / `SpendLogsParams` /
  `PaginatedSpendLogs` contract for the spend-logs proxy.

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
