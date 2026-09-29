import React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { toneColor, type Tone } from './tokens';
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

