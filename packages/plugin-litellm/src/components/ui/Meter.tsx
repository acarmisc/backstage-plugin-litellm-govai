import React from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { toneColor, type Tone } from './tokens';
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

