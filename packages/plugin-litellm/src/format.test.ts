import { describe, test } from 'node:test';
import assert from 'node:assert';
import { fmtUsd, fmtInt } from './format';

describe('fmtUsd', () => {
  test('uses 2 decimal places for amounts >= 1', () => {
    assert.strictEqual(fmtUsd(1), '$1.00');
    assert.strictEqual(fmtUsd(1.5), '$1.50');
    assert.strictEqual(fmtUsd(99.999), '$100.00');
  });

  test('uses 4 decimal places for amounts < 1', () => {
    assert.strictEqual(fmtUsd(0), '$0.0000');
    assert.strictEqual(fmtUsd(0.5), '$0.5000');
    assert.strictEqual(fmtUsd(0.00015), '$0.0001'); // floating-point: 0.00015 rounds down in IEEE 754
  });

  test('treats null as 0', () => {
    assert.strictEqual(fmtUsd(null as unknown as number), '$0.0000');
  });
});

describe('fmtInt', () => {
  test('formats zero', () => {
    assert.strictEqual(fmtInt(0), '0');
  });

  test('includes digit-group separators for large numbers', () => {
    const result = fmtInt(1234567);
    assert.ok(result.startsWith('1'), `expected to start with 1, got ${result}`);
    assert.ok(result.includes('234'), `expected to include 234, got ${result}`);
    assert.ok(result.endsWith('567'), `expected to end with 567, got ${result}`);
    assert.ok(result.length > 7, 'expected separators to add characters');
  });

  test('treats null/undefined as 0', () => {
    assert.strictEqual(fmtInt(null as unknown as number), '0');
    assert.strictEqual(fmtInt(undefined as unknown as number), '0');
  });
});
