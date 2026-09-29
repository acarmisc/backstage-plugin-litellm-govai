# Audit Remediation Plan

**Date:** 2026-09-29
**Source:** two-part audit (1: Backstage best practices / security / code quality, 2: UX/UI of main page and homepage widgets)
**Packages:** `packages/plugin-litellm-backend` (BE), `packages/plugin-litellm` (FE), new `packages/plugin-litellm-common` (COMMON)

File references are relative to each package's `src/`. Line numbers are the ones at audit time and will drift. Re-locate each one before you edit.

---

## 0. Guiding principles

1. **Security first, in isolation.** Phase 1 ships as small, reviewable PRs, each with regression tests that prove the hole is closed.
2. **Tests before refactors.** Phase 1 tests guard the large refactor in Phase 3.
3. **Server is the source of truth.** Every governance rule in the UI (budget, team, models, duration) must also be enforced in the backend.
4. **Every item has a definition of done.** Each task below lists acceptance criteria (AC).
5. **Suggested PR boundaries** are marked `PR-x`.

## Phase overview

| Phase | Theme | PRs | Risk if skipped | Rough size |
|---|---|---|---|---|
| 1 | Security hardening (backend) | PR-1 … PR-7 | Critical: privilege escalation, budget bypass | L |
| 2 | Critical UX fixes | PR-8 … PR-11 | Lost keys, wrong numbers, misleading empty states | M |
| 3 | Architecture & Backstage conventions | PR-12 … PR-17 | Maintainability, drift, duplicate requests | L |
| 4 | UX polish: main page | PR-18 … PR-21 | Usability, accessibility | M |
| 5 | Homepage widgets | PR-22 … PR-25 | Homepage integration, responsiveness | M |
| 6 | Tests, docs, cleanup | PR-26 … PR-28 | Regressions, stale docs | S–M |

Dependencies: Phase 1 → Phase 3 (the router split relies on the Phase 1 tests). PR-12 (common package) → PR-13, PR-22. PR-15 (shared profile hook) → PR-10, PR-23. Phases 2, 4 and 5 can run in parallel with Phase 3 once PR-12 and PR-15 have landed.

---

## Phase 1: Security hardening (backend)

### PR-1 · Require a user principal; drop the client-supplied `user_id` fallback (Critical, C1)

**Problem:** `resolveUserId` (`provisioning.ts:123-139`) returns `undefined` for service or external-access principals, and routes then fall back to `req.query.user_id`. Affected: `router.ts:294` (`/user/info`), `:333` (`/keys`), `:376` (`authorizeKeyAction`), `:858` (`/teams`), `:1663` (`/usage`); `client.ts:700` (`getUsage` with empty user → org-wide query).

**Tasks**
- [ ] Inject `coreServices.httpAuth` (and `coreServices.userInfo` if needed) into the router (`plugin.ts`, `router.ts` options).
- [ ] Replace `resolveUserId` with `resolveUser(req)`:
  ```ts
  const creds = await httpAuth.credentials(req, { allow: ['user'] });
  return toLiteLLMUserId(creds.principal.userEntityRef, userIdDomain);
  ```
  This throws `NotAllowedError` / 401 for non-user principals.
- [ ] Remove every read of `req.query.user_id` / `req.body.user_id` on user-scoped routes.
- [ ] `client.getUsage(userId)` throws if `userId` is empty. It never calls `/user/daily/activity` unfiltered.
- [ ] Decide on service-to-service needs (see Open Questions §Q1). If there are any, add a separate, explicitly permission-gated admin route. Do not reuse the user routes.

**Tests (`router.test.ts`)**
- A service principal calling `GET /keys?user_id=alice` gets 401/403.
- `POST /keys/:id/update?user_id=alice` from user bob, for a key owned by alice, gets 403.
- `GET /usage` never calls upstream without `user_id` (mock client asserts).

**AC:** no route in `router.ts` reads `user_id` from the query or body for identity. `grep -n "query.user_id\|body.user_id" router.ts` returns nothing relevant.

---

### PR-2 · Validated, allow-listed key generation (High, H1)

**Problem:** `router.ts:436-501` spreads `{...body}` into `/key/generate` under the master key. `allowUnlimitedBudget` and `teamRequired` (`:160-161`) are enforced only in the UI.

**Tasks**
- [ ] Add a `zod` dependency to BE (the FE already uses it). Create `validation/keySchemas.ts` (it moves to COMMON in PR-12):
  ```ts
  export const GenerateKeyInput = z.object({
    alias: z.string().trim().min(1).max(128),
    models: z.array(z.string()).max(100).optional(),
    duration: z.string().regex(/^\d+[smhdwy]$/).optional(), // or enum of allowed presets
    max_budget: z.number().positive().max(cfg.maxKeyBudget).nullable().optional(),
    tpm_limit: z.number().int().positive().max(cfg.maxTpm).optional(),
    rpm_limit: z.number().int().positive().max(cfg.maxRpm).optional(),
    team_id: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }).strict();
  ```
- [ ] Build the upstream request explicitly from parsed fields. Never spread the raw body. Set `user_id` from the principal.
- [ ] Enforce config flags on the server:
  - `allowUnlimitedBudget === false` → reject null or missing `max_budget` with `InputError`.
  - `teamRequired === true` → reject a missing `team_id`.
  - `team_id` must be in `userInfo.teams`.
  - `models` must be a subset of the user's allowed models (or the team's models when `team_id` is set).
- [ ] Add config keys `litellm.keys.maxBudget`, `maxTpm`, `maxRpm`, `allowedDurations` to `config.d.ts` with defaults.
- [ ] Merge metadata server-side: server-owned keys (`created_by`, `source`) overwrite client values.

**Tests:** unknown field → 400; `max_budget: null` with `allowUnlimitedBudget=false` → 400; foreign `team_id` → 403; disallowed model → 400; invalid duration → 400; happy path sends only the allowed fields upstream (mock assertion on the exact payload).

**AC:** no `...req.body` / `...body` spread into any upstream LiteLLM call.

---

### PR-3 · Validated key update (High, H2)

**Problem:** `router.ts:702` sends `{ ...req.body, key: keyId }` to `/key/update`.

**Tasks**
- [ ] Add a `UpdateKeyInput` schema: `key_alias`, `models`, `max_budget`, `tpm_limit`, `rpm_limit` only, `.strict()`.
- [ ] Explicitly reject `team_id`, `user_id`, `spend`, `blocked`, `key`, `budget_duration` (strict schema → 400).
- [ ] Reuse the PR-2 checks for model subset and budget ceiling. The model subset uses the key's existing `team_id`.

**Tests:** attempt to change `team_id` → 400; set `spend: 0` → 400; valid alias change → only allowed fields sent.

---

### PR-4 · Gate reset-spend and unblock (High, H3)

**Problem:** `router.ts:757-795`: owners can reset spend and unblock admin-blocked keys, with only `litellm.key.manage` (allowed by default).

**Tasks**
- [ ] New permissions in `permissions.ts` (moves to COMMON): `litellm.key.resetSpend`, `litellm.key.unblock`.
- [ ] Document that they must be granted explicitly by the policy. Add a `litellm.keys.allowOwnerResetSpend` config flag (default `false`) and enforce it before the permission check, so it fails closed even with the allow-all policy.
- [ ] Block: write `metadata.blocked_by = <userEntityRef>` and `blocked_at`.
- [ ] Unblock: allowed for the owner only if `metadata.blocked_by === caller`; otherwise requires `litellm.key.unblock`.
- [ ] FE: hide the Reset spend and Unblock buttons when the action isn't permitted (needs the COMMON permissions and `usePermission`, so this ships after PR-12, or behind a simple `/config` capability flag for now).

**Tests:** owner reset-spend with the default config → 403; owner unblocks an admin-blocked key → 403; owner unblocks a self-blocked key → 200.

---

### PR-5 · Authorize team usage (High, H4)

**Problem:** `router.ts:1608-1651` `GET /teams/:teamId/usage` has no membership check.

**Tasks**
- [ ] Require `teamId ∈ userInfo.teams`, OR that the caller passes `authorizeTeamSubresource` (group-owned team manager).
- [ ] Unknown team or non-member → 404 (don't leak existence) or 403. Choose one and keep it consistent with the other team routes.
- [ ] Keep the existing budget redaction afterwards.

**Tests:** non-member → 403/404; member → 200; manager of an owning group → 200.

---

### PR-6 · Unify the bridge with the UI key-creation path (High, H5 + Medium bridge identity)

**Problem:** `bridge.ts:246-256` skips permissions, config flags, team validation, role configs and single-flight provisioning. `bridge.ts:149-156` merges identities across domains.

**Tasks**
- [ ] Extract `services/keyService.ts#createKeyForUser(user, input, ctx)`, which runs the PR-2 schema, flag enforcement, permission check, provisioning (single-flight, role configs) and the upstream call.
- [ ] Router `/keys/generate` and the bridge both call it. The bridge builds a `user` from the verified token.
- [ ] Identity mapping:
  - Prefer `email` with `email_verified === true` whose domain equals `userIdDomain`. Otherwise reject.
  - Never strip an arbitrary domain from `preferred_username`.
  - Optionally map on `sub` through a configured claim.
- [ ] Reject tokens where `typ !== 'Bearer'` (ID tokens).
- [ ] Remove jose error details from the 401 `hint` (`router.ts:1723`). Log them server-side instead.

**Tests:** `alice@evil.com` token → 403; unverified email → 403; ID token → 401; bridge generate with `max_budget: null` and `allowUnlimitedBudget=false` → 400.

---

### PR-7 · Error sanitization, OpenCode fix, snippet and info leaks (Medium/Low)

**Tasks**
- [ ] **Central error mapper** `errors.ts#toHttpError(err)`:
  - Upstream 401/403 → 502 `"LiteLLM rejected the request"`, so the Backstage session is never logged out.
  - Upstream 5xx / network → 502 with a generic message.
  - Upstream 4xx → 400 with `sanitizeUpstreamMessage()`, capped at 500 chars, HTML stripped.
  - Replace all ~20 `res.status(500).json({ error: error.message })` with thrown `@backstage/errors` types and the error middleware (see PR-14).
  - Change `client.ts:51` to never embed the raw non-JSON body. Log it at `debug` instead.
- [ ] **OpenCode connect** (`router.ts:637-638`): stop returning `reusable.token` (the hash). Rotate instead: call `/key/regenerate` or delete and generate a new one. If the route must be reachable by browser navigation, convert it to a `POST` with a confirmation page. Don't add cookie auth to a key-minting GET (CSRF).
- [ ] **Claude Code snippet Option 2** (`KeyFormDialog.tsx:174-183`, FE): remove it, or replace it with an `apiKeyHelper` that reads from the OS keychain (`security find-generic-password …` / `secret-tool lookup …`). No `/key/generate` in the helper and no plaintext key in `~/bin`.
- [ ] `/config` (`router.ts:154`): return `publicBaseUrl` only. If it's unset, return `null` and have the FE show "Endpoint not configured" rather than the internal `baseUrl`.
- [ ] `provisioning.ts:234`: log the user id at `debug`, or hash it at `info`.
- [ ] Document in the README that `metadata.owning_group` is trusted and editable by LiteLLM admins.

**Tests:** upstream 401 → BE 502; upstream HTML 500 body not present in the response; OpenCode reconnect returns a new key value (not a hash).

---

## Phase 2: Critical UX fixes

### PR-8 · Protect the one-time secret (`KeyFormDialog.tsx:584-612, 463-465`)

- [ ] While `newKeyValue` is set: `disableEscapeKeyDown`, and `onClose` ignores `backdropClick`/`escapeKeyDown`.
- [ ] Replace the grey text with `<Alert severity="warning">Copy this key now. It will never be shown again.</Alert>`.
- [ ] Add a `useCopyToClipboard()` hook (FE `hooks/`): async, returns `{copy, copied, error}`, shows "Copied" (check icon, 2s), and reports failure via `alertApi`. Use it everywhere: `KeysTable.tsx:231`, the snippet copy `KeyFormDialog.tsx:249-256`, and the secret copy.
- [ ] "Done" when not yet copied opens a confirm: "You haven't copied the key. Close anyway?"
- [ ] `aria-label="Copy API key"` plus a Tooltip.

**AC:** Esc and backdrop can't dismiss the secret; copy gives visible and screen-reader feedback; there's a confirmation when closing uncopied.

### PR-9 · Errors are not empty states (`LiteLLMPage.tsx:119-190`, `UsageStats.tsx:103`, `KeyFormDialog.tsx:709`)

- [ ] Keep the `error` from each fetch (keys, usage, models, teams) instead of coercing to `[]`.
- [ ] Render `<ResponseErrorPanel>` (or `<Alert action={<Button onClick={retry}>Retry</Button>}>`) in place of the view's content.
- [ ] Header counts: show "–" instead of "0" when keys failed.
- [ ] Key form: if models failed, show a disabled Models field with "Couldn't load models. Retry", not a missing field.

### PR-10 · Correct "budget left" (`UsageStats.tsx:262, 276, 552`)

- [ ] Budget KPI uses `userInfo.spend` against `userInfo.max_budget`, with "resets {budget_reset_at}" when `budget_duration` is set, else "lifetime cap".
- [ ] Relabel the period chart "Spend in period" and remove the "left" computation from period spend.
- [ ] Move the budget math into `budget.ts` (pure, unit-tested; add cases to `budget.test.ts`).

### PR-11 · Form validation timing and field order (`KeyFormDialog.tsx:367, 677-765, 809`)

- [ ] Track `touched` per field and `submitAttempted`; show errors only after blur or submit.
- [ ] Keep submit enabled. On an invalid submit, focus the first invalid field and show errors.
- [ ] Reorder: Team → Models → Budget → Duration → Alias (pre-filled suggestion) → Advanced (TPM/RPM, metadata).
- [ ] Budget: `$` start adornment, `inputProps={{ min: 0, step: 0.01 }}`, and helper text "Lifetime cap for this key. It never resets" (or the reset window if supported).
- [ ] Duration: add "Never" (only if `allowNoExpiry` is set in config) and a live preview "Expires Oct 29, 2026".
- [ ] Token estimate copy: "≈ N tokens at the priciest selected model".
- [ ] Edit mode: filter models by `keyToEdit.team_id` (fixes the bug at `:353`).

---

## Phase 3: Architecture and Backstage conventions

### PR-12 · Create `@acarmisc/backstage-plugin-litellm-common`

- [ ] New package `packages/plugin-litellm-common`, `backstage.role: "common-library"`, same build and test setup as the siblings.
- [ ] Move into it: all permissions (key, team, audit, and the new PR-4 permissions); shared types (merge both `types.ts`, about 270 and 360 lines); zod key schemas (PR-2/3); budget-status thresholds (`teamBudgetVisibility.ts:26` and the FE mirror); the duration presets list.
- [ ] Delete the duplicates, including the "keep in sync" comment in FE `permissions.ts:3`.
- [ ] FE: gate key actions with `usePermission` using the COMMON permissions.
- [ ] Decide on a Yarn/npm workspaces root (see Q4) so the packages resolve each other locally.

### PR-13 · Split `router.ts` (1789 lines)

Target structure (BE):
```
router.ts                 // composition only (<150 lines)
middleware/withUser.ts    // resolve principal → LiteLLM user → provision → req.litellmUser
services/keyService.ts    // from PR-6
services/userInfoCache.ts // PR-15
routes/config.ts
routes/keys.ts
routes/teams.ts
routes/teamUsage.ts
routes/objectPermissions.ts
routes/usage.ts
routes/bridge.ts
routes/opencode.ts
http/respondTeam.ts       // single budget-redaction helper (replaces 7 copies)
errors.ts                 // PR-7
```
- [ ] `withUser` replaces the ~6 copies of resolve → toLiteLLMUserId → getOrProvisionUser → catch ProvisioningError.
- [ ] `respondTeam(res, team, caller)` replaces the 7 redaction copies.
- [ ] Fold the 4 duplicated `assertTeamAdmin` preambles into `authorizeTeamSubresource`.
- [ ] Pure move plus dedup; no behaviour change. Phase 1 tests must pass unchanged.

### PR-14 · Backstage services, errors and typing

- [ ] `logger: any` → `LoggerService` (`router.ts:133`, `provisioning.ts:177`, `teamAdmin.ts:131`); `Config` → `RootConfigService`.
- [ ] Remove manual Authorization parsing (`provisioning.ts:123-156`) and the double auth in `teamAdmin.ts:144-153`.
- [ ] Throw `InputError`/`NotAllowedError`/`NotFoundError`/`ConflictError`. Append `MiddlewareFactory.create({ config, logger }).error()` to the router.
- [ ] Replace `Object.assign(new Error, {status, body})` (`router.ts:378-389`).
- [ ] FE: replace the hand-rolled `ApiError` (`api.ts:21`) with `ResponseError.fromResponse`.
- [ ] Replace `catch (error: any)` with `unknown` plus narrowing. Remove the non-null assertions (`teamAdminCfg.group!` ×5, `redirectUri!`, `userInfo.teams!`) with explicit guards. Target: `any` count in BE below 10, each justified.
- [ ] FE `api.ts`: import `createApiRef` from `@backstage/frontend-plugin-api` consistently.

### PR-15 · Data fetching: one profile source, a backend cache

- [ ] FE: `hooks/useLiteLLMProfile()` returns `{ userInfo, teams, keys, models, config, loading, error, retry }`, backed by a small cache scoped to the ApiRef (a promise memo with a TTL of about 30s, invalidated on key mutations).
- [ ] Replace the three copies in `LiteLLMBudgetWidget.tsx:299`, `LiteLLMBudgetGauges.tsx:426` and `LiteLLMHomeWidget.tsx:68`.
- [ ] Overview tab: pass the page's data into the embedded budget widget instead of refetching (`LiteLLMPage.tsx:416`).
- [ ] BE: `userInfoCache` is a per-user LRU with a 10s TTL around `getUserInfo`, invalidated on key and team mutations. `listKeys` reuses it.
- [ ] Fix setState during render (`LiteLLMPage.tsx:445-447`): `TeamUsage` triggers the load in `useEffect` or `onExpand`.
- [ ] Move `pruneExpiredKeys` to the backend (`POST /keys/prune-expired`) and return `{ pruned, failed }`. Remove the `{pruned:0}` cast (`LiteLLMPage.tsx:320-332`).
- [ ] `ManageTeamDialog.tsx:137-148`: use `catalogApi.queryEntities({ filter: { kind: 'User' }, fullTextFilter, limit: 20 })` behind a debounced autocomplete.

**AC:** a page load makes at most 1 upstream `/user/info` per user within 10s (verified with a mock client counter in tests).

### PR-16 · Frontend uses `discoveryApi`

- [ ] `api.ts:80, 98`: `const base = await discoveryApi.getBaseUrl('litellm')`. Use `fetchApi` for all requests (auth headers handled by it).
- [ ] Update the API factory deps.

### PR-17 · Config schema completeness (`config.d.ts`)

- [ ] Declare `litellm.opencode.*`, `provisioning.defaults.userRole`, `provisioning.roles[].userRole`, and the new PR-2/PR-4 keys.
- [ ] Move the misplaced bridge docblock (`:109-115`) to `bridge`.
- [ ] Remove `display.*` frontend visibility if it's unused, or wire the FE to read it.
- [ ] Drop the redundant `@visibility backend` tags; keep `masterKey` as `@visibility secret`.

---

## Phase 4: UX polish, main page

### PR-18 · Destructive-action safety (`KeysTable.tsx`)

- [ ] Block needs a confirmation dialog: "Block **{alias}**? Integrations using it will fail immediately."
- [ ] Revoke dialog names the key: "Revoke **{alias}** (sk-…{last4})?" (`:497-503`).
- [ ] Guard dialog `onClose` with `!submitting` (`:497`, `:520`).
- [ ] Prune copy: "Remove N expired keys from the list. They already don't work." (`:524-525`).
- [ ] Remove the duplicate "Generate New Key" in the table actions (`:459`); keep the header button.

### PR-19 · Feedback and first-run experience

- [ ] Replace ad-hoc `Snackbar`s with `alertApi.post({ message, severity, display: 'transient' })`. Errors are shown inline inside dialogs and via alertApi for row actions, never both (`LiteLLMPage.tsx:242, 256`, `KeyFormDialog.tsx:667-676`).
- [ ] Error toasts are not auto-hidden (or last at least 10s).
- [ ] Onboarding: when `keys.length === 0`, Overview shows an `EmptyState` with a 3-step "Generate key → Copy endpoint → Make a call" and a primary CTA.
- [ ] Header stats "EXPIRED / EXPIRING SOON" (`DashboardHeader.tsx:156-160`) link to `?tab=keys&filter=expired|expiring`. Implement that filter in `KeysTable`.
- [ ] Unprovisioned panel (`LiteLLMPage.tsx:348-365`): `EmptyState missing="info"` with the end-user message "Your LiteLLM account isn't set up yet. Contact {supportContact}". Admin details go in a collapsible panel.

### PR-20 · Formatting and dates

- [ ] `format.ts`: one `Intl.NumberFormat` currency formatter with 2 decimals. Use `<$0.01` for non-zero values below one cent. Add tests in `format.test.ts`.
- [ ] Fix `KeysTable.tsx:130` (raw number) and `:358` ("∞ / ∞" → "Unlimited"). Rename the column to "TPM / RPM (per min)".
- [ ] Extract `monthToDateRange` (`LiteLLMBudgetGauges.tsx:239`) and a new `localDateRange(preset)` into `dates.ts`. Replace the UTC `toISOString().split('T')[0]` in `LiteLLMPage.tsx:187-188` and `LiteLLMHomeWidget.tsx:75-76`. Add tests for timezone edges.
- [ ] Model filter (`UsageStats.tsx:432`) lists only models with usage in the period.

### PR-21 · Accessibility and core-components layout

- [ ] Icon buttons get `aria-label` plus a `Tooltip` instead of `title`: `KeysTable.tsx:337-405`, `KeyFormDialog.tsx:249-256, 612, 641`.
- [ ] Replace the emoji model badges (`KeyFormDialog.tsx:474-475`) with `<Chip size="small" label="Tools" />` / `"Vision"`, matching ModelsTable.
- [ ] `DashboardHeader.tsx:36-47` decorative dots get `aria-hidden`.
- [ ] Use `Page`/`Header`/`Content`/`Progress` from `@backstage/core-components` (`LiteLLMPage.tsx:337-341, 392`) where it doesn't conflict with the custom header. At minimum, use `Content` and `Progress`.
- [ ] Charts: replace the green/red `SERIES.success/failure` with a colour-blind-safe pair (teal/orange) and keep the text labels.
- [ ] Split `KeyFormDialog.tsx` (842 lines): `KeySnippets.tsx` (`buildSnippets`, `SnippetTabs`), `KeyCreatedStep.tsx`, `KeyDangerZone.tsx`, `KeyFormFields.tsx`. Split `ui.tsx` (763 lines) into `ui/Gauge.tsx`, `ui/Meter.tsx`, `ui/charts.tsx`, `ui/tokens.ts`.

---

## Phase 5: Homepage widgets

### PR-22 · Real homepage integration and routing

- [ ] Add a `routeRef` to the `PageBlueprint` in `plugin.tsx`. Cards use `useRouteRef(rootRouteRef)` instead of `MODULE_PATH='/litellm'` (`LiteLLMBudgetGauges.tsx:55`) and `KEYS_PATH` (`LiteLLMBudgetWidget.tsx:171`).
- [ ] Export homepage card extensions for `@backstage/plugin-home` (new frontend system `HomePageWidgetBlueprint`, plus the legacy `createCardExtension` if older apps are supported, see Q3), with settings schemas (period, CTAs, size).
- [ ] Wrap the cards in `InfoCard` (or match its header and padding) with `height: '100%'`.
- [ ] Keep exporting the raw components for custom layouts.

### PR-23 · States: loading, error, unprovisioned

- [ ] Skeletons in the final layout instead of spinners: `LiteLLMBudgetGauges.tsx:567-571`, `LiteLLMBudgetWidget.tsx:342-346`, `LiteLLMHomeWidget.tsx:132-136`.
- [ ] Errors: a quiet `Typography` ("Usage unavailable", "LiteLLM account not set up. Ask your admin") instead of a red Alert with the raw message (`LiteLLMBudgetGauges.tsx:573-577`, `LiteLLMBudgetWidget.tsx:348-352`).
- [ ] Hide the `new-key` CTA when the profile has an error or the user is unprovisioned (`:615-630`).
- [ ] A failed usage fetch shows "Usage unavailable", not "No usage this month" (`:327-335, 463-466`).
- [ ] "No key budget" becomes "No cap (unlimited)" (`:102-104`).

### PR-24 · `LiteLLMHomeWidget` redesign

```
LiteLLM usage                 [7d ▾]
$129.90 spent · 412M in · 1.7M out
▁▁▂▁▁▆█▅   daily spend (tooltip: date + $)
Open LiteLLM →
```
- [ ] Sparkline uses theme tokens (`SERIES.spend`) instead of `#8884d8` (`:182-183`), with a `ChartTooltip`, date range caption and `aria-label` summary.
- [ ] Period `Select` gets a label or `aria-label` (`:119`).
- [ ] Remove "Keys: 23" or make it period-independent and visually separate.
- [ ] Footer link "Open LiteLLM →" via the routeRef.

### PR-25 · Budget gauges card: layout, semantics, CTAs

- [ ] Responsive grid: `display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))'` (`:581-591`). `Gauge` size 56 below `sm`, and remove `flexShrink: 0` (`ui.tsx:560`).
- [ ] The fourth column chart shows MTD **spend** (`daily_usage[].spend`) with an optional dashed cap line, plus the caption "Sep 1 – 29" and `aria-label` (`:454-462`).
- [ ] `DEFAULT_CTAS` → `['module', 'all-limits']` (`:107`), with the module rendered as a Link. Show `new-key` only when configured, or when `keys.length === 0`.
- [ ] `Gauge`/`Meter` (`ui.tsx:500-630`): `role="meter"`, `aria-valuenow/min/max`, and a descriptive `aria-label`. When over 100%, add the text "Over cap".
- [ ] "All limits" toggle: `aria-expanded`, `aria-controls` (`:527-542`). Widget header row (`LiteLLMBudgetWidget.tsx:362-372`): use a `ButtonBase` or make it non-interactive and rely on the IconButton.

---

## Phase 6: Tests, docs, cleanup

### PR-26 · Test infrastructure

- [ ] BE: adopt `@backstage/backend-test-utils` (`startTestBackend`, `mockServices.httpAuth`, `mockCredentials.user()/service()`) for router tests. This covers the user-vs-service principal cases from PR-1 realistically.
- [ ] FE: component tests with `@backstage/frontend-test-utils` plus Testing Library for `KeyFormDialog` (secret protection, validation timing, field order), `KeysTable` (confirmations), the error/empty states, and the widgets (skeleton, error, unprovisioned).
- [ ] Decide on a test runner (see Q5). Add `yarn test` / `npm test` at the root and a CI workflow running tsc, lint and tests for all packages.
- [ ] Coverage target: BE routes 100% for authorization branches.

### PR-27 · Dead code and comment cleanup

- [ ] Remove `expectedUpdatedAtIso` (`router.ts:1035`), or wire it in the FE for optimistic concurrency. Decide which.
- [ ] Remove the dead `teams` fallback (`LiteLLMPage.tsx:173-184`).
- [ ] Fix the `readRoleConfigs` docblock (`provisioning.ts:33-46`) and the stacked docblocks (`router.ts:1162-1171`).
- [ ] Fix the `allowedModels` comment or logic (union vs intersection, `LiteLLMPage.tsx:220-232`). Match whatever the server enforces after PR-2.
- [ ] `handleResetSpend` (`KeyFormDialog.tsx:439`): error handling and feedback.
- [ ] Resolve the 34 eslint warnings (React default imports).

### PR-28 · Documentation

- [ ] README: remove `CreateKeyButton` and the "Compact Create Key card" (`README.md:53-57, 329`), document `GenerateKeyButton` and the homepage card extensions, and refresh the screenshots in `docs/screenshots`.
- [ ] Security section: principals accepted, permissions list (including the new ones), config flags enforced server-side, the `owning_group` trust note, direct group membership only (no nested groups).
- [ ] State support for the new frontend and new backend systems only (or legacy exports, per Q3).
- [ ] CHANGELOG with a **breaking changes** section: service principals no longer accepted on user routes, strict request schemas, reset-spend and unblock gated, `/config` no longer exposes `baseUrl`.

---

## Open questions (decide before or during Phase 1)

| # | Question | Default if undecided |
|---|---|---|
| Q1 | Does any backend plugin or CI legitimately call user routes as a service principal? | No. Reject. Add dedicated admin routes later if needed. |
| Q2 | Which LiteLLM `/key/generate` fields should users control, and what are the ceilings (budget, TPM, RPM, durations)? | Fields listed in PR-2; ceilings configurable, defaulting to $100, 100k TPM, 1k RPM, durations 1d/7d/30d/90d. |
| Q3 | Support legacy frontend (`createPlugin`) and legacy home (`createCardExtension`)? | New systems only; documented. |
| Q4 | Move to a workspace root (Yarn) with a shared lockfile? | Yes, needed for the COMMON package. |
| Q5 | Keep `node --test` or move to Jest via `backstage-cli`? | Move to `backstage-cli package test` for Backstage test utils compatibility. |
| Q6 | Team-usage denial: 403 or 404? | 404 for non-members (no existence leak). |
| Q7 | OpenCode: rotate on reconnect, or require explicit "create new key"? | Rotate via `/key/regenerate`, POST plus confirmation. |

## Release strategy

- Phase 1 → **patch/minor release with a security advisory**. It contains breaking behaviour, so flag it clearly (semver major if the package is at 1.x or later).
- Phases 2–3 → minor.
- Phases 4–6 → minor, bundled.
- Each PR: `tsc --noEmit`, lint and tests green; screenshots attached for UI PRs.

## Tracking checklist

- [ ] PR-1 Principal enforcement
- [ ] PR-2 Generate validation
- [ ] PR-3 Update validation
- [ ] PR-4 Reset/unblock gating
- [ ] PR-5 Team usage authz
- [ ] PR-6 Bridge unification and identity
- [ ] PR-7 Error sanitization, OpenCode, snippet, leaks
- [ ] PR-8 One-time secret
- [ ] PR-9 Error vs empty states
- [ ] PR-10 Budget-left fix
- [ ] PR-11 Form validation and order
- [ ] PR-12 Common package
- [ ] PR-13 Router split
- [ ] PR-14 Backstage services, errors, typing
- [ ] PR-15 Profile hook and BE cache
- [ ] PR-16 discoveryApi
- [ ] PR-17 Config schema
- [ ] PR-18 Destructive-action safety
- [ ] PR-19 Feedback and onboarding
- [ ] PR-20 Formatting and dates
- [ ] PR-21 A11y and layout splits
- [ ] PR-22 Home integration and routeRef
- [ ] PR-23 Widget states
- [ ] PR-24 Home widget redesign
- [ ] PR-25 Gauges card
- [ ] PR-26 Test infra and CI
- [ ] PR-27 Cleanup
- [ ] PR-28 Docs and changelog
