import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Collapse,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { ExpandMore, ExpandLess, Group } from '@mui/icons-material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TeamInfo, UsageMetrics, DateRange } from '../types';

interface TeamCardProps {
  team: TeamInfo;
  usage: UsageMetrics | null;
  usageLoading: boolean;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, usage, usageLoading }) => {
  const [expanded, setExpanded] = useState(false);

  const budget = team.max_budget ?? 0;
  const spend = team.spend ?? 0;
  const budgetPct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const isOver = budget > 0 && spend >= budget;
  const isNear = budget > 0 && spend >= budget * 0.8 && !isOver;

  const dailyData = usage?.daily_usage?.map(d => ({ date: d.date, spend: d.spend })) ?? [];

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box display="flex" alignItems="center" gap={1}>
        <Group color="action" />
        <Box flexGrow={1}>
          <Typography variant="subtitle1" fontWeight={600}>
            {team.team_alias ?? team.team_id}
          </Typography>
          {team.models?.length ? (
            <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
              {team.models.map(m => (
                <Chip key={m} label={m} size="small" variant="outlined" />
              ))}
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">All models</Typography>
          )}
        </Box>
        <IconButton size="small" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      {budget > 0 && (
        <Box mt={1.5}>
          <Box display="flex" justifyContent="space-between" mb={0.5}>
            <Typography variant="body2">
              ${spend.toFixed(2)} / ${budget.toFixed(2)}
            </Typography>
            {isOver && <Chip label="Over Budget" size="small" color="error" />}
            {isNear && <Chip label="Near Limit" size="small" color="warning" />}
          </Box>
          <LinearProgress
            variant="determinate"
            value={budgetPct}
            color={isOver ? 'error' : isNear ? 'warning' : 'primary'}
            sx={{ height: 6, borderRadius: 1 }}
          />
        </Box>
      )}

      <Collapse in={expanded}>
        <Box mt={2}>
          {usageLoading ? (
            <Box display="flex" justifyContent="center" p={2}>
              <CircularProgress size={24} />
            </Box>
          ) : dailyData.length > 0 ? (
            <>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Daily Spend
              </Typography>
              <Box height={160}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Spend']} />
                    <Area type="monotone" dataKey="spend" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </>
          ) : null}

          {team.members_with_roles?.length ? (
            <Box mt={2}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Members
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>User</TableCell>
                      <TableCell>Role</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {team.members_with_roles.map(m => (
                      <TableRow key={m.user_id}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{m.user_id}</TableCell>
                        <TableCell>
                          <Chip
                            label={m.role}
                            size="small"
                            color={m.role === 'admin' ? 'primary' : 'default'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : null}
        </Box>
      </Collapse>
    </Paper>
  );
};

interface TeamUsageProps {
  teams: TeamInfo[];
  loading: boolean;
  dateRange: DateRange;
  getTeamUsage: (teamId: string) => UsageMetrics | null;
  getTeamUsageLoading: (teamId: string) => boolean;
}

export const TeamUsage: React.FC<TeamUsageProps> = ({
  teams,
  loading,
  getTeamUsage,
  getTeamUsageLoading,
}) => {
  if (loading) {
    return (
      <Paper sx={{ p: 2 }}>
        <LinearProgress />
      </Paper>
    );
  }

  if (!teams.length) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" gap={1}>
          <Group color="disabled" />
          <Typography color="text.secondary" variant="body2">
            No team membership found in LiteLLM for this account.
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Box>
      <Typography variant="h6" mb={1}>Teams</Typography>
      {teams.map(team => (
        <TeamCard
          key={team.team_id}
          team={team}
          usage={getTeamUsage(team.team_id)}
          usageLoading={getTeamUsageLoading(team.team_id)}
        />
      ))}
    </Box>
  );
};
