export const fmtUsd = (n: number) => `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
export const fmtInt = (n: number) => (n ?? 0).toLocaleString();
