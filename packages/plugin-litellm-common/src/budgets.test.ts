import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  BUDGET_WARNING_PCT,
  BUDGET_DANGER_PCT,
  budgetStatusForPct,
  formatDurationLabel,
} from './budgets';

describe('budgets', () => {
  describe('BUDGET_WARNING_PCT', () => {
    test('equals 80', () => {
      assert.strictEqual(BUDGET_WARNING_PCT, 80);
    });
  });

  describe('BUDGET_DANGER_PCT', () => {
    test('equals 100', () => {
      assert.strictEqual(BUDGET_DANGER_PCT, 100);
    });
  });

  describe('budgetStatusForPct', () => {
    test('returns "ok" when under 80%', () => {
      assert.strictEqual(budgetStatusForPct(0), 'ok');
      assert.strictEqual(budgetStatusForPct(50), 'ok');
      assert.strictEqual(budgetStatusForPct(79.9), 'ok');
    });

    test('returns "near" when 80-99%', () => {
      assert.strictEqual(budgetStatusForPct(80), 'near');
      assert.strictEqual(budgetStatusForPct(90), 'near');
      assert.strictEqual(budgetStatusForPct(99.9), 'near');
    });

    test('returns "over" when at or above 100%', () => {
      assert.strictEqual(budgetStatusForPct(100), 'over');
      assert.strictEqual(budgetStatusForPct(120), 'over');
      assert.strictEqual(budgetStatusForPct(Infinity), 'over');
    });
  });

  describe('formatDurationLabel', () => {
    test('formats single units correctly', () => {
      assert.strictEqual(formatDurationLabel('1s'), '1 Second');
      assert.strictEqual(formatDurationLabel('1m'), '1 Minute');
      assert.strictEqual(formatDurationLabel('1h'), '1 Hour');
      assert.strictEqual(formatDurationLabel('1d'), '1 Day');
      assert.strictEqual(formatDurationLabel('1w'), '1 Week');
      assert.strictEqual(formatDurationLabel('1y'), '1 Year');
    });

    test('formats plural units correctly', () => {
      assert.strictEqual(formatDurationLabel('2s'), '2 Seconds');
      assert.strictEqual(formatDurationLabel('7d'), '7 Days');
      assert.strictEqual(formatDurationLabel('30d'), '30 Days');
      assert.strictEqual(formatDurationLabel('90d'), '90 Days');
      assert.strictEqual(formatDurationLabel('5w'), '5 Weeks');
    });

    test('returns the input unchanged for invalid formats', () => {
      assert.strictEqual(formatDurationLabel('invalid'), 'invalid');
      assert.strictEqual(formatDurationLabel(''), '');
      assert.strictEqual(formatDurationLabel('d7'), 'd7');
    });
  });
});
