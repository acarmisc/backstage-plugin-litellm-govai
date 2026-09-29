import React, { useState, useEffect } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useApi } from '@backstage/core-plugin-api';
import { useLiteLLMProfile } from '../hooks/useLiteLLMProfile';
import { liteLlmApiRef } from '../api';
import { UsageMetrics } from '../types';
import { fmtUsd, fmtInt } from '../format';

export interface LiteLLMHomeWidgetProps {
  /** Default period when the widget mounts. Defaults to '7d'. */
  defaultPeriod?: 'today' | '7d' | '30d';
  /** Optional title override. Defaults to 'LiteLLM Usage'. */
  title?: string;
}

type DatePreset = 'today' | '7d' | '30d';


function presetToDateRange(preset: DatePreset): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (preset === '7d') {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(start.getDate() - 30);
  }
  return { start, end };
}

interface KpiProps {
  label: string;
  value: string;
}

const Kpi: React.FC<KpiProps> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="subtitle1" fontWeight={600}>
      {value}
    </Typography>
  </Box>
);

export const LiteLLMHomeWidget: React.FC<LiteLLMHomeWidgetProps> = ({
  defaultPeriod = '7d',
  title = 'LiteLLM Usage',
}) => {
  const api = useApi(liteLlmApiRef);
  const { keys } = useLiteLLMProfile();
  const [period, setPeriod] = useState<DatePreset>(defaultPeriod);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);

    const { start, end } = presetToDateRange(period);
    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    api.getUsage(startDate, endDate)
      .then((usageResult) => {
        if (cancelled) return;
        setUsage(usageResult);
        setUsageLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setUsageError(err?.message ?? 'Failed to load usage data');
          setUsage(null);
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, period]);

  const partialFailure = !usageLoading && usageError && usage;
  const totalFailure = !usageLoading && usageError;

  const dailyData = (usage?.daily_usage ?? []).map(d => ({
    date: d.date,
    spend: d.spend,
  }));

  const hasSparkline = dailyData.length > 0;

  return (
    <Paper sx={{ p: 2 }}>
      {/* Card header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="h6">{title}</Typography>
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <Select
            value={period}
            onChange={e => setPeriod(e.target.value as DatePreset)}
            displayEmpty
          >
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="7d">7d</MenuItem>
            <MenuItem value="30d">30d</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Loading state */}
      {usageLoading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={120}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Error state */}
      {!usageLoading && totalFailure && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {usageError ?? 'Failed to load usage data'}
        </Alert>
      )}

      {/* Content */}
      {!usageLoading && !totalFailure && (
        <>
          {partialFailure && (
            <Alert severity="warning" sx={{ mt: 1, mb: 1 }}>
              {usageError
                ? `Usage data unavailable (${usageError}).`
                : 'Showing what loaded.'}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mb: hasSparkline ? 1.5 : 0 }}>
            <Grid item xs={6}>
              <Kpi label="USD Spent" value={fmtUsd(usage?.total_spend ?? 0)} />
            </Grid>
            <Grid item xs={6}>
              <Kpi label="Tokens In" value={fmtInt(usage?.prompt_tokens ?? 0)} />
            </Grid>
            <Grid item xs={6}>
              <Kpi label="Tokens Out" value={fmtInt(usage?.completion_tokens ?? 0)} />
            </Grid>
            <Grid item xs={6}>
              <Kpi label="Keys" value={fmtInt(keys.length)} />
            </Grid>
          </Grid>

          {/* Sparkline */}
          {hasSparkline && (
            <Box height={120}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.3}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
};
