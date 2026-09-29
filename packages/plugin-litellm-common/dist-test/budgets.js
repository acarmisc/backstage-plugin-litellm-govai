"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUDGET_DANGER_PCT = exports.BUDGET_WARNING_PCT = void 0;
exports.budgetStatusForPct = budgetStatusForPct;
exports.formatDurationLabel = formatDurationLabel;
/** Budget warning threshold (percent of cap). */
exports.BUDGET_WARNING_PCT = 80;
/** Budget danger threshold (percent of cap, at or over cap). */
exports.BUDGET_DANGER_PCT = 100;
/**
 * Compute budget status from spend percentage of cap.
 * Thresholds: near >= 80%, over >= 100%.
 */
function budgetStatusForPct(pct) {
    if (pct >= exports.BUDGET_DANGER_PCT)
        return 'over';
    if (pct >= exports.BUDGET_WARNING_PCT)
        return 'near';
    return 'ok';
}
/**
 * Format a duration string to a human-readable label.
 * E.g., "1d" → "1 Day", "7d" → "7 Days".
 */
function formatDurationLabel(duration) {
    const match = /^(\d+)([smhdwy])$/.exec(duration);
    if (!match)
        return duration;
    const [, num, unit] = match;
    const n = Number(num);
    const unitLabels = {
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
