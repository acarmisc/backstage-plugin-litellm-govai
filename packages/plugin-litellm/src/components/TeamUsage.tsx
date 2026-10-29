import { FC, useState } from 'react';
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
import MuiTooltip from '@mui/material/Tooltip';
import { ExpandMore, Group, Add, LockOutlined, GroupAddOutlined } from '@mui/icons-material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { McpServerInfo, TeamInfo, TeamKeyUsage, TeamMemberUsage, UsageMetrics, VectorStoreInfo } from '../types';
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
  fmtCompact,
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

function visibleBudgetPct(spend: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min((spend / budget) * 100, 100);
}

function budgetStatValue(hidden: boolean, budget: number): string {
  if (hidden) return 'Hidden';
  if (budget > 0) return fmtUsd2(budget);
  return 'Unlimited';
}

const monoSx = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 };

const fmtShare = (pct: number) => `${pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%`;

/**
 * Per-member usage for the period as mini-cards, sorted by spend (the order
 * the backend sends). Dollars are replaced by the share of team spend when the
 * backend hides them.
 */
export const MemberUsageCards: FC<{ usage: TeamMemberUsage }> = ({ usage }) => {
  const hidden = usage.budget_hidden === true;
  if (!usage.members.length) {
    return <Typography variant="body2" color="text.secondary">No members or activity in this period.</Typography>;
  }
  const people = usage.members.filter(m => m.user_id !== null).length;
  return (
    <Box>
      {!hidden && people > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {`Team spend ${fmtUsd2(usage.total_spend)} · avg ${fmtUsd2(usage.total_spend / people)} per member`}
        </Typography>
      )}
      <Box
        role="list"
        aria-label="Usage by member"
        sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
      >
        {usage.members.map(m => {
          const name = m.display_name ?? m.user_email ?? m.user_id;
          // Second line: whichever identifier the first line does not show.
          let sub: string | null = null;
          if (m.display_name) sub = m.user_email ?? m.user_id;
          else if (m.user_email && m.user_id !== m.user_email) sub = m.user_id;
          const stats: [string, string][] = [
            ['Tokens', fmtCompact(m.total_tokens)],
            ['Requests', m.api_requests.toLocaleString()],
            ['Success', m.success_rate === null ? '—' : `${m.success_rate.toFixed(0)}%`],
            ['Keys', m.user_id === null ? '—' : String(m.key_count)],
          ];
          return (
            <Paper
              key={m.user_id ?? '__unattributed'}
              role="listitem"
              variant="outlined"
              sx={{ borderRadius: 1.5, p: 1.5, minWidth: 0 }}
            >
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Box minWidth={0}>
                  {m.user_id === null ? (
                    <MuiTooltip title="Activity of keys that were deleted or have no owner">
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        Unattributed
                      </Typography>
                    </MuiTooltip>
                  ) : (
                    <>
                      <Typography variant="body2" fontWeight={600} noWrap>{name}</Typography>
                      {sub && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ ...monoSx, display: 'block' }}>
                          {sub}
                        </Typography>
                      )}
                    </>
                  )}
                </Box>
                {m.role && <StatusPill label={m.role} tone={m.role === 'admin' ? 'accent' : 'neutral'} dot={false} />}
              </Box>
              <Box mt={1.5} display="flex" alignItems="baseline" justifyContent="space-between">
                <Typography variant="h6" component="span" sx={{ lineHeight: 1.2 }}>
                  {hidden ? fmtShare(m.spend_share_pct) : fmtUsd2(m.spend)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {hidden ? 'of team usage' : `${fmtShare(m.spend_share_pct)} of team`}
                </Typography>
              </Box>
              <Box mt={0.75}>
                <Meter value={m.spend_share_pct} ariaLabel={`${name ?? 'Unattributed'} share of team spend`} />
              </Box>
              <Box mt={1.5} display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={0.5}>
                {stats.map(([label, value]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                    <Typography variant="body2">{value}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
};

/**
 * A team's keys with the period's usage, for team leads. The backend never
 * sends secrets; dollars are dropped when it hides them.
 */
export const TeamKeyUsageTable: FC<{ usage: TeamKeyUsage }> = ({ usage }) => {
  const hidden = usage.budget_hidden === true;
  if (!usage.keys.length) {
    return <Typography variant="body2" color="text.secondary">This team has no keys.</Typography>;
  }
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
      <Table size="small" sx={dataTableSx} aria-label="Keys by member">
        <TableHead>
          <TableRow>
            <TableCell>Key</TableCell>
            <TableCell>Owner</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Status</TableCell>
            {!hidden && <TableCell align="right">Spend</TableCell>}
            {!hidden && <TableCell align="right">Budget</TableCell>}
            <TableCell align="right">Tokens</TableCell>
            <TableCell align="right">Requests</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {usage.keys.map(k => {
            const owner = k.display_name ?? k.user_email ?? k.user_id;
            return (
              <TableRow key={k.key}>
                <TableCell>
                  <Typography variant="body2">{k.key_alias ?? k.key}</Typography>
                  {k.key_alias && (
                    <Typography variant="caption" color="text.secondary" sx={monoSx}>
                      {k.key}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {owner ?? <Typography variant="body2" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell>{fmtDateShort(k.created_at)}</TableCell>
                <TableCell>
                  <StatusPill
                    label={k.blocked ? 'Blocked' : 'Active'}
                    tone={k.blocked ? 'danger' : 'success'}
                  />
                </TableCell>
                {!hidden && <TableCell align="right">{fmtUsd2(k.spend)}</TableCell>}
                {!hidden && (
                  <TableCell align="right">
                    {k.max_budget === undefined ? 'Unlimited' : fmtUsd2(k.max_budget)}
                  </TableCell>
                )}
                <TableCell align="right">{fmtCompact(k.total_tokens)}</TableCell>
                <TableCell align="right">{k.api_requests.toLocaleString()}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

interface TeamCardProps {
  team: TeamInfo;
  usage: UsageMetrics | null;
  usageLoading: boolean;
  /** Per-member breakdown; null when unavailable to the caller (the section is hidden). */
  memberUsage?: TeamMemberUsage | null;
  memberUsageLoading?: boolean;
  /** Per-key usage; null when unavailable to the caller (the section is hidden). */
  keyUsage?: TeamKeyUsage | null;
  keyUsageLoading?: boolean;
  memberUsageFailed?: boolean;
  keyUsageFailed?: boolean;
  canManage?: boolean;
  onEditTeam?: (team: TeamInfo) => void;
  /** Members-only management (team-role path); hidden when `canManage`. */
  canManageMembers?: boolean;
  onManageMembers?: (team: TeamInfo) => void;
  onExpand?: (team: TeamInfo) => void;
  vectorStores?: VectorStoreInfo[];
  mcpServers?: McpServerInfo[];
}

const TeamCard: FC<TeamCardProps> = ({ team, usage, usageLoading, memberUsage, memberUsageLoading, memberUsageFailed, keyUsage, keyUsageLoading, keyUsageFailed, canManage, onEditTeam, canManageMembers, onManageMembers, onExpand, vectorStores, mcpServers }) => {
  const [expanded, setExpanded] = useState(false);
  const chart = useChartTheme();

  const handleExpandChange = (newExpanded: boolean) => {
    setExpanded(newExpanded);
    if (newExpanded && onExpand) {
      onExpand(team);
    }
  };

  // When the backend redacts dollar amounts (budget hiding), only the
  // consumption level survives: pct + status + reset window. Spend charts
  // and `$` figures must stay hidden — usage spend is zeroed server-side
  // for the same reason.
  const hidden = team.budget_hidden === true;
  const budget = hidden ? 0 : team.max_budget ?? 0;
  const spend = hidden ? 0 : team.spend ?? 0;
  const budgetPct = hidden
    ? Math.min(100, Math.max(0, team.budget_pct ?? 0))
    : visibleBudgetPct(spend, budget);
  const isOver = hidden
    ? team.budget_status === 'over'
    : budget > 0 && spend >= budget;
  const isNear = hidden
    ? team.budget_status === 'near'
    : budget > 0 && spend >= budget * 0.8 && !isOver;

  const dailyData = usage?.daily_usage?.map(d => ({ date: d.date, spend: d.spend })) ?? [];

  const renderDailySpendSection = () => {
    // Spend is redacted server-side when the budget is hidden — a flat $0
    // chart would mislead, so the section is omitted entirely.
    if (hidden) return null;
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

  // Shows attached ids by display name, falling back to the id when unknown.
  const renderNamedTags = (
    label: string,
    ids: string[] | undefined,
    items: { id: string; name?: string }[] | undefined,
  ) => (
    <Box mb={2.5}>
      {sectionLabel(label)}
      {ids?.length ? (
        <Box display="flex" gap={0.5} flexWrap="wrap">
          {ids.map(id => (
            <TagChip key={id} label={items?.find(i => i.id === id)?.name ?? id} title={id} />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">None configured</Typography>
      )}
    </Box>
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
        {canManageMembers && onManageMembers && !canManage && (
          <MuiTooltip title="Add or remove members of this team">
            <Button
              size="small"
              variant="text"
              startIcon={<GroupAddOutlined />}
              onClick={() => onManageMembers(team)}
              sx={{ textTransform: 'none' }}
            >
              Manage members
            </Button>
          </MuiTooltip>
        )}
        <IconButton
          size="small"
          onClick={() => handleExpandChange(!expanded)}
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
        <Stat label="Budget" value={budgetStatValue(hidden, budget)} />
        <Stat label="Spend" value={hidden ? '—' : fmtUsd2(spend)} />
        <Stat label="TPM" value={team.tpm_limit && team.tpm_limit > 0 ? team.tpm_limit.toLocaleString() : '—'} />
        <Stat label="RPM" value={team.rpm_limit && team.rpm_limit > 0 ? team.rpm_limit.toLocaleString() : '—'} />
      </Box>

      {hidden && (
        <Box mt={2} maxWidth={640}>
          <Box display="flex" justifyContent="space-between" alignItems="baseline" mb={0.75}>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {budgetPct.toFixed(0)}% used
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hidden by admin
            </Typography>
          </Box>
          <Meter value={budgetPct} tone={budgetTone(isOver, isNear)} height={5} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Team budget is hidden — showing usage level only
            {team.budget_duration ? ` · resets every ${team.budget_duration}` : ''}.
          </Typography>
        </Box>
      )}

      {!hidden && budget > 0 && (
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

        {renderNamedTags('Knowledge bases', team.object_permission?.vector_stores, vectorStores)}
        {renderNamedTags('MCP servers', team.object_permission?.mcp_servers, mcpServers)}

        {renderDailySpendSection()}

        {(memberUsageLoading || memberUsage || memberUsageFailed) && (
          <Box mb={2.5}>
            {sectionLabel('Usage by member')}
            {memberUsage && <MemberUsageCards usage={memberUsage} />}
            {!memberUsage && memberUsageFailed && (
              <Typography variant="caption" color="text.secondary">Could not load per-member usage</Typography>
            )}
            {!memberUsage && !memberUsageFailed && (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={22} />
              </Box>
            )}
          </Box>
        )}

        {(keyUsageLoading || keyUsage || keyUsageFailed) && (
          <Box mb={2.5}>
            {sectionLabel('Keys by member')}
            {keyUsage && <TeamKeyUsageTable usage={keyUsage} />}
            {!keyUsage && keyUsageFailed && (
              <Typography variant="caption" color="text.secondary">Could not load per-key usage</Typography>
            )}
            {!keyUsage && !keyUsageFailed && (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={22} />
              </Box>
            )}
          </Box>
        )}

        {!memberUsage && (
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
        )}
      </Collapse>
    </Paper>
  );
};

interface TeamUsageProps {
  teams: TeamInfo[];
  loading: boolean;
  getTeamUsage: (teamId: string) => UsageMetrics | null;
  getTeamUsageLoading: (teamId: string) => boolean;
  /** Per-member breakdown for a team; null hides the section. */
  getTeamMemberUsage?: (teamId: string) => TeamMemberUsage | null;
  getTeamMemberUsageLoading?: (teamId: string) => boolean;
  /** Per-key usage for a team; null hides the section. */
  getTeamKeyUsage?: (teamId: string) => TeamKeyUsage | null;
  getTeamKeyUsageLoading?: (teamId: string) => boolean;
  /** True when the breakdown failed for a reason other than refusal: shows a caption. */
  getTeamMemberUsageFailed?: (teamId: string) => boolean;
  getTeamKeyUsageFailed?: (teamId: string) => boolean;
  canManage?: boolean;
  onEditTeam?: (team: TeamInfo) => void;
  /** When true (with `onCreateTeam`), a "Create Team" action renders in the section header. */
  canCreate?: boolean;
  onCreateTeam?: () => void;
  /** Called when a team card is expanded to trigger data loading. */
  onTeamExpand?: (team: TeamInfo) => void;
  /** Per-team: whether the caller may manage this team's members only. */
  canManageMembers?: (team: TeamInfo) => boolean;
  onManageMembers?: (team: TeamInfo) => void;
  /** Teams are synced from an identity provider: show a badge, no write controls. */
  readOnly?: boolean;
  /** Used to show knowledge base names instead of raw ids. */
  vectorStores?: VectorStoreInfo[];
  /** Used to show MCP server names instead of raw ids. */
  mcpServers?: McpServerInfo[];
}

export const TeamUsage: FC<TeamUsageProps> = ({
  teams,
  loading,
  getTeamUsage,
  getTeamUsageLoading,
  getTeamMemberUsage,
  getTeamMemberUsageLoading,
  getTeamKeyUsage,
  getTeamKeyUsageLoading,
  getTeamMemberUsageFailed,
  getTeamKeyUsageFailed,
  canManage,
  onEditTeam,
  canCreate,
  onCreateTeam,
  onTeamExpand,
  canManageMembers,
  onManageMembers,
  readOnly,
  vectorStores,
  mcpServers,
}) => {
  const readOnlyBadge = (
    <MuiTooltip title="Teams and memberships are managed in your identity provider. Changes made here would be overwritten, so editing is disabled.">
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: 12.5 }}
      >
        <LockOutlined sx={{ fontSize: 15 }} />
        Synced from identity provider
      </Box>
    </MuiTooltip>
  );
  const createButton =
    canCreate && onCreateTeam ? (
      <Button
        variant="contained"
        color="primary"
        disableElevation
        startIcon={<Add />}
        onClick={onCreateTeam}
      >
        Create Team
      </Button>
    ) : undefined;
  const createAction = readOnly ? readOnlyBadge : createButton;

  if (loading) {
    return (
      <SectionCard title="Teams" actions={createAction}>
        <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} />
      </SectionCard>
    );
  }

  if (!teams.length) {
    return (
      <SectionCard title="Teams" actions={createAction}>
        <EmptyState
          message="You're not a member of any LiteLLM team yet."
          hint="Your account is provisioned, so you can still generate personal keys and use models. Ask an admin to add you to a team if you need a shared budget."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Teams"
      subtitle={`${teams.length} team${teams.length === 1 ? '' : 's'}`}
      actions={createAction}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {teams.map(team => (
          <TeamCard
            key={team.team_id}
            team={team}
            usage={getTeamUsage(team.team_id)}
            usageLoading={getTeamUsageLoading(team.team_id)}
            memberUsage={getTeamMemberUsage?.(team.team_id) ?? null}
            memberUsageLoading={getTeamMemberUsageLoading?.(team.team_id) ?? false}
            keyUsage={getTeamKeyUsage?.(team.team_id) ?? null}
            keyUsageLoading={getTeamKeyUsageLoading?.(team.team_id) ?? false}
            memberUsageFailed={getTeamMemberUsageFailed?.(team.team_id) ?? false}
            keyUsageFailed={getTeamKeyUsageFailed?.(team.team_id) ?? false}
            canManage={canManage}
            onEditTeam={onEditTeam}
            canManageMembers={canManageMembers?.(team)}
            onManageMembers={onManageMembers}
            onExpand={onTeamExpand}
            vectorStores={vectorStores}
            mcpServers={mcpServers}
          />
        ))}
      </Box>
    </SectionCard>
  );
};
