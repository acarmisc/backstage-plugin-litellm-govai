import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { toneColor, type Tone } from './tokens';
/**
 * Ring gauge for at-a-glance ratios. Hand-drawn SVG rather than MUI's
 * `CircularProgress`: the track has to stay a neutral hairline (MUI tints it
 * from the bar colour, so an empty ring reads as full), and the value may
 * legitimately exceed 100% — the arc clamps at a full turn while the centre
 * label keeps the real number.
 */
export const Gauge: React.FC<{
  /** Share consumed, 0..100+ (unclamped for the label). */
  value: number;
  tone?: Tone;
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  /** Centre content; defaults to the rounded percentage. */
  label?: React.ReactNode;
  /** Small caption under the value, inside the ring. */
  caption?: React.ReactNode;
  /** Optional aria-label for accessibility. */
  ariaLabel?: string;
}> = ({ value, tone = 'accent', size = 72, thickness = 6, label, caption, ariaLabel }) => {
  const clamped = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  const isOverCap = value > 100;

  return (
    <Box
      sx={theme => ({
        position: 'relative',
        width: size,
        height: size,
        color: toneColor(theme, tone),
      })}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      aria-valuetext={isOverCap ? `${Math.round(value)}% — over cap` : undefined}
    >
      <Box
        component="svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        sx={{ display: 'block', transform: 'rotate(-90deg)' }}
      >
        <Box
          component="circle"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          sx={theme => ({
            stroke: alpha(
              theme.palette.text.primary,
              theme.palette.mode === 'dark' ? 0.14 : 0.09,
            ),
          })}
        />
        <Box
          component="circle"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          sx={theme => ({
            stroke: 'currentColor',
            transition: theme.transitions.create('stroke-dasharray'),
          })}
        />
      </Box>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        <Typography
          sx={{
            fontSize: size <= 64 ? 15 : 18,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          {isOverCap ? 'Over cap' : (label ?? `${Math.round(value)}%`)}
        </Typography>
        {caption && (
          <Typography
            variant="caption"
            sx={{ fontSize: 9.5, color: 'text.secondary', mt: 0.25 }}
          >
            {caption}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

