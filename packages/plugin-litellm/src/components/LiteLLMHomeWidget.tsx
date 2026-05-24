import React, { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useApi } from '@backstage/core-plugin-api';
import { liteLlmApiRef } from '../api';
import { UsageMetrics, VirtualKey } from '../types';

export interface LiteLLMHomeWidgetProps {
  /** Default period when the widget mounts. Defaults to '7d'. */
  defaultPeriod?: 'today' | '7d' | '30d';
  /** Optional title override. Defaults to 'LiteLLM Usage'. */
  title?: string;
}

type DatePreset = 'today' | '7d' | '30d';

const fmtUsd = (n: number) => `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
const fmtInt = (n: number) => (n ?? 0).toLocaleString();

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
  const [period, setPeriod] = useState<DatePreset>(defaultPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [keys, setKeys] = useState<VirtualKey[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const { start, end } = presetToDateRange(period);
    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    Promise.all([api.getUsage(startDate, endDate), api.listKeys()])
      .then(([usageData, keysData]) => {
        if (!cancelled) {
          setUsage(usageData);
          setKeys(keysData);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message ?? 'Failed to load usage data');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, period]);

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
      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={120}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Error state */}
      {!loading && error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
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
