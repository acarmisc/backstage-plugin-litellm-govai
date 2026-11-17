import { FC, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Drawer from '@mui/material/Drawer';
import InputAdornment from '@mui/material/InputAdornment';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Search from '@mui/icons-material/Search';
import { useAsync } from 'react-use';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LiteLlmApiInterface } from '../api';
import { localDateRange, monthToDateRange, toLocalDay } from '../dates';
import { fmtInt, fmtUsd } from '../format';
import type { SpendLogEntry } from '../types';
import {
  aggregateUsers, byModel, byTag, byUserAgent, type BreakdownRow, type UserAgg,
} from '../usersMonitoring';
import { EmptyState, SectionCard, Stat, dataTableSx } from './ui';

type Preset = 'today' | '7d' | '30d' | 'mtd' | 'custom';
type SortKey = 'userId' | 'team' | 'key' | 'spend' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'requests';

const PRESETS: Array<[Preset, string]> = [
  ['today', 'Today'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'],
  ['mtd', 'Month to Date (MTD)'], ['custom', 'Custom Range'],
];

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function rangeFor(p: Preset, from: string, to: string) {
  if (p === 'custom') return { startDate: from, endDate: to };
  if (p === 'mtd') return monthToDateRange();
  const r = localDateRange(p);
  return { startDate: r.startDate, endDate: r.endDate };
}

const teamLabel = (teams: Record<string, string> | undefined, id?: string) =>
  id ? teams?.[id] ?? id : '—';
const keyLabel = (u: UserAgg) => u.keyAlias || `${u.keyHash.slice(0, 8)}…`;

const BreakdownChart: FC<{ title: string; rows: BreakdownRow[]; empty: string }> = ({ title, rows, empty }) => (
  <SectionCard title={title}>
    {rows.length === 0 ? (
      <Typography variant="body2" color="text.secondary">{empty}</Typography>
    ) : (
      <ResponsiveContainer width="100%" height={Math.max(120, rows.slice(0, 8).length * 32)}>
        <BarChart data={rows.slice(0, 8)} layout="vertical" margin={{ left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={v => fmtUsd(Number(v))} />
          <YAxis type="category" dataKey="name" width={130} />
          <Tooltip
            formatter={(v: number, _n, item) => [
              `${fmtUsd(v)} · ${fmtInt(item.payload.tokens)} tokens · ${fmtInt(item.payload.requests)} req`,
              'Cost',
            ]}
          />
          <Bar dataKey="spend" fill="#4caf50" />
        </BarChart>
      </ResponsiveContainer>
    )}
  </SectionCard>
);

export const UsersMonitoringTab: FC<{ api: LiteLlmApiInterface }> = ({ api }) => {
  const [preset, setPreset] = useState<Preset>('7d');
  const today = toLocalDay(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { startDate, endDate } = rangeFor(preset, from, to);
  const { value, loading, error } = useAsync(
    () => api.getUsersMonitoring({ startDate, endDate }),
    [api, startDate, endDate],
  );

  const allAggs = useMemo(() => aggregateUsers(value?.rows ?? []), [value]);
  const aggs = useMemo(() => (team ? allAggs.filter(a => a.teamId === team) : allAggs), [allAggs, team]);
  const teams = useMemo(
    () => [...new Set((value?.rows ?? []).map(r => r.teamId).filter((t): t is string => !!t))]
      .map(id => ({ id, name: teamLabel(value?.teams, id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [value],
  );
  const users = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sign = dir === 'asc' ? 1 : -1;
    const text = (u: UserAgg) => {
      if (sortKey === 'team') return teamLabel(value?.teams, u.teamId);
      return sortKey === 'key' ? keyLabel(u) : u.userId;
    };
    const match = (u: UserAgg) =>
      !q || [u.userId, u.userEmail, u.keyAlias].some(s => s?.toLowerCase().includes(q));
    return aggs.filter(match).sort((a, b) =>
      sortKey === 'userId' || sortKey === 'team' || sortKey === 'key'
        ? sign * text(a).localeCompare(text(b))
        : sign * (a[sortKey] - b[sortKey]),
    );
  }, [aggs, search, sortKey, dir, value?.teams]);

  const sortBy = (k: SortKey) => {
    setDir(k === sortKey && dir === 'desc' ? 'asc' : 'desc');
    setSortKey(k);
    setPage(0);
  };
  const head = (k: SortKey, label: string, right = true) => (
    <TableCell align={right ? 'right' : 'left'} sortDirection={sortKey === k ? dir : false}>
      <TableSortLabel active={sortKey === k} direction={sortKey === k ? dir : 'desc'} onClick={() => sortBy(k)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  // Drawer: a user's stats sum all their keys (ignoring the team filter); a service key stands alone.
  const sel = allAggs.find(a => a.id === selectedId);
  const sameUser = allAggs.filter(a => !a.serviceKey && a.userId === sel?.userId);
  const group = sel?.serviceKey ? [sel] : sameUser;
  const totals = group.reduce(
    (t, u) => ({
      spend: t.spend + u.spend,
      promptTokens: t.promptTokens + u.promptTokens,
      completionTokens: t.completionTokens + u.completionTokens,
      totalTokens: t.totalTokens + u.totalTokens,
      requests: t.requests + u.requests,
    }),
    { spend: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 },
  );

  // Breakdown charts need raw requests, fetched only while a user's drawer is open.
  const uid = sel && !sel.serviceKey ? sel.userId : undefined;
  const logs = useAsync(async () => {
    if (!uid) return undefined;
    const data: SpendLogEntry[] = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      const res = await api.getSpendLogs({ startDate, endDate, userId: uid, page: p, pageSize: PAGE_SIZE });
      data.push(...res.data);
      if (res.data.length < PAGE_SIZE) return { data, partial: false };
    }
    return { data, partial: true };
  }, [api, uid, startDate, endDate]);
  const logRows = logs.value?.data ?? [];

  if (error) {
    const forbidden = /403|denied|audit/i.test(error.message);
    return (
      <Alert severity={forbidden ? 'warning' : 'error'}>
        {forbidden ? 'Forbidden: Users Monitoring is restricted to the supervisor group and group managers.' : error.message}
      </Alert>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard
        title="Users Monitoring"
        subtitle={loading ? 'Loading…' : `${users.length} user${users.length === 1 ? '' : 's'}`}
        flush
        actions={
          <>
        <TextField select size="small" label="Time range" value={preset} sx={{ minWidth: 170 }}
          onChange={e => { setPreset(e.target.value as Preset); setPage(0); }}>
          {PRESETS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        {preset === 'custom' && (
          <>
            <TextField size="small" type="date" label="From" value={from} InputLabelProps={{ shrink: true }}
              onChange={e => setFrom(e.target.value)} />
            <TextField size="small" type="date" label="To" value={to} InputLabelProps={{ shrink: true }}
              onChange={e => setTo(e.target.value)} />
          </>
        )}
        <TextField size="small" label="Search user" placeholder="Name, email or id…" value={search}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" color="disabled" /></InputAdornment> }}
          onChange={e => { setSearch(e.target.value); setPage(0); }} sx={{ minWidth: 240 }} />
        <TextField select size="small" label="Team" value={team} sx={{ minWidth: 160 }}
          SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
          onChange={e => { setTeam(e.target.value); setPage(0); }}>
          <MenuItem value="">All teams</MenuItem>
          {teams.map(t => <MenuItem key={t.id} value={t.id} title={t.id}>{t.name}</MenuItem>)}
        </TextField>
          </>
        }
      >
      {value?.scope && (
        <Alert severity="info">Showing users filtered for your managed group: {value.scope.groups.join(', ')}</Alert>
      )}

      {loading && <LinearProgress />}

      {value?.truncated && (
        <Alert severity="info">
          Too many keys in this range: figures cover only the top-spending keys. Narrow the time range.
        </Alert>
      )}

      {!loading && users.length === 0 && (
        <EmptyState message="No usage found" hint="No requests match these filters." />
      )}

      {users.length > 0 && (
        <TableContainer>
          <Table size="small" sx={dataTableSx}>
            <TableHead>
              <TableRow>
                {head('userId', 'User', false)}
                {head('team', 'Team', false)}
                {head('key', 'Key', false)}
                {head('spend', 'Total spend')}
                {head('promptTokens', 'Input tokens')}
                {head('completionTokens', 'Output tokens')}
                {head('totalTokens', 'Total tokens')}
                {head('requests', 'Requests')}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map(u => (
                <TableRow key={u.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedId(u.id)}>
                  <TableCell>
                    {u.userId}
                    {u.userEmail && u.userEmail !== u.userId && (
                      <Typography variant="caption" display="block" color="text.secondary">{u.userEmail}</Typography>
                    )}
                  </TableCell>
                  <TableCell title={u.teamId}>{teamLabel(value?.teams, u.teamId)}</TableCell>
                  <TableCell title={u.keyHash}>{keyLabel(u)}</TableCell>
                  <TableCell align="right">{fmtUsd(u.spend)}</TableCell>
                  <TableCell align="right">{fmtInt(u.promptTokens)}</TableCell>
                  <TableCell align="right">{fmtInt(u.completionTokens)}</TableCell>
                  <TableCell align="right">{fmtInt(u.totalTokens)}</TableCell>
                  <TableCell align="right">{fmtInt(u.requests)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={users.length} page={page} rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          />
        </TableContainer>
      )}
      </SectionCard>

      <Drawer anchor="right" open={!!sel} onClose={() => setSelectedId(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: 640 }, p: 3 } }}>
        {sel && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="h5">{sel.userId}</Typography>
              {sel.userEmail && <Typography variant="body2" color="text.secondary">{sel.userEmail}</Typography>}
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}><Stat label="Total spend" value={fmtUsd(totals.spend)} /></Grid>
              <Grid item xs={6} sm={4}><Stat label="Input tokens" value={fmtInt(totals.promptTokens)} /></Grid>
              <Grid item xs={6} sm={4}><Stat label="Output tokens" value={fmtInt(totals.completionTokens)} /></Grid>
              <Grid item xs={6} sm={4}><Stat label="Total tokens" value={fmtInt(totals.totalTokens)} /></Grid>
              <Grid item xs={6} sm={4}>
                <Stat label="Avg cost / request" value={fmtUsd(totals.requests ? totals.spend / totals.requests : 0)} />
              </Grid>
            </Grid>
            {sel.serviceKey && (
              <Typography variant="body2" color="text.secondary">
                Service-account key: no user id, so no model, client or tag breakdown.
              </Typography>
            )}
            {!sel.serviceKey && logs.loading && <LinearProgress />}
            {!sel.serviceKey && logs.error && <Alert severity="error">{logs.error.message}</Alert>}
            {!sel.serviceKey && !logs.loading && !logs.error && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Breakdown based on the latest {logRows.length} requests{logs.value?.partial ? ' (partial)' : ''}
                </Typography>
                <BreakdownChart title="Model distribution" rows={byModel(logRows)} empty="No model data." />
                <BreakdownChart title="Client / User-Agent" rows={byUserAgent(logRows)} empty="No user-agent data." />
                <BreakdownChart title="Custom tags" rows={byTag(logRows)} empty="No tags on these requests." />
              </>
            )}
          </Box>
        )}
      </Drawer>
    </Box>
  );
};
