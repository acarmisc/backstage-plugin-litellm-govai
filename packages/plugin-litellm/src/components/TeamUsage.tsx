import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  LinearProgress,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Collapse,
  IconButton,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { ExpandMore, ExpandLess, Group, Speed, Memory } from '@mui/icons-material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TeamInfo, UsageMetrics } from '../types';

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
      {value}
    </Typography>
  </Box>
);

interface TeamCardProps {
  team: TeamInfo;
  usage: UsageMetrics | null;
  usageLoading: boolean;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, usage, usageLoading }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const gridStroke = theme.palette.divider;
  const tickFill = theme.palette.text.secondary;

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
            {team.team_alias || 'Untitled team'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {team.team_id}
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => setExpanded(e => !e)} aria-label="toggle details">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      <Stack direction="row" spacing={3} mt={1.5} flexWrap="wrap" useFlexGap gap={1.5}>
        <Stat
          label="Members"
          value={
            team.members_with_roles?.length
              ? String(team.members_with_roles.length)
              : '—'
          }
        />
        <Stat
          label="Models"
          value={
            team.models?.length ? String(team.models.length) : 'All'
          }
        />
        <Stat
          label="Budget"
          value={budget > 0 ? `$${budget.toFixed(2)}` : 'Unlimited'}
        />
        <Stat
          label="Spend"
          value={`$${spend.toFixed(2)}`}
        />
        <Stat
          label="TPM"
          value={team.tpm_limit != null && team.tpm_limit > 0 ? String(team.tpm_limit) : '—'}
        />
        <Stat
          label="RPM"
          value={team.rpm_limit != null && team.rpm_limit > 0 ? String(team.rpm_limit) : '—'}
        />
      </Stack>

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
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Speed fontSize="small" color="action" />
            <Typography variant="subtitle2" color="text.secondary">
              Rate limits
            </Typography>
          </Box>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap gap={1.5} mb={2}>
            <Stat label="TPM limit" value={team.tpm_limit != null && team.tpm_limit > 0 ? String(team.tpm_limit) : 'Unlimited'} />
            <Stat label="RPM limit" value={team.rpm_limit != null && team.rpm_limit > 0 ? String(team.rpm_limit) : 'Unlimited'} />
            <Stat label="Max budget" value={budget > 0 ? `$${budget.toFixed(2)}` : 'Unlimited'} />
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Models
          </Typography>
          {team.models?.length ? (
            <Box display="flex" gap={0.5} flexWrap="wrap" mb={2}>
              {team.models.map(m => (
                <Chip key={m} label={m} size="small" variant="outlined" />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" mb={2}>
              All models allowed
            </Typography>
          )}

          <Divider sx={{ mb: 2 }} />

          {usageLoading ? (
            <Box display="flex" justifyContent="center" p={2}>
              <CircularProgress size={24} />
            </Box>
          ) : dailyData.length > 0 ? (
            <>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Daily Spend
              </Typography>
              <Box height={160} mb={2}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickFill }} />
                    <YAxis tick={{ fontSize: 11, fill: tickFill }} tickFormatter={v => `$${v.toFixed(2)}`} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Spend']} />
                    <Area type="monotone" dataKey="spend" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Divider sx={{ mb: 2 }} />
            </>
          ) : null}

          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Memory fontSize="small" color="action" />
            <Typography variant="subtitle2" color="text.secondary">
              Members
            </Typography>
          </Box>
          {team.members_with_roles?.length ? (
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
          ) : (
            <Typography variant="body2" color="text.secondary">
              No members assigned.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

interface TeamUsageProps {
  teams: TeamInfo[];
  loading: boolean;
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
        <Box display="flex" alignItems="flex-start" gap={1.5}>
          <Group color="disabled" sx={{ mt: 0.5 }} />
          <Box>
            <Typography color="text.secondary" variant="body2">
              You're not a member of any LiteLLM team yet.
            </Typography>
            <Typography color="text.secondary" variant="body2" mt={0.5}>
              That's fine — your account is provisioned, so you can still generate
              personal keys and use models. If you need a shared budget with
              colleagues, ask an admin to add you to a team.
            </Typography>
          </Box>
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
