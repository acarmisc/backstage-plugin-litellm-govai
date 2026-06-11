import React from 'react';
import { Box, Typography, LinearProgress, Paper, Chip } from '@mui/material';
import { UserInfo, TeamInfo } from '../types';

interface DashboardHeaderProps {
  userInfo: UserInfo;
  teams: TeamInfo[];
  loading: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ userInfo, teams, loading }) => {
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
      </Box>
    </Paper>
  );
};
