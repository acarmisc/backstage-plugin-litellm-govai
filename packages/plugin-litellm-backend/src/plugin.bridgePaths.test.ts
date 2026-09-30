import { describe, test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIDGE_UNAUTHENTICATED_PATHS } from './plugin';

describe('bridge auth policy', () => {
  test('every route registered in routes/bridge.ts is exempt from the Backstage auth policy', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'routes', 'bridge.ts'), 'utf8');
    const routes = [...src.matchAll(/router\.(?:get|post|put|delete)\('(\/bridge\/[^']+)'/g)].map(m => m[1]);
    assert.ok(routes.length >= 5, `expected to find the bridge routes, got ${routes.join(',')}`);
    for (const r of routes) {
      assert.ok(BRIDGE_UNAUTHENTICATED_PATHS.includes(r), `${r} is missing from BRIDGE_UNAUTHENTICATED_PATHS`);
    }
  });
});
