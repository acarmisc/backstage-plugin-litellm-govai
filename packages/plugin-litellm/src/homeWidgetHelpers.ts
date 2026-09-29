import { fmtUsd } from './format';
import { fmtCompact, fmtDateShort } from './components/ui/tokens';
import type { UsageMetrics } from './types';

/**
 * Build a human-readable date range caption from two YYYY-MM-DD strings.
 * Example: '2026-09-01', '2026-09-29' → 'Sep 1 – Sep 29'
 */
export function rangeCaption(startDay: string, endDay: string): string {
  return `${fmtDateShort(startDay)} – ${fmtDateShort(endDay)}`;
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
