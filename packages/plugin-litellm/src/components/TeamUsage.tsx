import React, { useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import { ExpandMore, Group } from '@mui/icons-material';
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
import {
  ChartTooltip,
  EmptyState,
  Meter,
  SectionCard,
  Stat,
  StatusPill,
  TagChip,
  Tone,
  dataTableSx,
  fmtDateShort,
  fmtUsdCompact,
  useChartTheme,
  SERIES,
} from './ui';

function budgetTone(isOver: boolean, isNear: boolean): Tone {
  if (isOver) return 'danger';
  if (isNear) return 'warning';
  return 'accent';
}

const fmtUsd2 = (n: number) => `$${(n ?? 0).toFixed(2)}`;

interface TeamCardProps {
  team: TeamInfo;
  usage: UsageMetrics | null;
  usageLoading: boolean;
  canManage?: boolean;
  onEditTeam?: (team: TeamInfo) => void;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, usage, usageLoading, canManage, onEditTeam }) => {
  const [expanded, setExpanded] = useState(false);
  const chart = useChartTheme();

  const budget = team.max_budget ?? 0;
  const spend = team.spend ?? 0;
  const budgetPct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const isOver = budget > 0 && spend >= budget;
  const isNear = budget > 0 && spend >= budget * 0.8 && !isOver;

  const dailyData = usage?.daily_usage?.map(d => ({ date: d.date, spend: d.spend })) ?? [];

  const renderDailySpendSection = () => {
    if (usageLoading) {
      return (
        <Box display="flex" justifyContent="center" py={3}>
          <CircularProgress size={22} />
        </Box>
      );
    }
    if (dailyData.length === 0) return null;
    return (
      <Box mb={2.5}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', mb: 1 }}
        >
          Daily spend
        </Typography>
        <Box height={150}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...chart.grid} />
              <XAxis dataKey="date" tickFormatter={fmtDateShort} {...chart.axis} />
              <YAxis tickFormatter={fmtUsdCompact} width={52} {...chart.axis} />
              <Tooltip
                cursor={chart.cursor}
                content={<ChartTooltip valueFormatter={v => `$${v.toFixed(4)}`} />}
              />
              <Area
                type="monotone"
                dataKey="spend"
                name="Spend"
                stroke={SERIES.spend}
                strokeWidth={2}
                fill={SERIES.spend}
                fillOpacity={0.18}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    );
  };

  const sectionLabel = (label: string) => (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', mb: 1 }}
    >
      {label}
    </Typography>
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
      <Box display="flex" alignItems="center" gap={1.5}>
        <Box
          sx={theme => ({
            width: 36,
            height: 36,
            borderRadius: 1.5,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
          })}
        >
          <Group fontSize="small" />
        </Box>
        <Box flexGrow={1} minWidth={0}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {team.team_alias || 'Untitled team'}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}
          >
            {team.team_id}
          </Typography>
        </Box>
        {isOver && <StatusPill label="Over budget" tone="danger" />}
        {isNear && <StatusPill label="Near limit" tone="warning" />}
        {canManage && onEditTeam && (
          <Button
            size="small"
            variant="text"
            onClick={() => onEditTeam(team)}
            sx={{ textTransform: 'none' }}
          >
            Edit
          </Button>
        )}
        <IconButton
          size="small"
          onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? 'Hide team details' : 'Show team details'}
          aria-expanded={expanded}
          sx={theme => ({
            color: theme.palette.text.secondary,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: theme.transitions.create('transform'),
          })}
        >
          <ExpandMore />
        </IconButton>
      </Box>

      {/* Fixed-track grid, capped in width, so the six stats line up across
          every team card instead of stretching to fill the row. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(6, minmax(0, 1fr))' },
          gap: 2,
          mt: 2.5,
          maxWidth: 640,
        }}
      >
        <Stat label="Members" value={team.members_with_roles?.length ?? '—'} />
        <Stat label="Models" value={team.models?.length ? team.models.length : 'All'} />
        <Stat label="Budget" value={budget > 0 ? fmtUsd2(budget) : 'Unlimited'} />
        <Stat label="Spend" value={fmtUsd2(spend)} />
        <Stat label="TPM" value={team.tpm_limit && team.tpm_limit > 0 ? team.tpm_limit.toLocaleString() : '—'} />
        <Stat label="RPM" value={team.rpm_limit && team.rpm_limit > 0 ? team.rpm_limit.toLocaleString() : '—'} />
      </Box>

      {budget > 0 && (
        <Box mt={2} maxWidth={640}>
          <Box display="flex" justifyContent="space-between" alignItems="baseline" mb={0.75}>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtUsd2(spend)} of {fmtUsd2(budget)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {budgetPct.toFixed(0)}%
            </Typography>
          </Box>
          <Meter value={budgetPct} tone={budgetTone(isOver, isNear)} height={5} />
        </Box>
      )}

      <Collapse in={expanded} unmountOnExit>
        <Divider sx={{ my: 2.5 }} />

        <Box mb={2.5}>
          {sectionLabel('Models')}
          {team.models?.length ? (
            <Box display="flex" gap={0.5} flexWrap="wrap">
              {team.models.map(m => (
                <TagChip key={m} label={m} title={m} />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">All models allowed</Typography>
          )}
        </Box>

        {renderDailySpendSection()}

        <Box>
          {sectionLabel('Members')}
          {team.members_with_roles?.length ? (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ borderRadius: 1.5 }}
            >
              <Table size="small" sx={dataTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell align="right">Role</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {team.members_with_roles.map(m => (
                    <TableRow key={m.user_id}>
                      <TableCell>
                        {m.user_email ? (
                          <>
                            <Typography variant="body2">{m.user_email}</Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}
                            >
                              {m.user_id}
                            </Typography>
                          </>
                        ) : (
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          >
                            {m.user_id}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <StatusPill
                          label={m.role}
                          tone={m.role === 'admin' ? 'accent' : 'neutral'}
                          dot={false}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">No members assigned.</Typography>
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
  canManage?: boolean;
  onEditTeam?: (team: TeamInfo) => void;
}

export const TeamUsage: React.FC<TeamUsageProps> = ({
  teams,
  loading,
  getTeamUsage,
  getTeamUsageLoading,
  canManage,
  onEditTeam,
}) => {
  if (loading) {
    return (
      <SectionCard title="Teams">
        <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} />
      </SectionCard>
    );
  }

  if (!teams.length) {
    return (
      <SectionCard title="Teams">
        <EmptyState
          message="You're not a member of any LiteLLM team yet."
          hint="Your account is provisioned, so you can still generate personal keys and use models. Ask an admin to add you to a team if you need a shared budget."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Teams" subtitle={`${teams.length} team${teams.length === 1 ? '' : 's'}`}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {teams.map(team => (
          <TeamCard
            key={team.team_id}
            team={team}
            usage={getTeamUsage(team.team_id)}
            usageLoading={getTeamUsageLoading(team.team_id)}
            canManage={canManage}
            onEditTeam={onEditTeam}
          />
        ))}
      </Box>
    </SectionCard>
  );
};
