import { describe, test } from 'node:test';
import assert from 'node:assert';
import { toLocalDay, monthToDateRange, localDateRange } from './dates';

describe('toLocalDay', () => {
  test('formats a date as YYYY-MM-DD using local calendar', () => {
    const d = new Date(2026, 0, 15); // Jan 15, 2026 (month is 0-indexed)
    assert.strictEqual(toLocalDay(d), '2026-01-15');
  });

  test('pads single-digit months and days', () => {
    const d = new Date(2026, 2, 1); // Mar 1, 2026
    assert.strictEqual(toLocalDay(d), '2026-03-01');
  });

  test('handles month boundaries correctly', () => {
    const d = new Date(2026, 11, 31); // Dec 31, 2026
    assert.strictEqual(toLocalDay(d), '2026-12-31');
  });

  test('handles leap day', () => {
    const d = new Date(2028, 1, 29); // Feb 29, 2028 (leap year)
    assert.strictEqual(toLocalDay(d), '2028-02-29');
  });

  test('differs from UTC slice when local time is near midnight', () => {
    // Build a Date from local components at 12:30 AM on March 1st.
    // The exact behavior depends on the host's timezone, but in any case,
    // toLocalDay should give March 1st based on the local clock.
    const d = new Date(2026, 2, 1, 0, 30); // Mar 1, 2026 at 12:30 AM
    const localDay = toLocalDay(d);
    assert.strictEqual(localDay, '2026-03-01', 'toLocalDay uses local components, not UTC');

    // The UTC slice could differ depending on timezone:
    // If the host is behind UTC, 12:30 AM local on March 1 might be
    // late Feb 28 in UTC.
    const utcSlice = d.toISOString().split('T')[0];
    // We can't hardcode the expected UTC value without knowing the host TZ,
    // but we can at least verify they're different in timezones that are behind UTC.
    if (d.getTimezoneOffset() > 0) {
      // Host is behind UTC, so UTC date should be previous day
      assert.notStrictEqual(utcSlice, localDay);
    }
  });
});

describe('monthToDateRange', () => {
  test('returns 1st of current month through today', () => {
    const now = new Date(2026, 2, 15, 14, 30); // Mar 15, 2026, 2:30 PM
    const range = monthToDateRange(now);
    assert.strictEqual(range.startDate, '2026-03-01');
    assert.strictEqual(range.endDate, '2026-03-15');
  });

  test('handles month boundaries (month start)', () => {
    const now = new Date(2026, 3, 1, 8, 0); // Apr 1, 2026
    const range = monthToDateRange(now);
    assert.strictEqual(range.startDate, '2026-04-01');
    assert.strictEqual(range.endDate, '2026-04-01');
  });

  test('handles month boundaries (month end)', () => {
    const now = new Date(2026, 4, 31, 23, 59); // May 31, 2026
    const range = monthToDateRange(now);
    assert.strictEqual(range.startDate, '2026-05-01');
    assert.strictEqual(range.endDate, '2026-05-31');
  });

  test('handles year boundaries (Jan 1)', () => {
    const now = new Date(2026, 0, 1, 0, 0); // Jan 1, 2026
    const range = monthToDateRange(now);
    assert.strictEqual(range.startDate, '2026-01-01');
    assert.strictEqual(range.endDate, '2026-01-01');
  });

  test('uses default now when not provided', () => {
    const now = new Date();
    const range = monthToDateRange();
    const expected = monthToDateRange(now);
    // Dates should be very close (within milliseconds)
    assert.strictEqual(range.startDate, expected.startDate);
    // endDate might differ by one day if the test runs near midnight,
    // but we can at least check it's formatted correctly
    assert.match(range.endDate, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('localDateRange', () => {
  test('today: from midnight to now', () => {
    const now = new Date(2026, 2, 15, 14, 30); // Mar 15, 2:30 PM
    const range = localDateRange('today', now);
    assert.strictEqual(range.startDate, '2026-03-15');
    assert.strictEqual(range.endDate, '2026-03-15');
    assert.strictEqual(range.start.getHours(), 0);
    assert.strictEqual(range.start.getMinutes(), 0);
  });

  test('24h: last 24 hours from now', () => {
    const now = new Date(2026, 2, 15, 14, 30);
    const range = localDateRange('24h', now);
    const expectedStart = new Date(now);
    expectedStart.setHours(expectedStart.getHours() - 24);
    assert.strictEqual(range.startDate, toLocalDay(expectedStart));
    assert.strictEqual(range.endDate, '2026-03-15');
  });

  test('7d: last 7 days from now', () => {
    const now = new Date(2026, 2, 15, 14, 30); // Mar 15
    const range = localDateRange('7d', now);
    assert.strictEqual(range.startDate, '2026-03-08'); // Mar 8
    assert.strictEqual(range.endDate, '2026-03-15');
  });

  test('30d: last 30 days from now', () => {
    const now = new Date(2026, 2, 15, 14, 30); // Mar 15
    const range = localDateRange('30d', now);
    assert.strictEqual(range.startDate, '2026-02-13'); // Feb 13
    assert.strictEqual(range.endDate, '2026-03-15');
  });

  test('preserves end-of-month correctly', () => {
    const now = new Date(2026, 4, 31, 23, 59); // May 31
    const range = localDateRange('7d', now);
    assert.strictEqual(range.endDate, '2026-05-31');
    assert.strictEqual(range.startDate, '2026-05-24'); // May 24
  });
});
