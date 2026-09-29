/** Budget warning threshold (percent of cap). */
export const BUDGET_WARNING_PCT = 80;

/** Budget danger threshold (percent of cap, at or over cap). */
export const BUDGET_DANGER_PCT = 100;

/** Consumption status derived from spend vs. cap. */
export type BudgetStatus = 'ok' | 'near' | 'over';

/**
 * Compute budget status from spend percentage of cap.
 * Thresholds: near >= 80%, over >= 100%.
 */
export function budgetStatusForPct(pct: number): BudgetStatus {
  if (pct >= BUDGET_DANGER_PCT) return 'over';
  if (pct >= BUDGET_WARNING_PCT) return 'near';
  return 'ok';
}

/**
 * Format a duration string to a human-readable label.
 * E.g., "1d" → "1 Day", "7d" → "7 Days".
 */
export function formatDurationLabel(duration: string): string {
  const match = /^(\d+)([smhdwy])$/.exec(duration);
  if (!match) return duration;

  const [, num, unit] = match;
  const n = Number(num);

  const unitLabels: Record<string, string> = {
    s: 'Second',
    m: 'Minute',
    h: 'Hour',
    d: 'Day',
    w: 'Week',
    y: 'Year',
  };

  const label = unitLabels[unit] || unit;
  return n === 1 ? `1 ${label}` : `${n} ${label}s`;
}
