import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { fmtDateShort } from './tokens';

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

