import React from 'react';
import { Box, Typography, LinearProgress, Paper, Chip } from '@mui/material';
import { Warning } from '@mui/icons-material';
import { UserInfo } from '../types';

interface DashboardHeaderProps {
  userInfo: UserInfo;
  loading: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ userInfo, loading }) => {
  if (loading) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <LinearProgress />
      </Paper>
    );
  }

  const displayName = userInfo.user_email ?? userInfo.email ?? userInfo.user_id;
  const budget = userInfo.max_budget ?? 0;
  const spend = userInfo.spend ?? userInfo.current_spend ?? 0;
  const budgetPct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const isOver = budget > 0 && spend >= budget;
  const isNear = budget > 0 && spend >= budget * 0.8 && !isOver;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
        <Box flexGrow={1}>
          <Typography variant="h6">{displayName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {userInfo.user_id}
          </Typography>
        </Box>

        {budget > 0 && (
          <Box minWidth={220}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2">
                ${spend.toFixed(2)} / ${budget.toFixed(2)}
              </Typography>
              {isOver && <Chip icon={<Warning />} label="Over Budget" size="small" color="error" />}
              {isNear && <Chip label="Near Limit" size="small" color="warning" />}
            </Box>
            <LinearProgress
              variant="determinate"
              value={budgetPct}
              color={isOver ? 'error' : isNear ? 'warning' : 'primary'}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
};
