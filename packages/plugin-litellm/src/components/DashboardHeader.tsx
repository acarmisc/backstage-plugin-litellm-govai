import React from 'react';
import { Box, Typography, LinearProgress, Paper, Chip } from '@mui/material';
import { Warning, Group } from '@mui/icons-material';
import { UserInfo } from '../types';

interface DashboardHeaderProps {
  userInfo: UserInfo | null;
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

  if (!userInfo) {
    return null;
  }

  const budget = userInfo.max_budget ?? 0;
  const spend = userInfo.current_spend ?? 0;
  const budgetPercentage = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const isOverBudget = budget > 0 && spend >= budget;
  const isNearLimit = budget > 0 && spend >= budget * 0.8 && !isOverBudget;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
        <Box flexGrow={1}>
          <Typography variant="h6">{userInfo.email}</Typography>
          {userInfo.team_alias && (
            <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
              <Group fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {userInfo.team_alias}
              </Typography>
            </Box>
          )}
        </Box>

        {budget > 0 && (
          <Box minWidth={200}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2">
                Spend: ${spend.toFixed(2)} / ${budget.toFixed(2)}
              </Typography>
              {isOverBudget && (
                <Chip icon={<Warning />} label="Over Budget" size="small" color="error" />
              )}
              {isNearLimit && <Chip label="Near Limit" size="small" color="warning" />}
            </Box>
            <LinearProgress
              variant="determinate"
              value={budgetPercentage}
              color={isOverBudget ? 'error' : isNearLimit ? 'warning' : 'primary'}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
};
