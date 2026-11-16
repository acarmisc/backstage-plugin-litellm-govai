import { FC, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Drawer from '@mui/material/Drawer';
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
import { useAsync } from 'react-use';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LiteLlmApiInterface } from '../api';
import { localDateRange, monthToDateRange, toLocalDay } from '../dates';
import { fmtInt, fmtUsd } from '../format';
import {
  aggregateUsers, byModel, byTag, byUserAgent, type BreakdownRow, type UserAgg,
} from '../usersMonitoring';
import { EmptyState, SectionCard, Stat, dataTableSx } from './ui';

type Preset = 'today' | '7d' | '30d' | 'mtd' | 'custom';
type SortKey = 'userId' | 'spend' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'requests';

const PRESETS: Array<[Preset, string]> = [
  ['today', 'Today'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'],
  ['mtd', 'Month to Date (MTD)'], ['custom', 'Custom Range'],
];

function rangeFor(p: Preset, from: string, to: string) {
  if (p === 'custom') return { startDate: from, endDate: to };
  if (p === 'mtd') return monthToDateRange();
  const r = localDateRange(p);
  return { startDate: r.startDate, endDate: r.endDate };
}

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
  const [selected, setSelected] = useState<string | null>(null);

  const { startDate, endDate } = rangeFor(preset, from, to);
  const { value, loading, error } = useAsync(
    () => api.getUsersMonitoring({ startDate, endDate }),
    [api, startDate, endDate],
  );

  const rows = useMemo(
    () => (team ? (value?.data ?? []).filter(r => r.teamId === team) : value?.data ?? []),
    [value, team],
  );
  const teams = useMemo(
    () => [...new Set((value?.data ?? []).map(r => r.teamId).filter((t): t is string => !!t))].sort(),
    [value],
  );
  const users = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = aggregateUsers(rows).filter(u => !q || u.userId.toLowerCase().includes(q));
    const sign = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) =>
      sortKey === 'userId' ? sign * a.userId.localeCompare(b.userId) : sign * (a[sortKey] - b[sortKey]),
    );
  }, [rows, search, sortKey, dir]);

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

  const detail: UserAgg | undefined = users.find(u => u.userId === selected);
  const detailRows = useMemo(
    () => rows.filter(r => (r.userId || 'unknown') === selected),
    [rows, selected],
  );

  if (error) {
    const forbidden = /403|denied|audit/i.test(error.message);
    return (
      <Alert severity={forbidden ? 'warning' : 'error'}>
        {forbidden ? 'Forbidden: Users Monitoring is restricted to the supervisor group.' : error.message}
      </Alert>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label="Time range" value={preset} sx={{ minWidth: 190 }}
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
        <TextField size="small" label="Search user (name / email / id)" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }} sx={{ minWidth: 260 }} />
        <TextField select size="small" label="Team" value={team} sx={{ minWidth: 190 }}
          onChange={e => { setTeam(e.target.value); setPage(0); }}>
          <MenuItem value="">All teams</MenuItem>
          {teams.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
      </Box>

      {loading && <LinearProgress />}

      {value?.truncated && (
        <Alert severity="info">Too many requests in this range: figures cover only part of it. Narrow the time range.</Alert>
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
                <TableCell>Team</TableCell>
                {head('spend', 'Total spend')}
                {head('promptTokens', 'Input tokens')}
                {head('completionTokens', 'Output tokens')}
                {head('totalTokens', 'Total tokens')}
                {head('requests', 'Requests')}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map(u => (
                <TableRow key={u.userId} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(u.userId)}>
                  <TableCell>{u.userId}</TableCell>
                  <TableCell>{u.teams.join(', ') || '—'}</TableCell>
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

      <Drawer anchor="right" open={!!detail} onClose={() => setSelected(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: 640 }, p: 3 } }}>
        {detail && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h5">{detail.userId}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}><Stat label="Total spend" value={fmtUsd(detail.spend)} /></Grid>
              <Grid item xs={6} sm={4}><Stat label="Input tokens" value={fmtInt(detail.promptTokens)} /></Grid>
              <Grid item xs={6} sm={4}><Stat label="Output tokens" value={fmtInt(detail.completionTokens)} /></Grid>
              <Grid item xs={6} sm={4}><Stat label="Total tokens" value={fmtInt(detail.totalTokens)} /></Grid>
              <Grid item xs={6} sm={4}>
                <Stat label="Avg cost / request" value={fmtUsd(detail.requests ? detail.spend / detail.requests : 0)} />
              </Grid>
            </Grid>
            <BreakdownChart title="Model distribution" rows={byModel(detailRows)} empty="No model data." />
            <BreakdownChart title="Client / User-Agent" rows={byUserAgent(detailRows)} empty="No user-agent data." />
            <BreakdownChart title="Custom tags" rows={byTag(detailRows)} empty="No tags on these requests." />
          </Box>
        )}
      </Drawer>
    </Box>
  );
};
