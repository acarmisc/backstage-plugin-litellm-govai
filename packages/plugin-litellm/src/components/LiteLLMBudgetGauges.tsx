/**
 * Condensed budget card for a homepage column: spend KPIs on one line,
 * one inline row per enforcement level (key → personal → team), and a
 * month-to-date daily spend strip, in a fixed card that never reflows.
 *
 * The card is deliberately *row*-shaped rather than four side-by-side
 * columns: a four-column grid lets one long key alias widen its track (a
 * `1fr` track is only as narrow as its widest unbreakable content) and lets
 * each column wrap its own number of caption lines, so the text under the
 * rings drifts out of alignment. Rows share three fixed tracks — ring,
 * flexible name, right-aligned amount — so every figure is in the same
 * place and tabular numerals line up, and a long name ellipsizes inside
 * `minmax(0, 1fr)` instead of stretching anything.
 *
 * Each row shows the limit nearest its cap at that level: the ring carries
 * the percentage, the middle track the level tag, limit name and a short
 * note (over cap, a `+N more` link, or the key id / email), and the right
 * track the spend-vs-cap dollars over the reset window — one caption per
 * fact, so the reset window is never printed twice in a row. Where the full `LiteLLMBudgetWidget` lists every limit as a
 * meter card, this trades detail for density. Gauges are always rendered in
 * the same order, with an empty ring when the user has no cap at that
 * level, so the card keeps a stable shape as data loads and across users.
 *
 * Above the rows sit two inline KPIs — **today spent** (with a
 * day-over-day hint) and month-to-date spend — both derived from the same
 * month-to-date usage call, so the indicator costs no extra request. The
 * usage period is frozen to month-to-date (no period selector): the chart
 * always covers the 1st of the current month through today.
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
import { monthToDateRange, toLocalDay } from '../dates';
import { resolveCtas, type BudgetCtaKind, type BudgetCtaSpec, type BudgetCta } from '../ctas';
import { widgetViewState, USAGE_UNAVAILABLE_MSG, UNPROVISIONED_MSG } from '../widgetState';
import { Gauge, StatusPill, ChartTooltip, SERIES, toneColor, type Tone } from './ui';
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
import { mtdCaption, sparklineAriaLabel, spendOnDay } from '../homeWidgetHelpers';

export type { BudgetCtaKind, BudgetCtaSpec, BudgetCta } from '../ctas';

export interface LiteLLMBudgetGaugesProps {
  /** Optional title override. Defaults to 'Budget'. */
  title?: string;
  /**
   * Render without the card's own chrome and title, for hosts (such as the
   * home page grid) that already provide a titled card. Defaults to false.
   */
  bare?: boolean;
  /** Ring diameter in px. Defaults to 56. */
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

/** Compact USD for the tight budget caption — drops trailing cents. */
function fmtUsdShort(n: number): string {
  const v = n ?? 0;
  if (v >= 100 && Number.isInteger(v)) return `$${v}`;
  return fmtUsd(v);
}

/** Budget caption: "$213.39 / $240", or a note when dollars are redacted. */
function spendCaption(limit: BudgetLimit): string {
  if (limit.hidden) return 'hidden by admin';
  return `${fmtUsdShort(limit.spend)} / ${fmtUsdShort(limit.budget)}`;
}

/** Reset-window line under the amount: "resets every 30 days" / "never resets". */
function resetLabel(limit: BudgetLimit): string {
  const window = fmtBudgetDuration(limit.budgetDuration);
  return window ? `resets ${window}` : 'never resets';
}

/** Uppercase micro-label used for levels, KPIs and the chart caption. */
const Tag: FC<{ children: ReactNode; tone?: Tone; title?: string }> = ({ children, tone, title }) => (
  <Typography
    title={title}
    sx={theme => ({
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      lineHeight: 1.3,
      color: tone ? toneColor(theme, tone) : theme.palette.text.secondary,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    })}
  >
    {children}
  </Typography>
);

/**
 * One inline KPI: uppercase label over a tabular value with a quiet hint
 * underneath. Fixed three-line shape, so two of them sit side by side
 * without their baselines drifting apart.
 */
const InlineStat: FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  title?: string;
}> = ({ label, value, hint, tone = 'accent', title }) => (
  <Box sx={{ minWidth: 0, flex: 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, minWidth: 0 }}>
      <Box
        sx={theme => ({
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: toneColor(theme, tone),
          flexShrink: 0,
        })}
      />
      <Tag>{label}</Tag>
    </Box>
    <Typography
      title={title}
      sx={{
        fontSize: 19,
        fontWeight: 700,
        lineHeight: 1.15,
        mt: 0.25,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value}
    </Typography>
    {/* Fixed height so rows of stats stay aligned even with an empty hint. */}
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{
        display: 'block',
        mt: 0.25,
        fontSize: 10.5,
        minHeight: 14,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {hint ?? ''}
    </Typography>
  </Box>
);

/**
 * One enforcement level as a single row: ring on the left, level tag +
 * limit name + a short note (over cap, "+N more", key id) in the flexible
 * middle, spend-vs-cap dollars over the reset window right-aligned in a
 * fixed track.
 */
const LevelRow: FC<{ gauge: BudgetGauge; size: number; keysHref?: string }> = ({
  gauge,
  size,
  keysHref,
}) => {
  const { name, none } = LEVEL[gauge.kind];
  const limit = gauge.limit;
  const tone = limit ? budgetTone(limit.pct) : 'neutral';
  const extra = gauge.kind === 'key' ? Math.max(0, gauge.count - 1) : 0;
  const overCap = Boolean(limit && limit.pct > 100);

  /**
   * Third line of the middle track. The over-cap flag earns the slot first
   * (the reset window below already lives in the right track, so repeating it
   * here would print the same caption twice), then the "+N more" link, then
   * the identifying detail — key id, email, team slug.
   */
  const subNote = (): ReactNode => {
    if (overCap) return 'Over cap';
    if (extra > 0 && keysHref) {
      return (
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
      );
    }
    return limit?.sublabel ?? null;
  };

  const gaugeAriaLabel = limit
    ? `${name} budget used: ${Math.round(limit.pct)}%`
    : `${name} — no cap`;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 1.25,
        py: 0.75,
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

      <Box sx={{ minWidth: 0 }}>
        {/* The default accent tone would colour every healthy row; only a
            warning or an over-cap limit earns a coloured level tag. */}
        <Tag tone={tone === 'warning' || tone === 'danger' ? tone : undefined}>{name}</Tag>
        {limit ? (
          <>
            <Typography
              variant="caption"
              title={limit.sublabel ? `${limit.label} · ${limit.sublabel}` : limit.label}
              sx={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 600,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {limit.label}
            </Typography>
            <Typography
              variant="caption"
              color={overCap ? 'error' : 'text.secondary'}
              sx={{
                display: 'block',
                fontSize: 10.5,
                fontWeight: overCap ? 700 : undefined,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subNote()}
            </Typography>
          </>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              fontSize: 10.5,
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {none}
          </Typography>
        )}
      </Box>

      <Box sx={{ minWidth: 0, textAlign: 'right' }}>
        <Typography
          title={limit ? `${fmtUsd(limit.spend)} of ${fmtUsd(limit.budget)}` : undefined}
          sx={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.35,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: limit ? undefined : 'text.secondary',
          }}
        >
            {amountCaption(limit)}
          </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            fontSize: 10.5,
            lineHeight: 1.35,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {amountNote(limit)}
        </Typography>
      </Box>
    </Box>
  );
};

/** Right-track amount: "$213 / $240", or just the percentage when hidden. */
function amountCaption(limit?: BudgetLimit): string {
  if (!limit) return '';
  return limit.hidden ? `${Math.round(limit.pct)}%` : spendCaption(limit);
}

/** Second right-track line: the reset window, or why dollars are missing. */
function amountNote(limit?: BudgetLimit): string {
  if (!limit) return '';
  return limit.hidden ? 'hidden by admin' : resetLabel(limit);
}

interface DailySpend {
  date: string;
  spend: number;
}

/**
 * Full-width strip below the rows: a sparkline of daily spend (MTD) with
 * the month's total on the same caption line as the range, so the number,
 * the window and the chart read as one unit.
 */
const SpendStrip: FC<{
  data: DailySpend[];
  mtdSpend: number;
  loading: boolean;
  height: number;
  usageUnavailable?: boolean;
  maxBudget?: number;
}> = ({ data, mtdSpend, loading, height, usageUnavailable = false, maxBudget }) => {
  const renderPlot = () => {
    if (loading) {
      return <Skeleton variant="rectangular" width="100%" height="100%" />;
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

  const caption = (() => {
    if (loading) return '…';
    if (usageUnavailable) return USAGE_UNAVAILABLE_MSG;
    if (data.length === 0) return 'No spend this month';
    return mtdCaption();
  })();

  return (
    <Box role="img" aria-label={sparklineAriaLabel(data)} sx={{ minWidth: 0 }}>
      <Box sx={{ height, width: '100%' }}>{renderPlot()}</Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
          mt: 0.5,
          minWidth: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
          <Tag>Spent (mtd)</Tag>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {caption}
          </Typography>
        </Box>
        <Typography
          title={loading || usageUnavailable ? undefined : `${fmtUsd(mtdSpend)} spent month to date`}
          sx={{
            fontSize: 12.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {loading || usageUnavailable ? '—' : fmtUsd(mtdSpend)}
        </Typography>
      </Box>
    </Box>
  );
};

/** KPI value while loading / unavailable: '…' → '—' → the figure. */
function statValue(loading: boolean, unavailable: boolean, value: string): string {
  if (loading) return '…';
  if (unavailable) return '—';
  return value;
}

/** KPI hint under `statValue`: nothing while loading, the reason when unavailable. */
function statHint(loading: boolean, unavailable: boolean, hint?: string): string | undefined {
  if (loading) return undefined;
  if (unavailable) return USAGE_UNAVAILABLE_MSG;
  return hint;
}

export const LiteLLMBudgetGauges: FC<LiteLLMBudgetGaugesProps> = ({
  title = 'Budget',
  bare = false,
  size = 56,
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
  const gaugeSize = isSmallScreen ? Math.min(48, size) : size;
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
        // gauges untouched and the chart strip renders its empty state.
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

  // Today's spend (and yesterday's, for the hint) come from the same
  // month-to-date series the chart already fetched — no extra request.
  const today = new Date();
  const todaySpend = spendOnDay(dailySpend, today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  // No yesterday point when the month started today — say nothing rather
  // than imply the user spent nothing.
  const yesterdaySpend = dailySpend.some(d => d.date === toLocalDay(yesterday))
    ? spendOnDay(dailySpend, yesterday)
    : null;
  const todayHint = yesterdaySpend === null ? undefined : `vs ${fmtUsd(yesterdaySpend)} yesterday`;

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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: size }}>
          {[0, 1, 2].map(i => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Skeleton variant="circular" width={size} height={size} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="70%" height={12} sx={{ mb: 0.25 }} />
                <Skeleton variant="text" width="45%" height={11} />
              </Box>
              <Skeleton variant="text" width={64} height={12} />
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
          {/* Spend KPIs: today first, month-to-date second. */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 2,
              mb: 1.25,
              minWidth: 0,
            }}
          >
            <InlineStat
              label="Today spent"
              tone="accent"
              value={statValue(usageLoading, viewState.usageUnavailable, fmtUsd(todaySpend))}
              hint={statHint(usageLoading, viewState.usageUnavailable, todayHint)}
              title={usageLoading || viewState.usageUnavailable ? undefined : 'Spend since local midnight'}
            />
            <Box sx={{ width: '1px', bgcolor: 'divider', flexShrink: 0 }} />
            <InlineStat
              label="Month to date"
              value={statValue(usageLoading, viewState.usageUnavailable, fmtUsd(mtdSpend))}
              hint={statHint(usageLoading, viewState.usageUnavailable, mtdCaption())}
              title={usageLoading || viewState.usageUnavailable ? undefined : 'Spend from the 1st of this month'}
            />
          </Box>

          {/* One row per enforcement level, hairline-separated. */}
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
            {gauges.map((gauge, i) => (
              <Box
                key={gauge.kind}
                sx={i === 0 ? undefined : { borderTop: '1px solid', borderColor: 'divider' }}
              >
                <LevelRow gauge={gauge} size={gaugeSize} keysHref={keysTabHref} />
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 1.25 }}>
            <SpendStrip
              data={dailySpend}
              mtdSpend={mtdSpend}
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
