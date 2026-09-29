export const fmtUsd = (n: number) => `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
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
