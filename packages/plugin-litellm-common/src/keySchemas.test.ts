import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createGenerateKeyInputSchema } from './keySchemas';

const base = { maxBudget: 100, maxTpm: 1000, maxRpm: 100, allowedDurations: [] };

describe('createGenerateKeyInputSchema budget_duration', () => {
  test('accepts a default budget duration', () => {
    const r = createGenerateKeyInputSchema(base).safeParse({
      alias: 'k',
      max_budget: 100,
      budget_duration: '1mo',
    });
    assert.ok(r.success);
    assert.strictEqual(r.data.budget_duration, '1mo');
  });

  test('rejects a value outside the allow-list', () => {
    const schema = createGenerateKeyInputSchema(base);
    assert.ok(!schema.safeParse({ alias: 'k', budget_duration: 'banana' }).success);
    assert.ok(!schema.safeParse({ alias: 'k', budget_duration: '2mo' }).success);
  });

  test('honours a configured allow-list', () => {
    const schema = createGenerateKeyInputSchema({ ...base, allowedBudgetDurations: ['7d'] });
    assert.ok(schema.safeParse({ alias: 'k', budget_duration: '7d' }).success);
    assert.ok(!schema.safeParse({ alias: 'k', budget_duration: '1mo' }).success);
  });

  test('an empty allow-list accepts any well-formed value', () => {
    const schema = createGenerateKeyInputSchema({ ...base, allowedBudgetDurations: [] });
    assert.ok(schema.safeParse({ alias: 'k', budget_duration: '2mo' }).success);
    assert.ok(schema.safeParse({ alias: 'k', budget_duration: '12h' }).success);
    assert.ok(!schema.safeParse({ alias: 'k', budget_duration: 'banana' }).success);
    assert.ok(!schema.safeParse({ alias: 'k', budget_duration: '1w' }).success);
  });

  test('the field stays optional', () => {
    const r = createGenerateKeyInputSchema(base).safeParse({ alias: 'k' });
    assert.ok(r.success);
    assert.strictEqual(r.data.budget_duration, undefined);
  });
});

describe('createGenerateKeyInputSchema mcp_servers', () => {
  const schema = createGenerateKeyInputSchema(base);

  test('accepts names, an empty list, and leaves it optional', () => {
    assert.ok(schema.safeParse({ alias: 'k', mcp_servers: ['context7', 'my.server_1'] }).success);
    assert.ok(schema.safeParse({ alias: 'k', mcp_servers: [] }).success);
    assert.ok(schema.safeParse({ alias: 'k' }).success);
  });

  test('rejects separators, whitespace, control characters and oversized lists', () => {
    for (const bad of ['a,b', 'a b', 'a\r\nx', '', '../x']) {
      assert.ok(!schema.safeParse({ alias: 'k', mcp_servers: [bad] }).success, JSON.stringify(bad));
    }
    assert.ok(!schema.safeParse({ alias: 'k', mcp_servers: Array.from({ length: 51 }, (_, i) => `s${i}`) }).success);
  });
});
