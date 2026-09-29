import React from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { toneColor, type Tone } from './tokens';
/**
 * Progress meter with an explicitly drawn track. MUI's `LinearProgress` tints
 * its track from the bar colour, which makes an empty bar look full.
 */
export const Meter: React.FC<{
  value: number;
  tone?: Tone;
  height?: number;
  /** Optional aria-label for accessibility. */
  ariaLabel?: string;
}> = ({
  value,
  tone = 'accent',
  height = 5,
  ariaLabel,
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const isOverCap = value > 100;

  return (
    <Box>
    <Box
      sx={theme => ({
        height,
        borderRadius: height,
        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
        overflow: 'hidden',
      })}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      aria-valuetext={isOverCap ? `${Math.round(value)}% — over cap` : undefined}
    >
      <Box
        sx={theme => ({
          height: '100%',
          width: `${clamped}%`,
          borderRadius: height,
          bgcolor: toneColor(theme, tone),
          transition: theme.transitions.create('width'),
        })}
      />
    </Box>
      {isOverCap && (
        <Box
          sx={{
            textAlign: 'center',
            fontSize: 10,
            fontWeight: 600,
            color: 'text.primary',
            mt: 0.25,
          }}
        >
          Over cap
        </Box>
      )}
    </Box>
  );
};

