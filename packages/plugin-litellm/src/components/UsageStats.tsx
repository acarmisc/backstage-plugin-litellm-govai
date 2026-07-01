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
  Skeleton,
} from '@mui/material';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  DateRange,
  UsageMetrics,
  ModelInfo,
  UserInfo,
  UsageModelBreakdown,
  UsageKeyBreakdown,
} from '../types';
import { fmtUsd, fmtInt } from '../format';

interface UsageStatsProps {
  usage: UsageMetrics | null;
  models: ModelInfo[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  loading: boolean;
  userInfo?: UserInfo;
}

type DatePreset = 'today' | '24h' | '7d' | '30d';
type TabKey = 'costs' | 'models' | 'keys';

const TOP_N_MODELS = 6;
const PERIOD_LS_KEY = 'litellm_usage_period';

const MODEL_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300',
  '#0088fe', '#00C49F', '#FFBB28', '#FF8042',
  '#a4de6c', '#d0ed57',
];

function modelColor(model: string): string {
  let h = 5381;
  for (let i = 0; i < model.length; i++) h = ((h << 5) + h + model.charCodeAt(i)) >>> 0;
  return MODEL_COLORS[h % MODEL_COLORS.length];
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const KpiCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h5" sx={{ mt: 0.5 }}>{value}</Typography>
    {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
  </Paper>
);

const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 260 }) => (
  <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 1 }} />
);

const EmptyChart: React.FC<{ height?: number; message?: string }> = ({
  height = 260,
  message = 'No data for this period',
}) => (
  <Box height={height} display="flex" alignItems="center" justifyContent="center">
    <Typography color="text.secondary" variant="body2">{message}</Typography>
  </Box>
);

export const UsageStats: React.FC<UsageStatsProps> = ({
  usage,
  models,
  dateRange,
  onDateRangeChange,
  loading,
  userInfo,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [tab, setTab] = useState<TabKey>('costs');

  const selectedPreset = useMemo<DatePreset>(() => {
    if (dateRange.start.toDateString() === dateRange.end.toDateString()) return 'today';
    const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 26) return '24h';
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return '7d';
    return '30d';
  }, [dateRange]);

  const handlePresetChange = (preset: DatePreset) => {
    const end = new Date();
    const start = new Date();
    if (preset === 'today') start.setHours(0, 0, 0, 0);
    else if (preset === '24h') start.setHours(start.getHours() - 24);
    else if (preset === '7d') start.setDate(start.getDate() - 7);
    else if (preset === '30d') start.setDate(start.getDate() - 30);
    try { localStorage.setItem(PERIOD_LS_KEY, preset); } catch { /* ignore */ }
    onDateRangeChange({ start, end });
  };

  // ── daily_usage → base series ────────────────────────────────────────────
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

  // ── Cumulative spend per day ─────────────────────────────────────────────
  const cumulativeData = useMemo(() => {
    let cum = 0;
    return dailyData.map(d => { cum += d.spend; return { date: d.date, cumulative: cum }; });
  }, [dailyData]);

  // ── Success rate trend (days with requests only) ─────────────────────────
  const successRateData = useMemo(
    () =>
      dailyData
        .filter(d => d.apiRequests > 0)
        .map(d => ({
          date: d.date,
          successRate: parseFloat(((d.successfulRequests / d.apiRequests) * 100).toFixed(1)),
        })),
    [dailyData],
  );

  // ── Stacked spend by model per day ──────────────────────────────────────
  const { modelSpendByDate, topModels: topSpendModels } = useMemo(() => {
    const rows = usage?.daily_by_model ?? [];
    const modelTotals: Record<string, number> = {};
    for (const r of rows) modelTotals[r.model] = (modelTotals[r.model] ?? 0) + r.spend;

    const top = Object.entries(modelTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_N_MODELS)
      .map(([m]) => m);

    const dateMap: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!dateMap[r.date]) dateMap[r.date] = {};
      const bucket = top.includes(r.model) ? r.model : 'Other';
      dateMap[r.date][bucket] = (dateMap[r.date][bucket] ?? 0) + r.spend;
    }

    const sorted = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({ date, ...m }));

    const hasOther = sorted.some(r => (r as any).Other > 0);
    return { modelSpendByDate: sorted, topModels: hasOther ? [...top, 'Other'] : top };
  }, [usage]);

  // ── Model breakdown rows ─────────────────────────────────────────────────
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

  // top-models horizontal bar (sorted by spend)
  const topModelSpendBars = useMemo(
    () => [...modelRows].sort((a, b) => b.spend - a.spend).slice(0, 10),
    [modelRows],
  );

  // ── Key breakdown rows ───────────────────────────────────────────────────
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

  const topKeySpendBars = useMemo(
    () => [...keyRows].sort((a, b) => b.spend - a.spend).slice(0, 10),
    [keyRows],
  );

  const totalRequests = usage?.api_requests ?? 0;
  const overallSuccessRate = totalRequests > 0 ? (usage?.successful_requests ?? 0) / totalRequests : 0;
  const maxBudget = userInfo?.max_budget ?? 0;
  const totalCumSpend = cumulativeData[cumulativeData.length - 1]?.cumulative ?? 0;

  return (
    <Paper sx={{ p: 2 }}>
      {/* ── Header ── */}
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
              <MenuItem value="24h">Last 24h</MenuItem>
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
                    {m.model_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Box>

      {/* ── KPI row ── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3}>
          {loading ? <ChartSkeleton height={80} /> : <KpiCard label="Total Spend" value={fmtUsd(usage?.total_spend ?? 0)} />}
        </Grid>
        <Grid item xs={6} sm={3}>
          {loading ? <ChartSkeleton height={80} /> : (
            <KpiCard label="Total Requests" value={fmtInt(totalRequests)} hint={`${fmtInt(usage?.failed_requests ?? 0)} failed`} />
          )}
        </Grid>
        <Grid item xs={6} sm={3}>
          {loading ? <ChartSkeleton height={80} /> : (
            <KpiCard label="Success Rate" value={totalRequests > 0 ? fmtPct(overallSuccessRate) : '—'} />
          )}
        </Grid>
        <Grid item xs={6} sm={3}>
          {loading ? <ChartSkeleton height={80} /> : (
            <KpiCard
              label="Total Tokens"
              value={fmtInt(usage?.total_tokens ?? 0)}
              hint={`${fmtInt(usage?.prompt_tokens ?? 0)} in · ${fmtInt(usage?.completion_tokens ?? 0)} out`}
            />
          )}
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v as TabKey)} sx={{ mb: 2 }}>
        <Tab value="costs" label="Costs" />
        <Tab value="models" label="Model Activity" />
        <Tab value="keys" label="Key Activity" />
      </Tabs>

      {/* ══ COSTS TAB ════════════════════════════════════════════════════════ */}
      {tab === 'costs' && (
        <Grid container spacing={3}>
          {/* Daily Spend by Model */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Daily Spend by Model
            </Typography>
            {loading ? <ChartSkeleton /> : modelSpendByDate.length === 0 ? <EmptyChart /> : (
              <Box height={260}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={modelSpendByDate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, undefined]} />
                    <Legend />
                    {topSpendModels.map(m => (
                      <Area
                        key={m}
                        type="monotone"
                        dataKey={m}
                        stackId="spend"
                        stroke={modelColor(m)}
                        fill={modelColor(m)}
                        fillOpacity={0.6}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Grid>

          {/* Token Usage Trend */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Daily Token Usage
            </Typography>
            {loading ? <ChartSkeleton /> : dailyData.length === 0 ? <EmptyChart /> : (
              <Box height={260}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtInt} />
                    <Tooltip formatter={(v: number) => [fmtInt(v), undefined]} />
                    <Legend />
                    <Area type="monotone" dataKey="promptTokens" name="Input (prompt)" stackId="tok" stroke="#8884d8" fill="#8884d8" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="completionTokens" name="Output (completion)" stackId="tok" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Grid>

          {/* Daily Requests */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Daily Requests
            </Typography>
            {loading ? <ChartSkeleton /> : dailyData.length === 0 ? <EmptyChart /> : (
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
            )}
          </Grid>

          {/* Success Rate Trend */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Daily Success Rate
            </Typography>
            {loading ? <ChartSkeleton /> : successRateData.length === 0 ? <EmptyChart /> : (
              <Box height={260}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={successRateData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'Success rate']} />
                    <ReferenceLine y={100} stroke="#82ca9d" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="successRate" name="Success rate" stroke="#8884d8" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Grid>

          {/* Cumulative Spend — only when max_budget is set */}
          {(maxBudget > 0 || cumulativeData.length > 0) && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Cumulative Spend{maxBudget > 0 ? ` vs Budget (${fmtUsd(maxBudget)})` : ''}
                {maxBudget > 0 && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {fmtUsd(totalCumSpend)} used · {fmtUsd(Math.max(0, maxBudget - totalCumSpend))} remaining
                  </Typography>
                )}
              </Typography>
              {loading ? <ChartSkeleton height={180} /> : cumulativeData.length === 0 ? <EmptyChart height={180} /> : (
                <Box height={180}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cumulativeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                      <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cumulative spend']} />
                      {maxBudget > 0 && (
                        <ReferenceLine y={maxBudget} stroke="#e57373" strokeDasharray="6 3" label={{ value: `Budget ${fmtUsd(maxBudget)}`, position: 'insideTopRight', fontSize: 11 }} />
                      )}
                      <Area type="monotone" dataKey="cumulative" name="Cumulative spend" stroke="#ffc658" fill="#ffc658" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Grid>
          )}
        </Grid>
      )}

      {/* ══ MODELS TAB ═══════════════════════════════════════════════════════ */}
      {tab === 'models' && (
        <Grid container spacing={3}>
          {/* Top models spend horizontal bar */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Spend by Model
            </Typography>
            {loading ? <ChartSkeleton /> : topModelSpendBars.length === 0 ? <EmptyChart /> : (
              <Box height={Math.max(200, topModelSpendBars.length * 36)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topModelSpendBars} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                    <YAxis type="category" dataKey="model" tick={{ fontSize: 11 }} width={200} />
                    <Tooltip formatter={(v: number) => [fmtUsd(v), 'Spend']} />
                    <Bar dataKey="spend" name="Spend" radius={[0, 4, 4, 0]}>
                      {topModelSpendBars.map(r => (
                        <rect key={r.model} fill={modelColor(r.model)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Grid>

          {/* Tokens by model stacked bar */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Tokens by Model
            </Typography>
            {loading ? <ChartSkeleton /> : modelRows.length === 0 ? <EmptyChart /> : (
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
            )}
          </Grid>

          {/* Model table */}
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
                  {loading ? (
                    <TableRow><TableCell colSpan={8}><LinearProgress /></TableCell></TableRow>
                  ) : modelRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} align="center">No model activity</TableCell></TableRow>
                  ) : [...modelRows]
                    .sort((a, b) => b.spend - a.spend || b.totalTokens - a.totalTokens)
                    .map(r => (
                      <TableRow key={r.model}>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.75}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: modelColor(r.model), flexShrink: 0 }} />
                            {r.model}
                          </Box>
                        </TableCell>
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

      {/* ══ KEYS TAB ══════════════════════════════════════════════════════════ */}
      {tab === 'keys' && (
        <Grid container spacing={3}>
          {/* Top keys spend horizontal bar */}
          {(loading || topKeySpendBars.length > 0) && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Spend by Key
              </Typography>
              {loading ? <ChartSkeleton /> : (
                <Box height={Math.max(160, topKeySpendBars.length * 36)}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topKeySpendBars} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                      <YAxis type="category" dataKey="keyAlias" tick={{ fontSize: 11 }} width={160} />
                      <Tooltip formatter={(v: number) => [fmtUsd(v), 'Spend']} />
                      <Bar dataKey="spend" name="Spend" fill="#8884d8" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Grid>
          )}

          {/* Keys table */}
          <Grid item xs={12}>
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
                  {loading ? (
                    <TableRow><TableCell colSpan={7}><LinearProgress /></TableCell></TableRow>
                  ) : keyRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center">No key activity</TableCell></TableRow>
                  ) : [...keyRows]
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
          </Grid>
        </Grid>
      )}
    </Paper>
  );
};
