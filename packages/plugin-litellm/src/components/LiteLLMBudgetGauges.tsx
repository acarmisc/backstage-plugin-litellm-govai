/**
 * Condensed budget card for a homepage column: one ring gauge per
 * enforcement level (key → personal → team) plus a month-to-date daily
 * token-usage mini-chart, in a fixed four-column row. Each gauge shows the
 * limit nearest its cap; where the full `LiteLLMBudgetWidget` lists every
 * limit as a spend-vs-cap meter, this trades detail for density — a single
 * row with a label and spend figure under each gauge, and the MTD token
 * total under the chart.
 *
 * Gauges are always rendered in the same order, with an empty ring when the
 * user has no cap at that level, so the card keeps a stable shape as data
 * loads and across users. When a level holds several limits, the ring shows
 * the one closest to its cap and a "+N more" link counts the rest.
 *
 * The usage period is frozen to month-to-date (no period selector): the
 * chart always covers the 1st of the current month through today.
 *
 * The bottom action bar is composable: pass any subset of `ctas` — generate
 * a new key, open the LiteLLM module, or expand the full per-limit list in
 * place — in the order you want. `action` remains an escape hatch for a
 * fully custom node; when either is present it renders below a divider. The
 * `new-key` CTA renders the shared `GenerateKeyButton`, identical to the
 * one on the plugin page.
 */
import { ElementType, FC, ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Collapse from '@mui/material/Collapse';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ExpandMore } from '@mui/icons-material';
import { AreaChart, Area, ResponsiveContainer, Tooltip, ReferenceLine, XAxis } from 'recharts';
import { useApi } from '@backstage/core-plugin-api';
import { Link } from '@backstage/core-components';
import { useLiteLLMProfile } from '../hooks/useLiteLLMProfile';
import { liteLlmApiRef } from '../api';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { fmtUsd } from '../format';
import { monthToDateRange } from '../dates';
import { resolveCtas, type BudgetCtaKind, type BudgetCtaSpec, type BudgetCta } from '../ctas';
import { widgetViewState, USAGE_UNAVAILABLE_MSG, UNPROVISIONED_MSG } from '../widgetState';
import { Gauge, StatusPill, ChartTooltip, SERIES } from './ui';
import { GenerateKeyButton } from './GenerateKeyButton';
import { BudgetLimitList, LimitListPanel } from './BudgetLimitList';
import {
  allBudgetLimits,
  buildBudgetGauges,
  buildBudgetSummary,
  budgetHeadline,
  BudgetGauge,
  BudgetLimit,
  budgetTone,
  fmtBudgetDuration,
} from '../budget';
import { rootRouteRef } from '../routes';
import { mtdCaption, sparklineAriaLabel } from '../homeWidgetHelpers';

export type { BudgetCtaKind, BudgetCtaSpec, BudgetCta } from '../ctas';

export interface LiteLLMBudgetGaugesProps {
  /** Optional title override. Defaults to 'Budget'. */
  title?: string;
  /**
   * Render without the card's own chrome and title, for hosts (such as the
   * home page grid) that already provide a titled card. Defaults to false.
   */
  bare?: boolean;
  /** Ring diameter in px. Defaults to 72. */
  size?: number;
  /** Where the "+N more" key link points. Defaults to the Keys tab. */
  keysHref?: string;
  /** Where the module CTA points. Defaults to the LiteLLM page. */
  moduleHref?: string;
  /**
   * Called when the "Generate New Key" CTA is used. When omitted, the CTA
   * deep-links to the module with `?generate=1`, which opens the
   * generate-key dialog.
   */
  onCreateKey?: () => void;
  /**
   * Action-bar buttons to render, in order. Defaults to
   * `['module', 'all-limits']`; 'new-key' is added automatically for users with no keys. Pass `[]` to hide the bar; the
   * `all-limits` entry is dropped automatically when the user has no limits.
   */
  ctas?: BudgetCta[];
  /** Max key limits listed in the expanded view. Defaults to 8. */
  maxExpandedKeys?: number;
  /** Controlled expanded state for the all-limits view. */
  expanded?: boolean;
  /** Initial expanded state when uncontrolled. Defaults to false. */
  defaultExpanded?: boolean;
  /** Notified whenever the expanded state changes. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Fully custom node pinned below the CTAs, below a divider. */
  action?: ReactNode;
  /**
   * Optional preloaded data to use instead of fetching via the hook.
   * When provided, the component uses these values directly without refetching.
   */
  userInfo?: UserInfo | null;
  teams?: TeamInfo[];
  keys?: VirtualKey[];
}

/** One-word level names, and the note shown when the level has no cap. */
const LEVEL: Record<BudgetGauge['kind'], { name: string; none: string }> = {
  key: { name: 'Key', none: 'No cap (unlimited)' },
  user: { name: 'User', none: 'No personal budget' },
  team: { name: 'Team', none: 'No team budget' },
};

const CTA_LABELS: Record<BudgetCtaKind, string> = {
  'new-key': 'Generate New Key',
  module: 'Open LiteLLM',
  'all-limits': 'All limits',
};

/** Compact USD for the tight gauge caption — drops trailing cents. */
function fmtUsdShort(n: number): string {
  const v = n ?? 0;
  if (v >= 100 && Number.isInteger(v)) return `$${v}`;
  return fmtUsd(v);
}

/** Gauge caption: "$213.39 / $240", or a note when dollars are redacted. */
function spendCaption(limit: BudgetLimit): string {
  if (limit.hidden) return 'hidden by admin';
  return `${fmtUsdShort(limit.spend)} / ${fmtUsdShort(limit.budget)}`;
}

/** Reset-window line under the gauge: "resets every 30 days" / "never resets". */
function resetLabel(limit: BudgetLimit): string {
  const window = fmtBudgetDuration(limit.budgetDuration);
  return window ? `resets ${window}` : 'never resets';
}

const LevelGauge: FC<{ gauge: BudgetGauge; size: number; keysHref?: string }> = ({
  gauge,
  size,
  keysHref,
}) => {
  const { name, none } = LEVEL[gauge.kind];
  const limit = gauge.limit;
  const tone = limit ? budgetTone(limit.pct) : 'neutral';
  const extra = gauge.kind === 'key' ? Math.max(0, gauge.count - 1) : 0;

  const gaugeAriaLabel = limit
    ? `${name} budget used: ${Math.round(limit.pct)}%`
    : `${name} — no cap`;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <Gauge
        value={limit?.pct ?? 0}
        tone={tone}
        size={size}
        label={limit ? `${Math.round(limit.pct)}%` : '—'}
        ariaLabel={gaugeAriaLabel}
      />
      <Typography
        sx={theme => ({
          mt: 0.75,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: tone === 'neutral' ? theme.palette.text.secondary : undefined,
        })}
      >
        {name}
      </Typography>

      {limit ? (
        <>
          <Typography
            variant="caption"
            title={limit.sublabel ? `${limit.label} · ${limit.sublabel}` : limit.label}
            sx={{
              mt: 0.25,
              fontSize: 11,
              fontWeight: 600,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {limit.label}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: 10.5,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'center',
            }}
          >
            {spendCaption(limit)}
          </Typography>
          {extra > 0 && keysHref ? (
            <Typography
              component={Link}
              to={keysHref}
              variant="caption"
              sx={{
                fontSize: 10.5,
                color: 'primary.main',
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              +{extra} more
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>
              {resetLabel(limit)}
            </Typography>
          )}
        </>
      ) : (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.25, fontSize: 10.5, textAlign: 'center' }}
        >
          {none}
        </Typography>
      )}
    </Box>
  );
};

// monthToDateRange is imported from dates.ts above; re-export for backwards compatibility
export { monthToDateRange } from '../dates';

interface DailySpend {
  date: string;
  spend: number;
}

/**
 * Fourth column of the budget card: a sparkline of daily spend (MTD),
 * with an optional dashed cap line. Same column width and label language as
 * the gauges so the four-column row stays aligned.
 */
const UsageMiniChart: FC<{
  data: DailySpend[];
  totalSpend: number;
  loading: boolean;
  height: number;
  usageUnavailable?: boolean;
  maxBudget?: number;
}> = ({ data, totalSpend, loading, height, usageUnavailable = false, maxBudget }) => {
  const renderPlot = () => {
    if (loading) {
      return (
        <Skeleton variant="rectangular" width="100%" height="100%" />
      );
    }
    if (data.length === 0) {
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="100%"
          sx={theme => ({ color: theme.palette.text.secondary, fontSize: 18 })}
        >
          —
        </Box>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <Tooltip content={<ChartTooltip valueFormatter={fmtUsd} />} />
          {maxBudget !== undefined && (
            <ReferenceLine
              y={maxBudget}
              stroke={SERIES.budget}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
          <Area
            type="monotone"
            dataKey="spend"
            name="Spend"
            stroke={SERIES.spend}
            strokeWidth={1.5}
            fill={SERIES.spend}
            fillOpacity={0.25}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const renderCaption = () => {
    if (loading) {
      return (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, fontSize: 11 }}>
          …
        </Typography>
      );
    }
    if (usageUnavailable) {
      return (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.25, fontSize: 10.5, textAlign: 'center' }}
        >
          {USAGE_UNAVAILABLE_MSG}
        </Typography>
      );
    }
    if (data.length === 0) {
      return (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.25, fontSize: 10.5, textAlign: 'center' }}
        >
          No spend this month
        </Typography>
      );
    }
    return (
      <>
        <Typography
          variant="caption"
          title={`${fmtUsd(totalSpend)} spent month to date`}
          sx={{
            mt: 0.25,
            fontSize: 11,
            fontWeight: 600,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtUsd(totalSpend)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>
          month to date
        </Typography>
      </>
    );
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 0,
      }}
      role="img"
      aria-label={sparklineAriaLabel(data)}
    >
      <Box sx={{ height, width: '100%' }}>{renderPlot()}</Box>
      <Typography
        sx={theme => ({
          mt: 0.75,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: theme.palette.text.secondary,
        })}
      >
        Spend (MTD)
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 0.25, fontSize: 10.5 }}
      >
        {mtdCaption()}
      </Typography>
      {renderCaption()}
    </Box>
  );
};

export const LiteLLMBudgetGauges: FC<LiteLLMBudgetGaugesProps> = ({
  title = 'Budget',
  bare = false,
  size = 72,
  keysHref,
  moduleHref: propModuleHref,
  onCreateKey,
  ctas,
  maxExpandedKeys = 8,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  action,
  userInfo: propUserInfo,
  teams: propTeams,
  keys: propKeys,
}) => {
  const api = useApi(liteLlmApiRef);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const gaugeSize = isSmallScreen ? 56 : size;
  const expandedRegionId = useId();
  const moduleRouteRef = useRouteRef(rootRouteRef);
  const moduleHref = propModuleHref ?? moduleRouteRef?.();
  const { userInfo: hookUserInfo, teams: hookTeams, keys: hookKeys, loading: profileLoading, error: profileError } = useLiteLLMProfile();
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [dailySpend, setDailySpend] = useState<DailySpend[]>([]);
  const [mtdSpend, setMtdSpend] = useState(0);

  // Use provided props if available, otherwise use hook data
  const user = propUserInfo !== undefined ? propUserInfo : hookUserInfo;
  const teams = propTeams !== undefined ? propTeams : hookTeams;
  const keys = propKeys !== undefined ? propKeys : hookKeys;

  // Combine loading states: if props are provided, only usage matters; otherwise both profile and usage
  const loading = propUserInfo === undefined ? profileLoading : usageLoading;
  const error = propUserInfo === undefined ? profileError : usageError;

  const isControlled = expanded !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const isExpanded = isControlled ? expanded! : uncontrolledExpanded;

  const toggleExpanded = useCallback(() => {
    const next = !isExpanded;
    if (!isControlled) setUncontrolledExpanded(next);
    onExpandedChange?.(next);
  }, [isControlled, isExpanded, onExpandedChange]);

  const keysTabHref = keysHref ?? (moduleHref ? `${moduleHref}?tab=keys` : undefined);

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);
    // The usage chart is frozen to month-to-date — no period selector.
    const { startDate, endDate } = monthToDateRange();
    api.getUsage(startDate, endDate)
      .then((usageResult) => {
        if (cancelled) return;
        // Usage degrades independently: a failed usage fetch leaves the
        // gauges untouched and the chart column renders its empty state.
        const daily = usageResult.daily_usage ?? [];
        setDailySpend(
          daily.map(d => ({
            date: d.date,
            spend: d.spend ?? 0,
          })),
        );
        setMtdSpend(usageResult.total_spend ?? 0);
        setUsageLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setUsageError(err?.message ?? 'Failed to load usage data');
          setDailySpend([]);
          setMtdSpend(0);
          setUsageLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Keep every budgeted key so the nearest-per-level gauge is accurate even
  // beyond the full widget's display cap.
  const summary = useMemo(
    () => buildBudgetSummary(user, teams, keys, keys.length),
    [user, teams, keys],
  );
  const gauges = useMemo(() => buildBudgetGauges(summary), [summary]);
  const headline = useMemo(() => budgetHeadline(summary), [summary]);

  // Expanded view: every concrete limit, but cap the key entries so a user
  // with dozens of keys doesn't get an endless list.
  const expandedSummary = useMemo(
    () => buildBudgetSummary(user, teams, keys, maxExpandedKeys),
    [user, teams, keys, maxExpandedKeys],
  );
  const expandedLimits = useMemo(
    () => allBudgetLimits(expandedSummary),
    [expandedSummary],
  );

  // Determine the overall widget state
  const viewState = useMemo(
    () => widgetViewState({
      loading,
      error: profileError,
      userInfo: user,
      usageError,
      hasKeys: (keys?.length ?? 0) > 0,
    }),
    [loading, profileError, user, usageError, keys],
  );

  const summaryText =
    headline.count === 0
      ? 'no limits apply'
      : `${headline.count} limit${headline.count === 1 ? '' : 's'}`;

  const resolvedCtas = useMemo<(BudgetCtaSpec & { kind: BudgetCtaKind })[]>(() => {
    return resolveCtas({
      ctas,
      hasKeys: (keys?.length ?? 0) > 0,
      viewState,
      limitCount: headline.count,
    });
  }, [ctas, keys?.length, viewState, headline.count]);

  const renderCta = (cta: BudgetCtaSpec & { kind: BudgetCtaKind }, index: number) => {
    const label = cta.label ?? CTA_LABELS[cta.kind];
    const key = `${cta.kind}-${index}`;
    switch (cta.kind) {
      case 'new-key':
        // The shared plugin-page CTA — identical copy, icon and styling
        // everywhere. Deep-links to the module's generate-key dialog unless
        // the host takes over with `onCreateKey`.
        if (!onCreateKey && !moduleHref) return null;
        return onCreateKey ? (
          <GenerateKeyButton key={key} size="small" label={label} onClick={onCreateKey} />
        ) : (
          <GenerateKeyButton key={key} size="small" label={label} to={`${moduleHref}?generate=1`} />
        );
      case 'module':
        // Hide if route is not mounted
        if (!moduleHref) return null;
        return (
          <Button key={key} size="small" variant="text" component={Link} to={moduleHref}>
            {label}
          </Button>
        );
      case 'all-limits':
        return (
          <Button
            key={key}
            size="small"
            variant="text"
            onClick={toggleExpanded}
            aria-expanded={isExpanded}
            aria-controls={expandedRegionId}
            endIcon={
              <ExpandMore
                sx={muiTheme => ({
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: muiTheme.transitions.create('transform'),
                })}
              />
            }
          >
            {label}
          </Button>
        );
      /* istanbul ignore next — exhaustiveness */
      default:
        return null;
    }
  };

  const hasFooter = resolvedCtas.length > 0 || !!action;

  const Wrapper: ElementType = bare ? Box : Paper;

  return (
    <Wrapper sx={bare ? { height: '100%' } : { p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, minWidth: 0, justifyContent: bare ? 'flex-end' : undefined }}>
        {!bare && (
          <Typography variant="h6" lineHeight={1.2} sx={{ minWidth: 0, flex: 1 }}>
            {title}
          </Typography>
        )}
        {!loading && !error && (
          <StatusPill
            label={summaryText}
            tone={budgetTone(headline.closest?.pct ?? 0)}
            dot={headline.count > 0}
          />
        )}
      </Box>

      {viewState.kind === 'loading' && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minHeight: size }}>
          {[0, 1, 2, 3].map(i => (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <Skeleton variant="circular" width={size} height={size} sx={{ mb: 0.75 }} />
              <Skeleton variant="text" width="100%" height={12} sx={{ mb: 0.25 }} />
              <Skeleton variant="text" width="80%" height={11} sx={{ mb: 0.25 }} />
              <Skeleton variant="text" width="70%" height={10.5} />
            </Box>
          ))}
        </Box>
      )}

      {viewState.kind === 'error' && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {viewState.message}
        </Typography>
      )}

      {viewState.kind === 'unprovisioned' && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {UNPROVISIONED_MSG}
        </Typography>
      )}

      {viewState.kind === 'ready' && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))', gap: 1 }}>
            {gauges.map(gauge => (
              <LevelGauge key={gauge.kind} gauge={gauge} size={gaugeSize} keysHref={keysTabHref} />
            ))}
            <UsageMiniChart
              data={dailySpend}
              totalSpend={mtdSpend}
              loading={usageLoading}
              height={gaugeSize}
              usageUnavailable={viewState.usageUnavailable}
              maxBudget={user?.max_budget ?? undefined}
            />
          </Box>

          <Collapse in={isExpanded} unmountOnExit>
            <Box
              id={expandedRegionId}
              sx={{
                mt: 1.5,
                // Bound the expanded list so a user with many limits still
                // keeps the card compact and the toggle within reach.
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              <LimitListPanel>
                <BudgetLimitList
                  limits={expandedLimits}
                  hiddenKeyCount={expandedSummary.hiddenBudgetedKeys}
                  keysHref={keysTabHref}
                />
              </LimitListPanel>
            </Box>
          </Collapse>
        </>
      )}

      {hasFooter && (
        <Box
          sx={muiTheme => ({
            mt: 2,
            pt: 2,
            borderTop: `1px solid ${muiTheme.palette.divider}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          })}
        >
          {resolvedCtas.map(renderCta)}
          {action}
        </Box>
      )}
    </Wrapper>
  );
};
