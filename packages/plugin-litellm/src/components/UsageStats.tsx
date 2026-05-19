import React, { useMemo, useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  DateRange,
  UsageMetrics,
  ModelInfo,
  UsageModelBreakdown,
  UsageKeyBreakdown,
} from '../types';

interface UsageStatsProps {
  usage: UsageMetrics | null;
  models: ModelInfo[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  loading: boolean;
}

type DatePreset = 'today' | '7d' | '30d';
type TabKey = 'costs' | 'models' | 'keys';

const fmtUsd = (n: number) => `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
const fmtInt = (n: number) => (n ?? 0).toLocaleString();
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const KpiCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h5" sx={{ mt: 0.5 }}>{value}</Typography>
    {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
  </Paper>
);

export const UsageStats: React.FC<UsageStatsProps> = ({
  usage,
  models,
  dateRange,
  onDateRangeChange,
  loading,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [tab, setTab] = useState<TabKey>('costs');

  // Derive selected preset from dateRange to keep it in sync
  const selectedPreset = useMemo(() => {
    const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return 'today';
    if (diffDays <= 7) return '7d';
    return '30d';
  }, [dateRange]);

  const handlePresetChange = (preset: DatePreset) => {
    const end = new Date();
    const start = new Date();
    if (preset === 'today') start.setHours(0, 0, 0, 0);
    else if (preset === '7d') start.setDate(start.getDate() - 7);
    else if (preset === '30d') start.setDate(start.getDate() - 30);
    onDateRangeChange({ start, end });
  };

  const todayRows = useMemo(() => {
    const rows = usage?.daily_by_model ?? [];
    if (rows.length === 0) return [];
    // Pick the most recent date present in the data — that's the latest
    // "current day" the proxy has aggregated, even if today has no traffic yet.
    const latestDate = rows.map(r => r.date).sort().slice(-1)[0];
    return rows
      .filter(r => r.date === latestDate)
      .map(r => ({
        model: r.model,
        promptTokens: r.prompt_tokens,
        completionTokens: r.completion_tokens,
      }))
      .filter(r => r.promptTokens + r.completionTokens > 0)
      .sort((a, b) => (b.promptTokens + b.completionTokens) - (a.promptTokens + a.completionTokens));
  }, [usage]);

  const todayLabel = useMemo(() => {
    const rows = usage?.daily_by_model ?? [];
    if (rows.length === 0) return null;
    return rows.map(r => r.date).sort().slice(-1)[0];
  }, [usage]);

  const dailyData = useMemo(
    () =>
      (usage?.daily_usage ?? []).map(d => ({
        date: d.date,
        spend: d.spend,
        promptTokens: d.prompt_tokens,
        completionTokens: d.completion_tokens,
        totalTokens: d.total_tokens,
        apiRequests: d.api_requests,
        successfulRequests: d.successful_requests,
        failedRequests: d.failed_requests,
      })),
    [usage],
  );

  const modelRows = useMemo(() => {
    const entries = Object.entries<UsageModelBreakdown>(usage?.usage_by_model ?? {}).map(([model, d]) => ({
      model,
      spend: d.total_spend,
      promptTokens: d.prompt_tokens,
      completionTokens: d.completion_tokens,
      totalTokens: d.total_tokens,
      apiRequests: d.api_requests,
      successfulRequests: d.successful_requests,
      failedRequests: d.failed_requests,
      successRate: d.api_requests > 0 ? d.successful_requests / d.api_requests : 0,
    }));
    return selectedModel === 'all' ? entries : entries.filter(e => e.model === selectedModel);
  }, [usage, selectedModel]);

  const keyRows = useMemo(
    () =>
      Object.entries<UsageKeyBreakdown>(usage?.usage_by_key ?? {}).map(([keyHash, d]) => ({
        keyHash,
        keyAlias: d.key_alias ?? keyHash.slice(0, 8),
        teamId: d.team_id ?? null,
        models: d.models,
        spend: d.total_spend,
        totalTokens: d.total_tokens,
        promptTokens: d.prompt_tokens,
        completionTokens: d.completion_tokens,
        apiRequests: d.api_requests,
        successfulRequests: d.successful_requests,
        failedRequests: d.failed_requests,
        successRate: d.api_requests > 0 ? d.successful_requests / d.api_requests : 0,
      })),
    [usage],
  );

  const totalRequests = usage?.api_requests ?? 0;
  const overallSuccessRate = totalRequests > 0 ? (usage?.successful_requests ?? 0) / totalRequests : 0;

  if (loading) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={2}>
        <Typography variant="h6">Usage Analytics</Typography>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={selectedPreset}
              label="Period"
              onChange={e => handlePresetChange(e.target.value as DatePreset)}
            >
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
            </Select>
          </FormControl>
          {tab === 'models' && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Model</InputLabel>
              <Select
                value={selectedModel}
                label="Model"
                onChange={e => setSelectedModel(e.target.value)}
              >
                <MenuItem value="all">All Models</MenuItem>
                {models.map(m => (
                  <MenuItem key={m.model_name} value={m.model_name}>
                    <Typography variant="body2" color="text.primary">
                      {m.model_name}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Total Spend" value={fmtUsd(usage?.total_spend ?? 0)} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Total Requests" value={fmtInt(totalRequests)} hint={`${fmtInt(usage?.failed_requests ?? 0)} failed`} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Success Rate" value={totalRequests > 0 ? fmtPct(overallSuccessRate) : '—'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard
            label="Total Tokens"
            value={fmtInt(usage?.total_tokens ?? 0)}
            hint={`${fmtInt(usage?.prompt_tokens ?? 0)} in · ${fmtInt(usage?.completion_tokens ?? 0)} out`}
          />
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v as TabKey)} sx={{ mb: 2 }}>
        <Tab value="costs" label="Costs" />
        <Tab value="models" label="Model Activity" />
        <Tab value="keys" label="Key Activity" />
      </Tabs>

      {tab === 'costs' && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Daily Spend
            </Typography>
            <Box height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                  <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Spend']} />
                  <Area type="monotone" dataKey="spend" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Daily Requests
            </Typography>
            <Box height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="successfulRequests" name="Successful" fill="#82ca9d" stackId="r" />
                  <Bar dataKey="failedRequests" name="Failed" fill="#e57373" stackId="r" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {todayLabel ? `Tokens In / Out by Model — ${todayLabel}` : 'Tokens In / Out by Model — Today'}
            </Typography>
            <Box height={300}>
              {todayRows.length === 0 ? (
                <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                  <Typography color="text.secondary">No token activity for the latest day</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={todayRows} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={fmtInt} />
                    <YAxis type="category" dataKey="model" tick={{ fontSize: 11 }} width={180} />
                    <Tooltip formatter={(value: number) => fmtInt(value)} />
                    <Legend />
                    <Bar dataKey="promptTokens" name="Input (prompt)" fill="#8884d8" stackId="io" />
                    <Bar dataKey="completionTokens" name="Output (completion)" fill="#82ca9d" stackId="io" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Grid>
        </Grid>
      )}

      {tab === 'models' && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Tokens by Model
            </Typography>
            <Box height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="promptTokens" name="Prompt" fill="#8884d8" stackId="t" />
                  <Bar dataKey="completionTokens" name="Completion" fill="#82ca9d" stackId="t" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Spend</TableCell>
                    <TableCell align="right">Requests</TableCell>
                    <TableCell align="right">Success</TableCell>
                    <TableCell align="right">Failed</TableCell>
                    <TableCell align="right">Prompt</TableCell>
                    <TableCell align="right">Completion</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Success rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {modelRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} align="center">No model activity</TableCell></TableRow>
                  ) : modelRows
                    .sort((a, b) => b.spend - a.spend || b.totalTokens - a.totalTokens)
                    .map(r => (
                      <TableRow key={r.model}>
                        <TableCell>{r.model}</TableCell>
                        <TableCell align="right">{fmtUsd(r.spend)}</TableCell>
                        <TableCell align="right">{fmtInt(r.apiRequests)}</TableCell>
                        <TableCell align="right">{fmtInt(r.successfulRequests)}</TableCell>
                        <TableCell align="right">{fmtInt(r.failedRequests)}</TableCell>
                        <TableCell align="right">{fmtInt(r.promptTokens)}</TableCell>
                        <TableCell align="right">{fmtInt(r.completionTokens)}</TableCell>
                        <TableCell>
                          {r.apiRequests > 0 ? (
                            <Box display="flex" alignItems="center" gap={1}>
                              <LinearProgress
                                variant="determinate"
                                value={r.successRate * 100}
                                sx={{ flex: 1, height: 6, borderRadius: 3 }}
                              />
                              <Typography variant="caption">{fmtPct(r.successRate)}</Typography>
                            </Box>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      )}

      {tab === 'keys' && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key</TableCell>
                <TableCell>Models</TableCell>
                <TableCell align="right">Spend</TableCell>
                <TableCell align="right">Requests</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">Failed</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Success rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keyRows.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center">No key activity</TableCell></TableRow>
              ) : keyRows
                .sort((a, b) => b.spend - a.spend || b.apiRequests - a.apiRequests)
                .map(r => (
                  <TableRow key={r.keyHash}>
                    <TableCell>
                      <Typography variant="body2">{r.keyAlias}</Typography>
                      {r.teamId ? (
                        <Typography variant="caption" color="text.secondary">team: {r.teamId}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {r.models.map(m => (
                          <Chip key={m} label={m} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{fmtUsd(r.spend)}</TableCell>
                    <TableCell align="right">{fmtInt(r.apiRequests)}</TableCell>
                    <TableCell align="right">{fmtInt(r.totalTokens)}</TableCell>
                    <TableCell align="right">{fmtInt(r.failedRequests)}</TableCell>
                    <TableCell>
                      {r.apiRequests > 0 ? (
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress
                            variant="determinate"
                            value={r.successRate * 100}
                            sx={{ flex: 1, height: 6, borderRadius: 3 }}
                          />
                          <Typography variant="caption">{fmtPct(r.successRate)}</Typography>
                        </Box>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};
