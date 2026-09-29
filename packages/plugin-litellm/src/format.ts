const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number as USD currency with 2 decimals. Non-zero values below
 * one cent render as `<$0.01`. Zero, null, undefined, or NaN render as `$0.00`.
 * Negative values keep the leading minus sign.
 */
export const fmtUsd = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return '$0.00';
  }
  if (n === 0) {
    return '$0.00';
  }
  // Non-zero values below one cent
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01) {
    return n < 0 ? '-<$0.01' : '<$0.01';
  }
  return currencyFormatter.format(n);
};

export const fmtInt = (n: number) => (n ?? 0).toLocaleString();

/**
 * Format a count for display, showing "–" when the value is null or undefined.
 * Used to indicate that data failed to load, distinct from a zero count.
 */
export const formatCount = (n: number | null | undefined): string => {
  return n === null || n === undefined ? '–' : fmtInt(n);
};

/**
 * Estimate how many tokens a USD budget buys at a given per-token price.
 * Returns null when the price is missing or non-positive.
 */
export const estimateTokensFromBudget = (budget: number, pricePerToken?: number): number | null => {
  if (!pricePerToken || pricePerToken <= 0 || !budget || budget <= 0) return null;
  return Math.floor(budget / pricePerToken);
};

/**
 * Format TPM and RPM limits for display. When neither limit is set (both null/undefined),
 * returns 'Unlimited'. Otherwise returns formatted values with 'Unlimited' for the missing limit.
 * Uses fmtInt for digit grouping.
 */
export const fmtLimits = (tpm: number | null | undefined, rpm: number | null | undefined): string => {
  const tpmStr = tpm ? fmtInt(tpm) : 'Unlimited';
  const rpmStr = rpm ? fmtInt(rpm) : 'Unlimited';
  if (tpmStr === 'Unlimited' && rpmStr === 'Unlimited') {
    return 'Unlimited';
  }
  return `${tpmStr} / ${rpmStr}`;
};
