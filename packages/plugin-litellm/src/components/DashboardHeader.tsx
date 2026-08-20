import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import { Add } from '@mui/icons-material';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { expiryStatus } from '../api';
import { TagChip, Tone } from './ui';

interface DashboardHeaderProps {
  userInfo: UserInfo;
  teams: TeamInfo[];
  keys: VirtualKey[];
  loading: boolean;
  onGenerateKeyClick: () => void;
  /** Page tab bar, rendered flush with the bottom edge of the header card. */
  tabs?: React.ReactNode;
}

/** Two initials from an email or username, for the identity badge. */
function initials(name: string): string {
  const local = name.split('@')[0] ?? name;
  const parts = local.split(/[.\-_\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

const CountStat: React.FC<{ value: number; label: string; tone: Tone }> = ({ value, label, tone }) => {
  // Zero counts stay grey: only a real expiry deserves a colour.
  const active = value > 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        sx={theme => ({
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: active
            ? (tone === 'danger' && theme.palette.error.main) ||
              (tone === 'warning' && theme.palette.warning.main) ||
              theme.palette.primary.main
            : alpha(theme.palette.text.primary, 0.25),
        })}
      />
      <Typography
        component="span"
        sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
      <Typography
        component="span"
        color="text.secondary"
        sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}
      >
        {label}
      </Typography>
    </Box>
  );
};

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userInfo,
  teams,
  keys,
  loading,
  onGenerateKeyClick,
  tabs,
}) => {
  const counts = useMemo(() => {
    const expired = keys.filter(k => expiryStatus(k.expires_at) === 'expired').length;
    const expiringSoon = keys.filter(k => expiryStatus(k.expires_at) === 'soon').length;
    return { total: keys.length, expired, expiringSoon };
  }, [keys]);

  const displayName = userInfo.user_email ?? userInfo.email ?? userInfo.user_id;

  return (
    <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          flexWrap: 'wrap',
          px: 2.5,
          pt: 2.5,
          pb: 2,
        }}
      >
        <Box
          sx={theme => ({
            width: 44,
            height: 44,
            borderRadius: 1.5,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: theme.palette.primary.main,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.02em',
          })}
        >
          {initials(displayName)}
        </Box>

        <Box sx={{ flexGrow: 1, minWidth: 220 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.25, wordBreak: 'break-word' }}>
            {displayName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            {userInfo.user_id}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1, minHeight: 20 }}>
            {loading ? (
              <Skeleton variant="rounded" width={140} height={20} />
            ) : (
              teams.map(team => (
                <TagChip
                  key={team.team_id}
                  label={team.team_alias || team.team_id}
                  title={team.team_id}
                />
              ))
            )}
          </Box>
        </Box>

        <Button
          variant="contained"
          color="primary"
          disableElevation
          startIcon={<Add />}
          onClick={onGenerateKeyClick}
        >
          Generate New Key
        </Button>
      </Box>

      <Divider />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2.5,
          flexWrap: 'wrap',
          px: 2.5,
          py: 1.5,
        }}
      >
        <CountStat value={counts.total} label="keys" tone="accent" />
        <Divider orientation="vertical" flexItem sx={{ my: 0.25 }} />
        <CountStat value={counts.expired} label="expired" tone="danger" />
        <Divider orientation="vertical" flexItem sx={{ my: 0.25 }} />
        <CountStat value={counts.expiringSoon} label="expiring soon" tone="warning" />
      </Box>

      {tabs && (
        <>
          <Divider />
          <Box sx={{ px: 1 }}>{tabs}</Box>
        </>
      )}
    </Paper>
  );
};
