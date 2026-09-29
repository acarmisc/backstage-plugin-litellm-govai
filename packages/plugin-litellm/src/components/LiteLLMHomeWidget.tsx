import React, { useState, useEffect, useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link } from '@backstage/core-components';
import { useLiteLLMProfile } from '../hooks/useLiteLLMProfile';
import { liteLlmApiRef } from '../api';
import { rootRouteRef } from '../routes';
import { UsageMetrics } from '../types';
import { fmtUsd } from '../format';
import { toLocalDay } from '../dates';
import { SERIES, ChartTooltip } from './ui';
import { widgetViewState, USAGE_UNAVAILABLE_MSG, UNPROVISIONED_MSG } from '../widgetState';
import { rangeCaption, sparklineAriaLabel, usageSummary } from '../homeWidgetHelpers';

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


export const LiteLLMHomeWidget: React.FC<LiteLLMHomeWidgetProps> = ({
  defaultPeriod = '7d',
  title = 'LiteLLM Usage',
  bare = false,
}) => {
  const api = useApi(liteLlmApiRef);
  const moduleRouteRef = useRouteRef(rootRouteRef);
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

  const { start, end } = presetToDateRange(period);
  const startDate = toLocalDay(start);
  const endDate = toLocalDay(end);
  const dateRangeCaption = rangeCaption(startDate, endDate);
  const sparklineAriaLabelText = sparklineAriaLabel(dailyData);

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
            inputProps={{ 'aria-label': 'Usage period' }}
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
          <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
          <Skeleton variant="rectangular" width="100%" height={100} />
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
          {/* Summary line */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              mb: hasSparkline ? 1.5 : 1,
              color: viewState.usageUnavailable ? 'text.secondary' : 'text.primary',
            }}
          >
            {viewState.usageUnavailable ? USAGE_UNAVAILABLE_MSG : usageSummary(usage)}
          </Typography>

          {/* Sparkline with caption */}
          {hasSparkline && !viewState.usageUnavailable && (
            <>
              <Box
                height={80}
                role="img"
                aria-label={sparklineAriaLabelText}
                sx={{ mb: 0.5 }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="date" hide />
                    <Tooltip content={<ChartTooltip valueFormatter={fmtUsd} />} />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      name="Spend"
                      stroke={SERIES.spend}
                      fill={SERIES.spend}
                      fillOpacity={0.3}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                daily spend ({dateRangeCaption})
              </Typography>
            </>
          )}

          {/* Footer link */}
          {moduleRouteRef?.() && (
            <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
              <Link to={moduleRouteRef()} color="primary">
                Open LiteLLM →
              </Link>
            </Typography>
          )}
        </>
      )}
    </Wrapper>
  );
};
