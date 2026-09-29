import { alpha, useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

// ── formatting ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-16` → `Aug 16`. Falls back to the raw value for anything else. */
export const fmtDateShort = (value: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!m) return value;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
};

/** 54253484 → `54.3M`. Keeps axis labels from swallowing the plot area. */
export const fmtCompact = (n: number): string => {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(v));
};

/** Compact currency for axis ticks — `$24`, `$1.2K`. */
export const fmtUsdCompact = (n: number): string => {
  const v = n ?? 0;
  if (Math.abs(v) >= 1000) return `$${fmtCompact(v)}`;
  if (Math.abs(v) >= 10) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
};

// ── chart palette ─────────────────────────────────────────────────────────────

/** Categorical ramp, ordered so neighbouring series stay distinguishable. */
export const CHART_COLORS = [
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#F59E0B', // amber
  '#EC4899', // pink
  '#38BDF8', // sky
  '#84CC16', // lime
  '#F97316', // orange
  '#A855F7', // violet
] as const;

/** Fixed colours for series that carry meaning rather than identity. */
export const SERIES = {
  input: '#6366F1',
  output: '#14B8A6',
  success: '#0d9488',
  failure: '#ea580c',
  spend: '#F59E0B',
  budget: '#ea580c',
} as const;

const OTHER_COLOR = '#94A3B8';

/** Stable colour per series name, so a model keeps its colour across charts. */
export function chartColor(name: string): string {
  if (name === 'Other') return OTHER_COLOR;
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return CHART_COLORS[h % CHART_COLORS.length];
}

/** Axis / grid / legend props shared by every chart, derived from the theme. */
export function useChartTheme() {
  const theme = useTheme();
  const tickFill = theme.palette.text.secondary;
  return {
    grid: {
      stroke: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
      strokeDasharray: '2 4',
      vertical: false,
    },
    axis: {
      tick: { fontSize: 11, fill: tickFill },
      tickLine: false,
      axisLine: { stroke: alpha(theme.palette.text.primary, 0.12) },
    },
    legend: {
      wrapperStyle: {
        fontSize: 11,
        color: tickFill,
        paddingTop: 8,
      },
      iconType: 'circle' as const,
      iconSize: 8,
    },
    cursor: { fill: alpha(theme.palette.text.primary, 0.05) },
  };
}


// ── status pills ──────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function toneColor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case 'success': return theme.palette.success.main;
    case 'warning': return theme.palette.warning.main;
    case 'danger': return theme.palette.error.main;
    case 'info': return theme.palette.info.main;
    case 'accent': return theme.palette.primary.main;
    default: return theme.palette.text.secondary;
  }
}

