# @acarmisc/backstage-plugin-litellm-backend

This changelog is maintained by hand — this repo is two independent npm
packages rather than a Changesets-compatible yarn workspace, so there's no
automated `yarn changeset` release flow. Add an entry here in the same
commit/PR that bumps the version in `package.json`. Format follows the
[Changesets](https://github.com/changesets/changesets) convention used by
`backstage/community-plugins`.

Earlier history: `git log -- packages/plugin-litellm-backend` or the
[GitHub tags](https://github.com/acarmisc/backstage-plugin-litellm-govai/tags).

## Unreleased

### Minor Changes

- feat: wire up the Backstage permission framework (`litellm.key.create`, `litellm.key.revoke`, `litellm.key.manage`, `litellm.audit.read`) — additive on top of the existing ownership guard and audit-group check; no-op until an operator installs a permission policy

## 0.8.2

### Patch Changes

- feat: opencode/pi config snippets and public endpoint in key modal
- docs: replace real internal domain examples with generic placeholders

## 0.8.1

### Patch Changes

- release: litellm v0.12.4, litellm-backend v0.8.1
- ci: commit package-lock.json for both packages
- fix: resolve all ESLint errors across both packages, add lint/test scripts

## 0.8.0

### Minor Changes

- feat: header Generate CTA + key/expiry counters, inline generate errors, upstream status passthrough

## 0.7.0

### Minor Changes

- feat: gated unlimited-budget/team-required toggles, team-scoped models, default alias

## 0.6.2

### Patch Changes

- fix: actionable error on team key-duration override, show member emails

## 0.6.1

### Patch Changes

- fix: remove Enterprise-only key rotation, fix duplicate Done CTA
