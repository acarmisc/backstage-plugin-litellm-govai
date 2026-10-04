# Contributing

Thanks for helping. By contributing you license your work under
[Apache-2.0](LICENSE). Report security issues as described in
[SECURITY.md](SECURITY.md), not in public issues.

## Layout

```
packages/
  plugin-litellm/          frontend: page, homepage cards, dialogs (dev/ = mock harness)
  plugin-litellm-backend/  backend: routes, LiteLLM client, provisioning, CLI bridge
  plugin-litellm-common/   permissions, request schemas, shared types
docs/                      user documentation, architecture diagram, screenshots
scripts/                   screenshot capture
```


## Build and test

The repo is an **npm workspace** with a single root `package-lock.json`. From the root:

```bash
npm ci --legacy-peer-deps   # Backstage's MUI4 theme has a react@^17 peer dep
npm run build               # builds the common package first, then backend + frontend
npm test                    # common, backend and frontend suites (node --test)
npm run lint
```

The root `package.json` pins `@yarnpkg/core` to `4.9.1` through `overrides`.
`4.9.2` was published with a `got` dependency that points at a patch file which
only exists in Yarn's own repository, and `@backstage/cli` (a devDependency here)
reaches it through `@backstage/cli-defaults`. Without the pin, resolving the tree
from scratch (for example after deleting `package-lock.json`) fails with no error
message. Drop the pin once a later `@yarnpkg/core` release is picked up by default.

Tests use Node's built-in runner (`node --test`). Frontend component tests run
against jsdom with Testing Library; `packages/plugin-litellm/src/testing/` holds
the DOM bootstrap and a MUI test theme, and `test-support/` holds the small Node
loader hooks that make Backstage's ESM builds importable outside a bundler.
`usePermission` caches decisions in a process-wide SWR cache, so tests that need
a different permission decision live in their own file (`*.denied.test.tsx`).

## API Reports

Public API surface for both packages is tracked with
[API Extractor](https://api-extractor.com/). After changing exports in
either package's `src/index.ts`, regenerate the report and commit the diff:

```bash
cd packages/plugin-litellm && npm run api-report
cd ../plugin-litellm-backend && npm run api-report
```

This isn't enforced in CI yet — treat a `report.api.md` diff as a review
signal for accidental breaking changes to the public API.

## Run the frontend with mock data

The frontend has a dev harness that renders the plugin without a backend or a
LiteLLM proxy. All data comes from
[`packages/plugin-litellm/dev/mockApi.ts`](packages/plugin-litellm/dev/mockApi.ts).

```bash
npm run build -w @acarmisc/backstage-plugin-litellm-common
cd packages/plugin-litellm && npm start
```

Then open:

- <http://localhost:3000/litellm> — the full page (`?tab=keys|teams|models|audit`)
- <http://localhost:3000/home> — the homepage cards side by side
- <http://localhost:3000/budget-widgets> — every variant of the budget cards

If `npm start` fails with `Cannot find native binding` (an npm bug with
optional platform dependencies), install the binding for your platform without
saving it, e.g. `npm install --no-save @rspack/binding-linux-x64-gnu`.

## Screenshots

The images in `docs/images` are captured from the dev harness, so they always
show the current UI with the same fixed data. With `npm start` running:

```bash
npm install --no-save --legacy-peer-deps playwright
npx playwright install chromium
node scripts/capture-screenshots.mjs
```

Re-run it after a visible UI change and commit the updated images. The
architecture image is a capture of [`docs/architecture.html`](docs/architecture.html)
(see [docs/architecture.md](docs/architecture.md)).

## Releasing

Each package is versioned and published on its own. Pushing a tag
`<package>@<version>` runs `.github/workflows/publish.yaml`, which checks that
the tag matches the version in that package's `package.json`, builds, publishes
to npm with provenance and creates a GitHub Release.

| Tag prefix | Package |
|---|---|
| `litellm-common@` | `@acarmisc/backstage-plugin-litellm-common` |
| `litellm-backend@` | `@acarmisc/backstage-plugin-litellm-backend` |
| `litellm@` | `@acarmisc/backstage-plugin-litellm` |

```bash
# 1. Bump "version" in the package.json files and add CHANGELOG entries, then:
git commit -am "chore: release ..."
git push origin main

# 2. Tag. Publish common first when it changed: the other two pin it exactly.
git tag litellm-backend@X.Y.Z && git push origin litellm-backend@X.Y.Z
git tag litellm@X.Y.Z         && git push origin litellm@X.Y.Z
```
