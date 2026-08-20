/**
 * Shared presentation primitives for the LiteLLM plugin.
 *
 * The plugin renders inside whatever Backstage theme the host app supplies, so
 * everything here derives its colour from the MUI palette rather than hard-coded
 * values. The one exception is the chart series palette: Recharts has no theme
 * awareness, and its stock colours (#8884d8 / #82ca9d / #ffc658) read as a demo
 * rather than a product, so we ship a curated ramp that holds up on both light
 * and dark surfaces.
 */
import React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

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
  success: '#10B981',
  failure: '#EF4444',
  spend: '#F59E0B',
  budget: '#EF4444',
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

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string | number }>;
  /** Formats each series value; defaults to a localised integer. */
  valueFormatter?: (value: number) => string;
  /** Formats the header; defaults to the short date form. */
  labelFormatter?: (label: string) => string;
  /** Drop zero-valued series — useful for stacked charts with many series. */
  hideZero?: boolean;
}

/**
 * Recharts' default tooltip is an opaque white card with a hard border — it
 * disappears on dark themes. This one uses the theme's own surface tokens.
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  label,
  payload,
  valueFormatter = (v: number) => v.toLocaleString(),
  labelFormatter = fmtDateShort,
  hideZero = false,
}) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(
    p => p.value !== undefined && p.value !== null && (!hideZero || p.value !== 0),
  );
  if (!rows.length) return null;
  return (
    <Paper
      elevation={8}
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        minWidth: 150,
        pointerEvents: 'none',
      }}
    >
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, mb: 0.75, letterSpacing: '0.02em' }}
      >
        {typeof label === 'string' ? labelFormatter(label) : label}
      </Typography>
      {rows.map((row, i) => (
        <Box
          key={`${row.dataKey ?? row.name ?? i}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: i === 0 ? 0 : 0.5 }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: row.color,
              flexShrink: 0,
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flex: 1, mr: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {row.name}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {valueFormatter(row.value as number)}
          </Typography>
        </Box>
      ))}
    </Paper>
  );
};

/**
 * Colour key rendered outside the SVG. Recharts' own `<Legend>` cannot ellipsize,
 * so a handful of fully-qualified model names ("bedrock/eu.anthropic.…") wrap
 * into a ragged block that eats the plot area.
 */
export const SeriesLegend: React.FC<{ series: Array<{ name: string; color: string }> }> = ({
  series,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 0.5,
      columnGap: 2,
      rowGap: 0.5,
      mt: 1.5,
    }}
  >
    {series.map(s => (
      <Box key={s.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          title={s.name}
          sx={{
            fontSize: 11,
            maxWidth: 190,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {s.name}
        </Typography>
      </Box>
    ))}
  </Box>
);

// ── status pills ──────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

function toneColor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case 'success': return theme.palette.success.main;
    case 'warning': return theme.palette.warning.main;
    case 'danger': return theme.palette.error.main;
    case 'info': return theme.palette.info.main;
    case 'accent': return theme.palette.primary.main;
    default: return theme.palette.text.secondary;
  }
}

/**
 * A soft status badge. Deliberately *not* MUI's filled `Chip` — host themes
 * tend to render those as saturated pills, and a table with one screaming
 * orange pill per row is unreadable. Tinted background, hairline border,
 * squared-off corners.
 */
export const StatusPill: React.FC<{
  label: React.ReactNode;
  tone?: Tone;
  /** Show the leading tone dot. */
  dot?: boolean;
  title?: string;
  sx?: SxProps<Theme>;
}> = ({ label, tone = 'neutral', dot = true, title, sx }) => (
  <Box
    component="span"
    title={title}
    sx={[
      theme => {
        const c = toneColor(theme, tone);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.625,
          height: 22,
          px: 0.875,
          borderRadius: '6px',
          border: '1px solid',
          borderColor: alpha(c, tone === 'neutral' ? 0.25 : 0.35),
          bgcolor: alpha(c, tone === 'neutral' ? 0.06 : 0.12),
          color: tone === 'neutral' ? theme.palette.text.secondary : c,
          fontSize: 11.5,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        };
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {dot && (
      <Box
        component="span"
        sx={theme => ({
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: toneColor(theme, tone),
          flexShrink: 0,
        })}
      />
    )}
    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label}
    </Box>
  </Box>
);

/** Quiet monospace tag for identifiers: model names, team slugs, roles. */
export const TagChip: React.FC<{ label: React.ReactNode; title?: string; mono?: boolean }> = ({
  label,
  title,
  mono = true,
}) => (
  <Box
    component="span"
    title={title}
    sx={theme => ({
      display: 'inline-flex',
      alignItems: 'center',
      height: 20,
      px: 0.75,
      borderRadius: '5px',
      bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.05),
      color: theme.palette.text.secondary,
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
      fontSize: 11,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      maxWidth: 220,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    })}
  >
    {label}
  </Box>
);

// ── surfaces ──────────────────────────────────────────────────────────────────

/** Page-level surface with a consistent title row. */
export const SectionCard: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Set when the body renders its own edge-to-edge content (e.g. a table). */
  flush?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, flush = false, children }) => (
  <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
    {(title || actions) && (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          px: 2.5,
          py: 2,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{title}</Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          )}
        </Box>
        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {actions}
          </Box>
        )}
      </Box>
    )}
    <Box sx={flush ? undefined : { px: 2.5, pb: 2.5, pt: title ? 0 : 2.5 }}>{children}</Box>
  </Paper>
);

/** Bordered frame around a single chart, with its own caption row. */
export const ChartCard: React.FC<{
  title: React.ReactNode;
  meta?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
}> = ({ title, meta, height = 240, children }) => (
  // The plot area must have an explicit height, never a flex-derived one:
  // Recharts' ResponsiveContainer measures its parent, so a parent that sizes
  // itself from its children instead spins in a measure/resize loop.
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
      <Typography
        variant="subtitle2"
        sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        {title}
      </Typography>
      {meta && (
        <Typography variant="caption" color="text.secondary">{meta}</Typography>
      )}
    </Box>
    <Box sx={{ height, width: '100%' }}>{children}</Box>
  </Paper>
);

// ── metrics ───────────────────────────────────────────────────────────────────

export interface MetricDef {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

/**
 * KPI row rendered as one framed strip divided into cells, rather than four
 * loose cards. Cells share a baseline grid so the numbers line up even when
 * only some of them carry a hint.
 */
export const MetricStrip: React.FC<{ metrics: MetricDef[] }> = ({ metrics }) => (
  <Paper
    variant="outlined"
    sx={{
      borderRadius: 2,
      display: 'grid',
      gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${metrics.length}, 1fr)` },
      overflow: 'hidden',
    }}
  >
    {metrics.map((m, i) => (
      <Box
        key={m.label}
        sx={theme => ({
          px: 2.5,
          py: 2,
          borderLeft: i === 0 ? 0 : '1px solid',
          borderTop: 0,
          borderColor: 'divider',
          [theme.breakpoints.down('md')]: {
            borderLeft: i % 2 === 0 ? 0 : '1px solid',
            borderTop: i < 2 ? 0 : '1px solid',
            borderColor: 'divider',
          },
        })}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.875, mb: 0.75 }}>
          <Box
            sx={theme => ({
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: toneColor(theme, m.tone ?? 'accent'),
              flexShrink: 0,
            })}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}
          >
            {m.label}
          </Typography>
        </Box>
        <Typography
          sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}
        >
          {m.value}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5, minHeight: 16 }}
        >
          {m.hint ?? ' '}
        </Typography>
      </Box>
    ))}
  </Paper>
);

/** Label + value pair used inside cards. */
export const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: 'block', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}
    >
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', mt: 0.25 }}
    >
      {value}
    </Typography>
  </Box>
);

/**
 * Progress meter with an explicitly drawn track. MUI's `LinearProgress` tints
 * its track from the bar colour, which makes an empty bar look full.
 */
export const Meter: React.FC<{ value: number; tone?: Tone; height?: number }> = ({
  value,
  tone = 'accent',
  height = 5,
}) => (
  <Box
    sx={theme => ({
      height,
      borderRadius: height,
      bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
      overflow: 'hidden',
    })}
  >
    <Box
      sx={theme => ({
        height: '100%',
        width: `${Math.max(0, Math.min(100, value))}%`,
        borderRadius: height,
        bgcolor: toneColor(theme, tone),
        transition: theme.transitions.create('width'),
      })}
    />
  </Box>
);

// ── segmented control ─────────────────────────────────────────────────────────

/**
 * Secondary navigation inside a card. Hand-rolled rather than a second set of
 * `Tabs` so it reads as subordinate to the page tabs instead of competing
 * with them, and so host theme overrides on `MuiTab` don't leak in.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <Box
      role="tablist"
      sx={theme => ({
        display: 'inline-flex',
        gap: 0.25,
        p: 0.375,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: theme.palette.divider,
      })}
    >
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <ButtonBase
            key={opt.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            sx={theme => ({
              px: 1.5,
              height: 28,
              borderRadius: 1,
              fontSize: 13,
              fontWeight: selected ? 700 : 500,
              // Tint the selection with the accent rather than swapping in a
              // surface colour: on a dark theme `background.paper` sits *behind*
              // the track, so the selected chip would read as recessed.
              color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
              bgcolor: selected
                ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.11)
                : 'transparent',
              transition: theme.transitions.create(['background-color', 'color']),
              '&:hover': {
                color: selected ? theme.palette.primary.main : theme.palette.text.primary,
                bgcolor: selected
                  ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.26 : 0.15)
                  : alpha(theme.palette.text.primary, 0.05),
              },
            })}
          >
            {opt.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

// ── tables ────────────────────────────────────────────────────────────────────

/**
 * Shared table chrome: quiet uppercase headers, hairline row rules, a hover
 * highlight, and tabular figures so numeric columns align.
 */
export const dataTableSx: SxProps<Theme> = theme => ({
  // Element selectors, not `.MuiTableCell-head`: host apps may set a MUI
  // classname prefix (Backstage ships `v5-`), which breaks global class targeting.
  '& thead th': {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: theme.palette.text.secondary,
    backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.04 : 0.02),
    borderBottom: `1px solid ${theme.palette.divider}`,
    whiteSpace: 'nowrap',
    paddingTop: theme.spacing(1.25),
    paddingBottom: theme.spacing(1.25),
  },
  '& tbody td': {
    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
    paddingTop: theme.spacing(1.25),
    paddingBottom: theme.spacing(1.25),
    fontVariantNumeric: 'tabular-nums',
  },
  '& tbody tr:last-of-type td': {
    borderBottom: 0,
  },
  '& tbody tr:hover': {
    backgroundColor: alpha(theme.palette.text.primary, 0.03),
  },
});

/** Muted icon button that only picks up its semantic colour on hover. */
export const quietIconButtonSx = (tone: Tone = 'neutral'): SxProps<Theme> => theme => ({
  color: theme.palette.text.secondary,
  '&:hover': {
    color: toneColor(theme, tone),
    bgcolor: alpha(toneColor(theme, tone), 0.1),
  },
});

/** Centered empty / loading state for a card body. */
export const EmptyState: React.FC<{
  message: string;
  hint?: string;
  height?: number;
  action?: React.ReactNode;
}> = ({ message, hint, height, action }) => (
  <Box
    sx={{
      height,
      minHeight: height ? undefined : 120,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      textAlign: 'center',
      py: 3,
    }}
  >
    <Typography variant="body2" color="text.secondary">{message}</Typography>
    {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    {action}
  </Box>
);
