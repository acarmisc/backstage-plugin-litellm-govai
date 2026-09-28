import React from 'react';
import Button from '@mui/material/Button';
import { Add } from '@mui/icons-material';
import { Link } from '@backstage/core-components';

/**
 * The single "create a key" call-to-action used everywhere in the plugin —
 * the plugin page (header, keys table) and the homepage budget card all
 * render this instead of their own inline `Button`, so the copy, icon and
 * styling stay identical.
 */
export interface GenerateKeyButtonProps {
  /** Deep-link target (e.g. `/litellm?generate=1`). Ignored when `onClick` is set. */
  to?: string;
  /** Click handler. Takes precedence over `to` when both are given. */
  onClick?: () => void;
  /** Override the default `Generate New Key` copy (e.g. empty-state variants). */
  label?: string;
  /** Button size — card footers use `small`, page headers the default. */
  size?: 'small' | 'medium' | 'large';
}

export const GenerateKeyButton: React.FC<GenerateKeyButtonProps> = ({
  to,
  onClick,
  label = 'Generate New Key',
  size,
}) => {
  if (onClick) {
    return (
      <Button
        variant="contained"
        color="primary"
        disableElevation
        size={size}
        startIcon={<Add />}
        onClick={onClick}
      >
        {label}
      </Button>
    );
  }
  if (to) {
    return (
      <Button
        variant="contained"
        color="primary"
        disableElevation
        size={size}
        startIcon={<Add />}
        component={Link}
        to={to}
      >
        {label}
      </Button>
    );
  }
  return (
    <Button
      variant="contained"
      color="primary"
      disableElevation
      size={size}
      startIcon={<Add />}
      disabled
    >
      {label}
    </Button>
  );
};
