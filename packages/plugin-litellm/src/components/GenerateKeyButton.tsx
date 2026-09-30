import { FC } from 'react';
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
  /** Stretch to the container width (card-footers). Defaults to false. */
  fullWidth?: boolean;
  /** Disabled state (e.g. until the account data loads). A disabled `to` renders inert. */
  disabled?: boolean;
}

export const GenerateKeyButton: FC<GenerateKeyButtonProps> = ({
  to,
  onClick,
  label = 'Generate New Key',
  size,
  fullWidth = false,
  disabled = false,
}) => {
  if (onClick && !disabled) {
    return (
      <Button
        variant="contained"
        color="primary"
        disableElevation
        size={size}
        fullWidth={fullWidth}
        startIcon={<Add />}
        onClick={onClick}
      >
        {label}
      </Button>
    );
  }
  if (to && !disabled) {
    return (
      <Button
        variant="contained"
        color="primary"
        disableElevation
        size={size}
        fullWidth={fullWidth}
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
      fullWidth={fullWidth}
      startIcon={<Add />}
      disabled
    >
      {label}
    </Button>
  );
};
