export const fmtUsd = (n: number) => `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
export const fmtInt = (n: number) => (n ?? 0).toLocaleString();

/**
 * Estimate how many tokens a USD budget buys at a given per-token price.
 * Returns null when the price is missing or non-positive.
 */
export const estimateTokensFromBudget = (budget: number, pricePerToken?: number): number | null => {
  if (!pricePerToken || pricePerToken <= 0 || !budget || budget <= 0) return null;
  return Math.floor(budget / pricePerToken);
};
