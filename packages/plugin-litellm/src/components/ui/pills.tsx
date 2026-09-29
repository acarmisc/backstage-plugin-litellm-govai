import React from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { toneColor, type Tone } from './tokens';
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

