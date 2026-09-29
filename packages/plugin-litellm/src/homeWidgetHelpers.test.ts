import { describe, test } from 'node:test';
import assert from 'node:assert';
import { rangeCaption, sparklineAriaLabel, usageSummary, mtdCaption, meterAria } from './homeWidgetHelpers';
import type { UsageMetrics } from './types';

describe('rangeCaption', () => {
  test('formats a date range correctly', () => {
    assert.strictEqual(rangeCaption('2026-09-01', '2026-09-29'), 'Sep 1 – Sep 29');
  });

  test('handles same-day range', () => {
    assert.strictEqual(rangeCaption('2026-09-15', '2026-09-15'), 'Sep 15 – Sep 15');
  });

  test('handles cross-month ranges', () => {
    assert.strictEqual(rangeCaption('2026-08-29', '2026-09-02'), 'Aug 29 – Sep 2');
  });

  test('handles cross-year ranges', () => {
    assert.strictEqual(rangeCaption('2025-12-28', '2026-01-05'), 'Dec 28 – Jan 5');
  });
});

describe('sparklineAriaLabel', () => {
  test('returns descriptive label for data with one point', () => {
    const points = [{ date: '2026-09-27', spend: 41.20 }];
    const label = sparklineAriaLabel(points);
    assert.match(label, /Daily spend over 1 day/);
    assert.match(label, /total \$41\.20/);
    assert.match(label, /peak \$41\.20 on Sep 27/);
  });

  test('returns descriptive label for multiple points', () => {
    const points = [
      { date: '2026-09-23', spend: 10.0 },
      { date: '2026-09-24', spend: 12.5 },
      { date: '2026-09-25', spend: 15.0 },
      { date: '2026-09-26', spend: 20.0 },
      { date: '2026-09-27', spend: 41.20 },
      { date: '2026-09-28', spend: 18.95 },
      { date: '2026-09-29', spend: 12.25 },
    ];
    const label = sparklineAriaLabel(points);
    assert.match(label, /Daily spend over 7 days/);
    assert.match(label, /total \$129\.90/);
    assert.match(label, /peak \$41\.20 on Sep 27/);
  });

  test('handles empty data gracefully', () => {
    const label = sparklineAriaLabel([]);
    assert.strictEqual(label, 'No daily spend data');
  });

  test('finds the peak value correctly', () => {
    const points = [
      { date: '2026-09-01', spend: 5.0 },
      { date: '2026-09-02', spend: 50.0 },
      { date: '2026-09-03', spend: 10.0 },
    ];
    const label = sparklineAriaLabel(points);
    assert.match(label, /peak \$50\.00 on Sep 2/);
  });

  test('pluralizes "days" correctly', () => {
    const single = sparklineAriaLabel([{ date: '2026-09-01', spend: 10.0 }]);
    assert.match(single, /1 day,/);

    const multiple = sparklineAriaLabel([
      { date: '2026-09-01', spend: 10.0 },
      { date: '2026-09-02', spend: 10.0 },
    ]);
    assert.match(multiple, /2 days,/);
  });
});

describe('usageSummary', () => {
  test('formats usage metrics correctly', () => {
    const usage: Partial<UsageMetrics> = {
      total_spend: 129.90,
      prompt_tokens: 412000000,
      completion_tokens: 1700000,
    };
    const summary = usageSummary(usage as UsageMetrics);
    assert.strictEqual(summary, '$129.90 spent · 412M in · 1.7M out');
  });

  test('handles zero usage', () => {
    const usage: Partial<UsageMetrics> = {
      total_spend: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
    };
    const summary = usageSummary(usage as UsageMetrics);
    assert.strictEqual(summary, '$0.00 spent · 0 in · 0 out');
  });

  test('handles undefined values', () => {
    const usage: Partial<UsageMetrics> = {};
    const summary = usageSummary(usage as UsageMetrics);
    assert.strictEqual(summary, '$0.00 spent · 0 in · 0 out');
  });

  test('handles null usage', () => {
    const summary = usageSummary(null);
    assert.strictEqual(summary, '$0.00 spent · 0 in · 0 out');
  });

  test('uses compact format for large token counts', () => {
    const usage: Partial<UsageMetrics> = {
      total_spend: 5.55,
      prompt_tokens: 1234567,
      completion_tokens: 987654,
    };
    const summary = usageSummary(usage as UsageMetrics);
    assert.strictEqual(summary, '$5.55 spent · 1.2M in · 988K out');
  });

  test('handles very small token counts', () => {
    const usage: Partial<UsageMetrics> = {
      total_spend: 0.05,
      prompt_tokens: 500,
      completion_tokens: 250,
    };
    const summary = usageSummary(usage as UsageMetrics);
    assert.strictEqual(summary, '$0.05 spent · 500 in · 250 out');
  });
});


describe('mtdCaption', () => {
  test('same-month range', () => {
    assert.strictEqual(mtdCaption(new Date(2026, 8, 29)), 'Sep 1 – Sep 29');
  });
  test('first of the month', () => {
    assert.strictEqual(mtdCaption(new Date(2026, 0, 1)), 'Jan 1 – Jan 1');
  });
  test('year boundary stays inside the current month', () => {
    assert.strictEqual(mtdCaption(new Date(2026, 11, 31)), 'Dec 1 – Dec 31');
  });
});

describe('meterAria', () => {
  test('clamps the value and sets the meter role', () => {
    const a = meterAria(42, 'Key budget');
    assert.strictEqual(a.role, 'meter');
    assert.strictEqual(a['aria-valuenow'], 42);
    assert.strictEqual(a['aria-label'], 'Key budget');
    assert.strictEqual(a['aria-valuetext'], undefined);
  });
  test('over 100 clamps valuenow and flags over cap in valuetext', () => {
    const a = meterAria(120);
    assert.strictEqual(a['aria-valuenow'], 100);
    assert.strictEqual(a['aria-valuetext'], '120% — over cap');
  });
  test('negative clamps to zero', () => {
    assert.strictEqual(meterAria(-5)['aria-valuenow'], 0);
  });
});
