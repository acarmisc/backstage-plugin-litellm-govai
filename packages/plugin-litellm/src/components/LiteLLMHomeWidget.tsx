import React, { useState, useEffect, useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useApi } from '@backstage/core-plugin-api';
import { useLiteLLMProfile } from '../hooks/useLiteLLMProfile';
import { liteLlmApiRef } from '../api';
import { UsageMetrics } from '../types';
import { fmtUsd, fmtInt } from '../format';
import { toLocalDay } from '../dates';
import { widgetViewState, USAGE_UNAVAILABLE_MSG, UNPROVISIONED_MSG } from '../widgetState';

export interface LiteLLMHomeWidgetProps {
  /** Default period when the widget mounts. Defaults to '7d'. */
  defaultPeriod?: 'today' | '7d' | '30d';
  /** Optional title override. Defaults to 'LiteLLM Usage'. */
  title?: string;
  /**
   * Render without the widget's own card chrome and title, for hosts (such as
   * the home page grid) that already provide a titled card. Defaults to false.
   */
  bare?: boolean;
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
  bare = false,
}) => {
  const api = useApi(liteLlmApiRef);
  const { userInfo, keys, loading: profileLoading, error: profileError } = useLiteLLMProfile();
  const [period, setPeriod] = useState<DatePreset>(defaultPeriod);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<unknown>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);

    const { start, end } = presetToDateRange(period);
    const startDate = toLocalDay(start);
    const endDate = toLocalDay(end);

    api.getUsage(startDate, endDate)
      .then((usageResult) => {
        if (cancelled) return;
        setUsage(usageResult);
        setUsageLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setUsageError(err);
          setUsage(null);
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, period]);

  const viewState = useMemo(
    () => widgetViewState({
      loading: profileLoading || usageLoading,
      error: profileError,
      userInfo,
      usageError,
      hasKeys: (keys?.length ?? 0) > 0,
    }),
    [profileLoading, usageLoading, profileError, userInfo, usageError, keys],
  );

  const Wrapper: React.ElementType = bare ? Box : Paper;

  const partialFailure = !usageLoading && usageError && usage;

  const dailyData = (usage?.daily_usage ?? []).map(d => ({
    date: d.date,
    spend: d.spend,
  }));

  const hasSparkline = dailyData.length > 0;

  return (
    <Wrapper sx={bare ? { height: '100%' } : { p: 2, height: '100%' }}>
      {/* Card header */}
      <Box display="flex" justifyContent={bare ? 'flex-end' : 'space-between'} alignItems="center" mb={1.5}>
        {!bare && <Typography variant="h6">{title}</Typography>}
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
      {viewState.kind === 'loading' && (
        <Box sx={{ minHeight: 120 }}>
          <Grid container spacing={2} sx={{ mb: 1.5 }}>
            <Grid item xs={6}>
              <Box>
                <Skeleton variant="text" width="60%" height={12} sx={{ mb: 0.5 }} />
                <Skeleton variant="text" width="80%" height={18} />
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Skeleton variant="text" width="60%" height={12} sx={{ mb: 0.5 }} />
                <Skeleton variant="text" width="80%" height={18} />
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Skeleton variant="text" width="60%" height={12} sx={{ mb: 0.5 }} />
                <Skeleton variant="text" width="80%" height={18} />
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Skeleton variant="text" width="60%" height={12} sx={{ mb: 0.5 }} />
                <Skeleton variant="text" width="80%" height={18} />
              </Box>
            </Grid>
          </Grid>
          <Skeleton variant="rectangular" width="100%" height={120} />
        </Box>
      )}

      {/* Error state */}
      {viewState.kind === 'error' && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {viewState.message}
        </Typography>
      )}

      {/* Unprovisioned state */}
      {viewState.kind === 'unprovisioned' && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {UNPROVISIONED_MSG}
        </Typography>
      )}

      {/* Content */}
      {viewState.kind === 'ready' && partialFailure && (
        <Box sx={{ mt: 1, mb: 1, p: 1, backgroundColor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {USAGE_UNAVAILABLE_MSG}
          </Typography>
        </Box>
      )}

      {viewState.kind === 'ready' && (
        <>
          <Grid container spacing={2} sx={{ mb: hasSparkline ? 1.5 : 0 }}>
            <Grid item xs={6}>
              <Kpi
                label="USD Spent"
                value={viewState.usageUnavailable ? USAGE_UNAVAILABLE_MSG : fmtUsd(usage?.total_spend ?? 0)}
              />
            </Grid>
            <Grid item xs={6}>
              <Kpi
                label="Tokens In"
                value={viewState.usageUnavailable ? USAGE_UNAVAILABLE_MSG : fmtInt(usage?.prompt_tokens ?? 0)}
              />
            </Grid>
            <Grid item xs={6}>
              <Kpi
                label="Tokens Out"
                value={viewState.usageUnavailable ? USAGE_UNAVAILABLE_MSG : fmtInt(usage?.completion_tokens ?? 0)}
              />
            </Grid>
            <Grid item xs={6}>
              <Kpi label="Keys" value={fmtInt(keys.length)} />
            </Grid>
          </Grid>

          {/* Sparkline */}
          {hasSparkline && !viewState.usageUnavailable && (
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
    </Wrapper>
  );
};
