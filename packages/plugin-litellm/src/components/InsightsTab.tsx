import { FC, useMemo } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Skeleton from '@mui/material/Skeleton';
import { useAsyncRetry } from 'react-use';
import type { LiteLlmApiInterface } from '../api';
import type {
  DateRange,
  ModelInfo,
  ModelOpportunity,
  UsageMetrics,
  VirtualKey,
} from '../types';
import { summarizeUsage, scorePractices, modelOpportunities } from '../insights';
import { fmtUsd, fmtInt } from '../format';
import { toLocalDay } from '../dates';
import {
  EmptyState,
  Meter,
  MetricStrip,
  SectionCard,
  Stat,
  StatusPill,
  dataTableSx,
  type Tone,
} from './ui';

export interface InsightsTabProps {
  api: LiteLlmApiInterface;
  usage: UsageMetrics | null;
  models: ModelInfo[];
  keys: VirtualKey[];
  dateRange: DateRange;
  loading: boolean;
}

const FLAG_TONE: Record<ModelOpportunity['flag'], Tone> = {
  'failure-outlier': 'danger',
  'downgrade-candidate': 'warning',
  ok: 'success',
};

const FLAG_LABEL: Record<ModelOpportunity['flag'], string> = {
  'failure-outlier': 'Failure outlier',
  'downgrade-candidate': 'Downgrade candidate',
  ok: 'OK',
};

const fmtRatio = (n: number | null) =>
  n === null || Number.isNaN(n) ? '—' : `${n.toFixed(2)}×`;
const fmtPct1 = (n: number | null) =>
  n === null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(1)}%`;

const failedRow = (status: string) => /fail|error/i.test(status ?? '');

export const InsightsTab: FC<InsightsTabProps> = ({
  api,
  usage,
  models,
  keys,
  dateRange,
  loading,
}) => {
  const summary = useMemo(() => summarizeUsage(usage, models), [usage, models]);

  const keyStats = useMemo(
    () => ({
      idleKeys: keys.filter(k => (k.spend ?? 0) === 0).length,
      uncappedKeys: keys.filter(k => k.max_budget === undefined || k.max_budget === null).length,
      totalKeys: keys.length,
    }),
    [keys],
  );
  const score = useMemo(
    () => scorePractices(summary, keyStats),
    [summary, keyStats],
  );

  const opportunities = useMemo(() => {
    const opps = modelOpportunities(usage, models);
    // Non-actionable rows last so the signal reads first.
    return [...opps].sort(
      (a, b) => (a.flag === 'ok' ? 1 : 0) - (b.flag === 'ok' ? 1 : 0),
    );
  }, [usage, models]);

  const {
    value: spendLogs,
    loading: logsLoading,
    error: logsError,
    retry: retryLogs,
  } = useAsyncRetry(async () => {
    return api.getSpendLogs({
      startDate: toLocalDay(dateRange.start),
      endDate: toLocalDay(dateRange.end),
      pageSize: 1000,
    });
  }, [api, dateRange]);

  const logStats = useMemo(() => {
    const rows = spendLogs?.data ?? [];
    const hits = rows.filter(r => r.cacheHit);
    const cachedPromptTokens = hits.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
    const priced = models
      .map(m => m.input_cost_per_token)
      .filter((p): p is number => p !== null && p !== undefined && p > 0);
    const avgInputPrice =
      priced.length > 0 ? priced.reduce((s, p) => s + p, 0) / priced.length : null;
    return {
      total: spendLogs?.total ?? rows.length,
      hitRate: rows.length > 0 ? hits.length / rows.length : null,
      // Estimate: cached prompt tokens billed at the average listed input price.
      savedUsd:
        avgInputPrice !== null ? cachedPromptTokens * avgInputPrice : null,
      failedWasteUsd: rows
        .filter(r => failedRow(r.status))
        .reduce((s, r) => s + (r.spend ?? 0), 0),
      truncated: spendLogs?.truncated ?? false,
    };
  }, [spendLogs, models]);

  const renderSpendLogsBody = () => {
    if (logsLoading) return <Skeleton variant="rounded" height={120} />;
    if (logsError) {
      return (
        <Alert severity="error">
          Failed to load spend logs: {(logsError as Error).message || 'Unknown error'}
          <Box sx={{ mt: 1 }}>
            <Button size="small" onClick={retryLogs}>Retry</Button>
          </Box>
        </Alert>
      );
    }
    if ((spendLogs?.data ?? []).length === 0) {
      return <EmptyState message="No spend logs in this period" />;
    }
    return (
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Stat label="Cache-hit rate" value={fmtPct1(logStats.hitRate)} />
        <Stat
          label="Cache savings (est.)"
          value={logStats.savedUsd !== null ? fmtUsd(logStats.savedUsd) : '—'}
        />
        <Stat label="Failed-request waste" value={fmtUsd(logStats.failedWasteUsd)} />
        <Stat label="Log rows" value={fmtInt(logStats.total)} />
        {logStats.truncated && (
          <Typography variant="caption" color="text.secondary">
            Showing the first 1,000 rows — figures are a lower bound.
          </Typography>
        )}
      </Box>
    );
  };

  const kpis = [
    {
      label: 'Cost / 1k tokens',
      value: summary.costPer1kTokens !== null ? fmtUsd(summary.costPer1kTokens) : '—',
      tone: 'accent' as const,
    },
    {
      label: 'Cost / request',
      value: summary.costPerRequest !== null ? fmtUsd(summary.costPerRequest) : '—',
      tone: 'info' as const,
    },
    {
      label: 'Out : in ratio',
      value: fmtRatio(summary.outputInputRatio),
      tone: 'neutral' as const,
    },
    {
      label: 'Retry waste',
      value: fmtUsd(summary.retryWasteUsd),
      hint: `${fmtPct1(summary.retryWasteShare)} of spend`,
      tone: 'warning' as const,
    },
    {
      label: 'Success rate',
      value: fmtPct1(summary.successRate),
      tone: 'success' as const,
    },
  ];

  const renderEfficiencyBody = () => {
    if (loading) return <Skeleton variant="rounded" height={96} />;
    if (!usage) return <EmptyState message="No usage in this period" />;
    return <MetricStrip metrics={kpis} />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard
        title="Efficiency"
        subtitle={`${dateRange.start.toLocaleDateString()} – ${dateRange.end.toLocaleDateString()}`}
      >
        {renderEfficiencyBody()}
      </SectionCard>

      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={12} md={5}>
          <SectionCard title="Practice score" subtitle="Out of 100">
            {loading ? (
              <Skeleton variant="rounded" height={160} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {score.total}
                  <Typography component="span" color="text.secondary" sx={{ fontSize: 16 }}>
                    /100
                  </Typography>
                </Typography>
                {score.checks.map(c => (
                  <Box key={c.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.label}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {c.points}/{c.maxPoints}
                      </Typography>
                    </Box>
                    <Meter
                      value={c.maxPoints > 0 ? (c.points / c.maxPoints) * 100 : 0}
                      ariaLabel={`${c.label}: ${c.points} of ${c.maxPoints}`}
                    />
                    <Typography variant="caption" color="text.secondary">{c.detail}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={7}>
          <SectionCard title="Cache & errors" subtitle="From spend logs (estimate)">
            {renderSpendLogsBody()}
          </SectionCard>
        </Grid>
      </Grid>

      <SectionCard title="Model opportunities" flush>
        {loading ? (
          <Box sx={{ p: 2.5 }}><Skeleton variant="rounded" height={120} /></Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={dataTableSx}>
              <TableHead>
                <TableRow>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Spend</TableCell>
                  <TableCell align="right">Requests</TableCell>
                  <TableCell align="right">Failure</TableCell>
                  <TableCell align="right">Avg / req</TableCell>
                  <TableCell>Signal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {opportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState message="No model activity in this period" />
                    </TableCell>
                  </TableRow>
                ) : (
                  opportunities.map(o => (
                    <TableRow key={o.model}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.model}</Typography>
                      </TableCell>
                      <TableCell align="right">{fmtUsd(o.spend)}</TableCell>
                      <TableCell align="right">{fmtInt(o.requests)}</TableCell>
                      <TableCell align="right">{fmtPct1(o.failureRate)}</TableCell>
                      <TableCell align="right">{fmtUsd(o.avgCostPerRequest)}</TableCell>
                      <TableCell>
                        <StatusPill label={FLAG_LABEL[o.flag]} tone={FLAG_TONE[o.flag]} title={o.hint} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {o.hint}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      <SectionCard title="Quality scores">
        <EmptyState
          message="Quality scores — connect Langfuse"
          hint="LLM-as-judge evaluation is not configured for this deployment."
        />
      </SectionCard>
    </Box>
  );
};
