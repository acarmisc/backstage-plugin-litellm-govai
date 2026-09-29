import { describe, test } from 'node:test';
import assert from 'node:assert';
import { resolveCtas } from './ctas';

const ready = { kind: 'ready' };
const kinds = (r: ReturnType<typeof resolveCtas>) => r.map(c => c.kind);

describe('resolveCtas', () => {
  test('defaults to module + all-limits when the user has keys', () => {
    assert.deepStrictEqual(kinds(resolveCtas({ hasKeys: true, viewState: ready, limitCount: 2 })), ['module', 'all-limits']);
  });

  test('drops all-limits when there are no limits', () => {
    assert.deepStrictEqual(kinds(resolveCtas({ hasKeys: true, viewState: ready, limitCount: 0 })), ['module']);
  });

  test('adds new-key first when the user has zero keys', () => {
    assert.deepStrictEqual(kinds(resolveCtas({ hasKeys: false, viewState: ready, limitCount: 1 })), ['new-key', 'module', 'all-limits']);
  });

  test('never offers new-key while loading, on error, or when unprovisioned', () => {
    for (const kind of ['loading', 'error', 'unprovisioned']) {
      const r = resolveCtas({ hasKeys: false, viewState: { kind }, limitCount: 1, ctas: ['new-key', 'module'] });
      assert.deepStrictEqual(kinds(r), ['module'], kind);
      const d = resolveCtas({ hasKeys: false, viewState: { kind }, limitCount: 1 });
      assert.ok(!kinds(d).includes('new-key'), kind);
    }
  });

  test('an explicit list is honoured and not auto-extended', () => {
    assert.deepStrictEqual(kinds(resolveCtas({ ctas: ['module'], hasKeys: false, viewState: ready, limitCount: 3 })), ['module']);
    assert.deepStrictEqual(kinds(resolveCtas({ ctas: ['new-key', 'module'], hasKeys: true, viewState: ready, limitCount: 3 })), ['new-key', 'module']);
    assert.deepStrictEqual(resolveCtas({ ctas: [], hasKeys: false, viewState: ready, limitCount: 3 }), []);
  });

  test('keeps label overrides from spec objects', () => {
    const r = resolveCtas({ ctas: [{ kind: 'module', label: 'Go' }], hasKeys: true, viewState: ready, limitCount: 0 });
    assert.strictEqual(r[0].label, 'Go');
  });
});
