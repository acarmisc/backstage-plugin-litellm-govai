import React, { useMemo } from 'react';
import { Box, Typography, LinearProgress, Paper, Chip, Button, Stack } from '@mui/material';
import { Add, Key, Warning, Schedule } from '@mui/icons-material';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { expiryStatus } from '../api';

interface DashboardHeaderProps {
  userInfo: UserInfo;
  teams: TeamInfo[];
  keys: VirtualKey[];
  loading: boolean;
  onGenerateKeyClick: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userInfo,
  teams,
  keys,
  loading,
  onGenerateKeyClick,
}) => {
  const counts = useMemo(() => {
    const expired = keys.filter(k => expiryStatus(k.expires_at) === 'expired').length;
    const expiringSoon = keys.filter(k => expiryStatus(k.expires_at) === 'soon').length;
    return { total: keys.length, expired, expiringSoon };
  }, [keys]);

  if (loading) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <LinearProgress />
      </Paper>
    );
  }

  const displayName = userInfo.user_email ?? userInfo.email ?? userInfo.user_id;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box display="flex" alignItems="flex-start" gap={2} flexWrap="wrap">
        <Box flexGrow={1}>
          <Typography variant="h6">{displayName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {userInfo.user_id}
          </Typography>

          {teams.length > 0 && (
            <Box display="flex" gap={0.75} flexWrap="wrap" mt={1}>
              {teams.map(team => (
                <Chip
                  key={team.team_id}
                  label={team.team_alias || team.team_id}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              ))}
            </Box>
          )}
        </Box>

        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Stack direction="row" spacing={1}>
            <Chip icon={<Key fontSize="small" />} label={`${counts.total} keys`} size="small" />
            <Chip
              icon={<Warning fontSize="small" />}
              label={`${counts.expired} expired`}
              size="small"
              color={counts.expired > 0 ? 'error' : 'default'}
            />
            <Chip
              icon={<Schedule fontSize="small" />}
              label={`${counts.expiringSoon} expiring soon`}
              size="small"
              color={counts.expiringSoon > 0 ? 'warning' : 'default'}
            />
          </Stack>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={onGenerateKeyClick}
          >
            Generate New Key
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};
