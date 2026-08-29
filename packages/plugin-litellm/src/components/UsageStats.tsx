import React, { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Skeleton from '@mui/material/Skeleton';
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
  Cell,
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
import {
  ChartCard,
  ChartTooltip,
  EmptyState,
  Meter,
  MetricStrip,
  SectionCard,
  SegmentedControl,
  Tone,
  SeriesLegend,
  TagChip,
  chartColor,
  dataTableSx,
  fmtCompact,
  fmtDateShort,
  fmtUsdCompact,
  useChartTheme,
  SERIES,
} from './ui';

interface UsageStatsProps {
  usage: UsageMetrics | null;
  models: ModelInfo[];
  dateRange: DateRange;
  currentPreset: DatePreset;
  onDateRangeChange: (range: DateRange, preset?: DatePreset) => void;
  loading: boolean;
  userInfo?: UserInfo;
}

type DatePreset = 'today' | '24h' | '7d' | '30d';
type TabKey = 'costs' | 'models' | 'keys';

const TOP_N_MODELS = 6;
const PERIOD_LS_KEY = 'litellm_usage_period';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Green above 99%, amber down to 90%, red below. */
function rateTone(rate: number): Tone {
  if (rate >= 0.99) return 'success';
  if (rate >= 0.9) return 'warning';
  return 'danger';
}

const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 240 }) => (
  <Skeleton variant="rounded" height={height} />
);

/** Shows a loading skeleton, an empty-state message, or the chart itself. */
const ChartOrFallback: React.FC<{
  loading: boolean;
  empty: boolean;
  height?: number;
  children: React.ReactNode;
}> = ({ loading, empty, height = 240, children }) => {
  if (loading) return <ChartSkeleton height={height} />;
  if (empty) return <EmptyState message="No data for this period" height={height} />;
  return <>{children}</>;
};

/** Inline success-rate bar used in both breakdown tables. */
const SuccessRateCell: React.FC<{ rate: number; requests: number }> = ({ rate, requests }) => {
  if (requests === 0) return <Typography variant="body2" color="text.secondary">—</Typography>;
  const tone = rateTone(rate);
  return (
    <Box display="flex" alignItems="center" gap={1}>
      {/* Fixed, not flexible: the success-rate column is the last one, so a
          flexible meter stretches across all the table's slack space. */}
      <Box width={72} flexShrink={0}>
        <Meter value={rate * 100} tone={tone} height={4} />
      </Box>
      <Typography
        variant="caption"
        sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}
      >
        {fmtPct(rate)}
      </Typography>
    </Box>
  );
};

export const UsageStats: React.FC<UsageStatsProps> = ({
  usage,
  models,
  dateRange,
  currentPreset,
  onDateRangeChange,
  loading,
  userInfo,
}) => {
  const chart = useChartTheme();
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [tab, setTab] = useState<TabKey>('costs');

  const handlePresetChange = (preset: DatePreset) => {
    const end = new Date();
    const start = new Date();
    if (preset === 'today') start.setHours(0, 0, 0, 0);
    else if (preset === '24h') start.setHours(start.getHours() - 24);
    else if (preset === '7d') start.setDate(start.getDate() - 7);
    else if (preset === '30d') start.setDate(start.getDate() - 30);
    try { localStorage.setItem(PERIOD_LS_KEY, preset); } catch { /* ignore */ }
    onDateRangeChange({ start, end }, preset);
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

  // Keep the budget reference line inside the plot even when spend is far below it.
  const cumulativeDomain: any = maxBudget > 0
    ? [0, (dataMax: number) => Math.max(dataMax, maxBudget) * 1.05]
    : [0, 'auto'];

  const successTone: Tone = totalRequests === 0 ? 'neutral' : rateTone(overallSuccessRate);

  const metrics = [
    {
      label: 'Total spend',
      value: fmtUsd(usage?.total_spend ?? 0),
      hint: maxBudget > 0 ? `of ${fmtUsd(maxBudget)} budget` : undefined,
      tone: 'accent' as const,
    },
    {
      label: 'Requests',
      value: fmtInt(totalRequests),
      hint: `${fmtInt(usage?.failed_requests ?? 0)} failed`,
      tone: 'info' as const,
    },
    {
      label: 'Success rate',
      value: totalRequests > 0 ? fmtPct(overallSuccessRate) : '—',
      hint: totalRequests > 0 ? `${fmtInt(usage?.successful_requests ?? 0)} succeeded` : undefined,
      tone: successTone,
    },
    {
      label: 'Tokens',
      value: fmtCompact(usage?.total_tokens ?? 0),
      hint: `${fmtCompact(usage?.prompt_tokens ?? 0)} in · ${fmtCompact(usage?.completion_tokens ?? 0)} out`,
      tone: 'success' as const,
    },
  ];

  const renderKeyRows = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={7} sx={{ py: 3 }}>
            <Skeleton variant="rounded" height={80} />
          </TableCell>
        </TableRow>
      );
    }
    if (keyRows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7}><EmptyState message="No key activity in this period" /></TableCell>
        </TableRow>
      );
    }
    return [...keyRows]
      .sort((a, b) => b.spend - a.spend || b.apiRequests - a.apiRequests)
      .map(r => (
        <TableRow key={r.keyHash}>
          <TableCell>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.keyAlias}</Typography>
            {r.teamId ? (
              <Typography variant="caption" color="text.secondary">team: {r.teamId}</Typography>
            ) : null}
          </TableCell>
          <TableCell>
            <Box display="flex" gap={0.5} flexWrap="wrap">
              {r.models.slice(0, 3).map(m => (
                <TagChip key={m} label={m} title={m} />
              ))}
              {r.models.length > 3 && <TagChip label={`+${r.models.length - 3}`} mono={false} />}
            </Box>
          </TableCell>
          <TableCell align="right">{fmtUsd(r.spend)}</TableCell>
          <TableCell align="right">{fmtInt(r.apiRequests)}</TableCell>
          <TableCell align="right">{fmtCompact(r.totalTokens)}</TableCell>
          <TableCell align="right">{fmtInt(r.failedRequests)}</TableCell>
          <TableCell>
            <SuccessRateCell rate={r.successRate} requests={r.apiRequests} />
          </TableCell>
        </TableRow>
      ));
  };

  const renderModelRows = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={8} sx={{ py: 3 }}>
            <Skeleton variant="rounded" height={80} />
          </TableCell>
        </TableRow>
      );
    }
    if (modelRows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={8}><EmptyState message="No model activity in this period" /></TableCell>
        </TableRow>
      );
    }
    return [...modelRows]
      .sort((a, b) => b.spend - a.spend || b.totalTokens - a.totalTokens)
      .map(r => (
        <TableRow key={r.model}>
          <TableCell>
            <Box display="flex" alignItems="center" gap={1}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: chartColor(r.model), flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.model}</Typography>
            </Box>
          </TableCell>
          <TableCell align="right">{fmtUsd(r.spend)}</TableCell>
          <TableCell align="right">{fmtInt(r.apiRequests)}</TableCell>
          <TableCell align="right">{fmtInt(r.successfulRequests)}</TableCell>
          <TableCell align="right">{fmtInt(r.failedRequests)}</TableCell>
          <TableCell align="right">{fmtCompact(r.promptTokens)}</TableCell>
          <TableCell align="right">{fmtCompact(r.completionTokens)}</TableCell>
          <TableCell>
            <SuccessRateCell rate={r.successRate} requests={r.apiRequests} />
          </TableCell>
        </TableRow>
      ));
  };

  const periodSelect = (
    <TextField
      select
      size="small"
      label="Period"
      value={currentPreset}
      onChange={e => handlePresetChange(e.target.value as DatePreset)}
      sx={{ minWidth: 160 }}
    >
      {(Object.keys(PRESET_LABELS) as DatePreset[]).map(p => (
        <MenuItem key={p} value={p}>{PRESET_LABELS[p]}</MenuItem>
      ))}
    </TextField>
  );

  return (
    <SectionCard
      title="Usage Analytics"
      subtitle={`${PRESET_LABELS[currentPreset]} · ${dateRange.start.toLocaleDateString()} – ${dateRange.end.toLocaleDateString()}`}
      actions={periodSelect}
    >
      <MetricStrip metrics={metrics} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mt: 2.5,
          mb: 2,
        }}
      >
        <SegmentedControl<TabKey>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'costs', label: 'Costs' },
            { value: 'models', label: 'Model Activity' },
            { value: 'keys', label: 'Key Activity' },
          ]}
        />
        {tab === 'models' && (
          <TextField
            select
            size="small"
            label="Model"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="all">All models</MenuItem>
            {models.map(m => (
              <MenuItem key={m.model_name} value={m.model_name}>{m.model_name}</MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {/* ══ COSTS TAB ════════════════════════════════════════════════════════ */}
      {tab === 'costs' && (
        <Grid container spacing={2}>
          {/* Daily spend by model — the headline chart, given full width so the
              stack and its colour key stay legible with up to seven series. */}
          <Grid item xs={12}>
            <ChartCard title="Daily spend by model" height={260}>
              <ChartOrFallback loading={loading} empty={modelSpendByDate.length === 0} height={260}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={modelSpendByDate} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} {...chart.axis} />
                    <YAxis tickFormatter={fmtUsdCompact} width={56} {...chart.axis} />
                    <Tooltip
                      cursor={chart.cursor}
                      content={<ChartTooltip valueFormatter={fmtUsd} hideZero />}
                    />
                    {topSpendModels.map(m => (
                      <Area
                        key={m}
                        type="monotone"
                        dataKey={m}
                        stackId="spend"
                        stroke={chartColor(m)}
                        strokeWidth={1.5}
                        fill={chartColor(m)}
                        fillOpacity={0.28}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartOrFallback>
              {!loading && topSpendModels.length > 0 && (
                <SeriesLegend series={topSpendModels.map(m => ({ name: m, color: chartColor(m) }))} />
              )}
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <ChartCard title="Daily token usage">
              <ChartOrFallback loading={loading} empty={dailyData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} {...chart.axis} />
                    <YAxis tickFormatter={fmtCompact} width={48} {...chart.axis} />
                    <Tooltip cursor={chart.cursor} content={<ChartTooltip valueFormatter={fmtInt} />} />
                    <Legend {...chart.legend} />
                    <Area type="monotone" dataKey="promptTokens" name="Input" stackId="tok" stroke={SERIES.input} strokeWidth={1.5} fill={SERIES.input} fillOpacity={0.25} />
                    <Area type="monotone" dataKey="completionTokens" name="Output" stackId="tok" stroke={SERIES.output} strokeWidth={1.5} fill={SERIES.output} fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartOrFallback>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <ChartCard title="Daily requests">
              <ChartOrFallback loading={loading} empty={dailyData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} {...chart.axis} />
                    <YAxis tickFormatter={fmtCompact} width={48} {...chart.axis} />
                    <Tooltip cursor={chart.cursor} content={<ChartTooltip valueFormatter={fmtInt} />} />
                    <Legend {...chart.legend} />
                    <Bar dataKey="successfulRequests" name="Successful" fill={SERIES.success} stackId="r" />
                    <Bar dataKey="failedRequests" name="Failed" fill={SERIES.failure} stackId="r" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartOrFallback>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <ChartCard title="Daily success rate">
              <ChartOrFallback loading={loading} empty={successRateData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={successRateData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} {...chart.axis} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} width={44} {...chart.axis} />
                    <Tooltip
                      cursor={chart.cursor}
                      content={<ChartTooltip valueFormatter={(v: number) => `${v}%`} />}
                    />
                    <ReferenceLine y={100} stroke={SERIES.success} strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Line
                      type="monotone"
                      dataKey="successRate"
                      name="Success rate"
                      stroke={SERIES.input}
                      strokeWidth={2}
                      dot={{ r: 2.5, strokeWidth: 0, fill: SERIES.input }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartOrFallback>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <ChartCard
              title={maxBudget > 0 ? 'Cumulative spend vs budget' : 'Cumulative spend'}
              meta={
                maxBudget > 0
                  ? `${fmtUsd(totalCumSpend)} used · ${fmtUsd(Math.max(0, maxBudget - totalCumSpend))} left`
                  : undefined
              }
            >
              <ChartOrFallback loading={loading} empty={cumulativeData.length === 0}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulativeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} {...chart.axis} />
                    <YAxis
                      tickFormatter={fmtUsdCompact}
                      width={56}
                      domain={cumulativeDomain}
                      {...chart.axis}
                    />
                    <Tooltip
                      cursor={chart.cursor}
                      content={<ChartTooltip valueFormatter={fmtUsd} />}
                    />
                    {maxBudget > 0 && (
                      <ReferenceLine
                        y={maxBudget}
                        stroke={SERIES.budget}
                        strokeDasharray="5 4"
                        label={{ value: `Budget ${fmtUsd(maxBudget)}`, position: 'insideTopRight', fontSize: 10, fill: SERIES.budget }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative spend"
                      stroke={SERIES.spend}
                      strokeWidth={2}
                      fill={SERIES.spend}
                      fillOpacity={0.18}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartOrFallback>
            </ChartCard>
          </Grid>
        </Grid>
      )}

      {/* ══ MODELS TAB ═══════════════════════════════════════════════════════ */}
      {tab === 'models' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <ChartCard title="Spend by model" height={Math.max(200, topModelSpendBars.length * 34)}>
              <ChartOrFallback
                loading={loading}
                empty={topModelSpendBars.length === 0}
                height={Math.max(200, topModelSpendBars.length * 34)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topModelSpendBars} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} vertical horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtUsdCompact} {...chart.axis} />
                    <YAxis type="category" dataKey="model" width={170} {...chart.axis} tick={{ fontSize: 10.5, fill: chart.axis.tick.fill }} />
                    <Tooltip cursor={chart.cursor} content={<ChartTooltip valueFormatter={fmtUsd} labelFormatter={l => l} />} />
                    <Bar dataKey="spend" name="Spend" radius={[0, 3, 3, 0]} barSize={14}>
                      {topModelSpendBars.map(r => (
                        <Cell key={r.model} fill={chartColor(r.model)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartOrFallback>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <ChartCard title="Tokens by model" height={Math.max(200, topModelSpendBars.length * 34)}>
              <ChartOrFallback
                loading={loading}
                empty={modelRows.length === 0}
                height={Math.max(200, topModelSpendBars.length * 34)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topModelSpendBars} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...chart.grid} vertical horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtCompact} {...chart.axis} />
                    <YAxis type="category" dataKey="model" width={170} {...chart.axis} tick={{ fontSize: 10.5, fill: chart.axis.tick.fill }} />
                    <Tooltip cursor={chart.cursor} content={<ChartTooltip valueFormatter={fmtInt} labelFormatter={l => l} />} />
                    <Legend {...chart.legend} />
                    <Bar dataKey="promptTokens" name="Input" fill={SERIES.input} stackId="t" barSize={14} />
                    <Bar dataKey="completionTokens" name="Output" fill={SERIES.output} stackId="t" barSize={14} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartOrFallback>
            </ChartCard>
          </Grid>

          <Grid item xs={12}>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small" sx={dataTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Spend</TableCell>
                    <TableCell align="right">Requests</TableCell>
                    <TableCell align="right">Success</TableCell>
                    <TableCell align="right">Failed</TableCell>
                    <TableCell align="right">Input</TableCell>
                    <TableCell align="right">Output</TableCell>
                    <TableCell sx={{ width: 160 }}>Success rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderModelRows()}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      )}

      {/* ══ KEYS TAB ══════════════════════════════════════════════════════════ */}
      {tab === 'keys' && (
        <Grid container spacing={2}>
          {(loading || topKeySpendBars.length > 0) && (
            <Grid item xs={12}>
              <ChartCard title="Spend by key" height={Math.max(160, topKeySpendBars.length * 32)}>
                <ChartOrFallback
                  loading={loading}
                  empty={topKeySpendBars.length === 0}
                  height={Math.max(160, topKeySpendBars.length * 32)}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topKeySpendBars} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid {...chart.grid} vertical horizontal={false} />
                      <XAxis type="number" tickFormatter={fmtUsdCompact} {...chart.axis} />
                      <YAxis type="category" dataKey="keyAlias" width={160} {...chart.axis} tick={{ fontSize: 10.5, fill: chart.axis.tick.fill }} />
                      <Tooltip cursor={chart.cursor} content={<ChartTooltip valueFormatter={fmtUsd} labelFormatter={l => l} />} />
                      <Bar dataKey="spend" name="Spend" fill={SERIES.input} radius={[0, 3, 3, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartOrFallback>
              </ChartCard>
            </Grid>
          )}

          <Grid item xs={12}>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small" sx={dataTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Key</TableCell>
                    <TableCell>Models</TableCell>
                    <TableCell align="right">Spend</TableCell>
                    <TableCell align="right">Requests</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell align="right">Failed</TableCell>
                    <TableCell sx={{ width: 160 }}>Success rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderKeyRows()}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      )}
    </SectionCard>
  );
};
