import { fmtUsd } from './format';
import { fmtCompact, fmtDateShort } from './components/ui/tokens';
import { toLocalDay } from './dates';
import type { UsageMetrics } from './types';

/**
 * Build a human-readable date range caption from two YYYY-MM-DD strings.
 * Example: '2026-09-01', '2026-09-29' → 'Sep 1 – Sep 29'
 */
export function rangeCaption(startDay: string, endDay: string): string {
  return `${fmtDateShort(startDay)} – ${fmtDateShort(endDay)}`;
}

/**
 * Build a month-to-date range caption from a Date.
 * Example: new Date('2026-09-29') → 'Sep 1 – 29'
 * Handles same-day (returns date twice) and month/year edge cases.
 */
export function mtdCaption(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const startDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return rangeCaption(startDay, endDay);
}

/**
 * Build an aria-label summary for a sparkline chart showing daily spend data.
 * Includes total spend, peak value, and the date it occurred.
 * Example: 'Daily spend over 7 days, total $129.90, peak $41.20 on Sep 27'
 */
export function sparklineAriaLabel(points: Array<{ date: string; spend: number }>): string {
  if (!points || points.length === 0) {
    return 'No daily spend data';
  }

  const total = points.reduce((sum, p) => sum + p.spend, 0);
  const maxPoint = points.reduce(
    (max, p) => (p.spend > max.spend ? p : max),
    points[0],
  );

  const dayCount = points.length;
  const peakDate = fmtDateShort(maxPoint.date);

  return `Daily spend over ${dayCount} day${dayCount === 1 ? '' : 's'}, total ${fmtUsd(total)}, peak ${fmtUsd(maxPoint.spend)} on ${peakDate}`;
}

/**
 * Spend recorded on the local calendar day `now` (defaults to today) in a
 * daily-spend series. Days the API omits count as zero — no spend recorded
 * yet — so a chart that simply hasn't seen a request today still answers
 * `$0.00` instead of `undefined`.
 *
 * `now` is overridable so the same helper yields yesterday's figure
 * (`spendOnDay(points, yesterday)`) for a day-over-day hint.
 */
export function spendOnDay(
  points: Array<{ date: string; spend: number }>,
  now: Date = new Date(),
): number {
  const day = toLocalDay(now);
  return points.find(p => p.date === day)?.spend ?? 0;
}

/**
 * Format usage metrics as a single summary line: '$X spent · YM in · ZM out'
 * Handles zero usage and undefined values gracefully.
 */
export function usageSummary(usage: UsageMetrics | null | undefined): string {
  if (!usage) {
    return '$0.00 spent · 0 in · 0 out';
  }

  const spent = fmtUsd(usage.total_spend ?? 0);
  const tokenIn = fmtCompact(usage.prompt_tokens ?? 0);
  const tokenOut = fmtCompact(usage.completion_tokens ?? 0);

  return `${spent} spent · ${tokenIn} in · ${tokenOut} out`;
}

/**
 * Build ARIA attributes for a meter component showing a percentage value.
 * When value > 100%, sets aria-valuetext to include "over cap" warning.
 * Returns an object with role, aria-valuenow, aria-valuemin, aria-valuemax,
 * aria-label, and optionally aria-valuetext.
 */
export function meterAria(
  pct: number,
  label?: string,
): {
  role: string;
  'aria-valuenow': number;
  'aria-valuemin': number;
  'aria-valuemax': number;
  'aria-label'?: string;
  'aria-valuetext'?: string;
} {
  const attrs: ReturnType<typeof meterAria> = {
    role: 'meter',
    'aria-valuenow': Math.max(0, Math.min(100, pct)),
    'aria-valuemin': 0,
    'aria-valuemax': 100,
  };

  if (label) {
    attrs['aria-label'] = label;
  }

  if (pct > 100) {
    attrs['aria-valuetext'] = `${Math.round(pct)}% — over cap`;
  }

  return attrs;
}
