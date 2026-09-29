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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import { ExpandMore } from '@mui/icons-material';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { useApi } from '@backstage/core-plugin-api';
import { Link } from '@backstage/core-components';
import { useLiteLLMProfile } from '../hooks/useLiteLLMProfile';
import { liteLlmApiRef } from '../api';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { fmtUsd, fmtInt } from '../format';
import { monthToDateRange } from '../dates';
import { Gauge, StatusPill, ChartTooltip, SERIES, fmtCompact } from './ui';
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

/** Preset action-bar buttons. `label` overrides the default copy. */
export type BudgetCtaKind = 'new-key' | 'module' | 'all-limits';
export interface BudgetCtaSpec {
  kind: BudgetCtaKind;
  /** Override the default label. */
  label?: string;
}
/** Either a bare kind (`'module'`) or a spec object (`{ kind: 'module' }`). */
export type BudgetCta = BudgetCtaKind | BudgetCtaSpec;

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
   * `['new-key', 'module', 'all-limits']`. Pass `[]` to hide the bar; the
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
  action?: React.ReactNode;
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
  key: { name: 'Key', none: 'No key budget' },
  user: { name: 'User', none: 'No personal budget' },
  team: { name: 'Team', none: 'No team budget' },
};

const DEFAULT_CTAS: BudgetCtaKind[] = ['new-key', 'module', 'all-limits'];

const CTA_LABELS: Record<BudgetCtaKind, string> = {
  'new-key': 'Generate New Key',
  module: 'Open module',
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

const LevelGauge: React.FC<{ gauge: BudgetGauge; size: number; keysHref?: string }> = ({
  gauge,
  size,
  keysHref,
}) => {
  const { name, none } = LEVEL[gauge.kind];
  const limit = gauge.limit;
  const tone = limit ? budgetTone(limit.pct) : 'neutral';
  const extra = gauge.kind === 'key' ? Math.max(0, gauge.count - 1) : 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 0,
        flex: 1,
      }}
    >
      <Gauge
        value={limit?.pct ?? 0}
        tone={tone}
        size={size}
        label={limit ? `${Math.round(limit.pct)}%` : '—'}
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

interface DailyTokens {
  date: string;
  input: number;
  output: number;
}

/**
 * Fourth column of the budget card: a sparkline of daily token usage
 * (stacked input/output) frozen to month-to-date, with the MTD token total
 * underneath. Same column width and label language as the gauges so the
 * four-column row stays aligned.
 */
const UsageMiniChart: React.FC<{
  data: DailyTokens[];
  totalTokens: number;
  loading: boolean;
  height: number;
}> = ({ data, totalTokens, loading, height }) => {
  const renderPlot = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="100%">
          <CircularProgress size={20} />
        </Box>
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
          <Tooltip content={<ChartTooltip valueFormatter={fmtInt} />} />
          <Area
            type="monotone"
            dataKey="input"
            name="Input"
            stackId="tok"
            stroke={SERIES.input}
            strokeWidth={1.5}
            fill={SERIES.input}
            fillOpacity={0.25}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="output"
            name="Output"
            stackId="tok"
            stroke={SERIES.output}
            strokeWidth={1.5}
            fill={SERIES.output}
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
    if (data.length === 0) {
      return (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.25, fontSize: 10.5, textAlign: 'center' }}
        >
          No usage this month
        </Typography>
      );
    }
    return (
      <>
        <Typography
          variant="caption"
          title={`${fmtInt(totalTokens)} tokens month to date`}
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
          {fmtCompact(totalTokens)} tokens
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
        flex: 1,
      }}
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
        Usage
      </Typography>
      {renderCaption()}
    </Box>
  );
};

export const LiteLLMBudgetGauges: React.FC<LiteLLMBudgetGaugesProps> = ({
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
  const moduleRouteRef = useRouteRef(rootRouteRef);
  const moduleHref = propModuleHref ?? moduleRouteRef?.();
  const { userInfo: hookUserInfo, teams: hookTeams, keys: hookKeys, loading: profileLoading, error: profileError } = useLiteLLMProfile();
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [dailyTokens, setDailyTokens] = useState<DailyTokens[]>([]);
  const [mtdTokens, setMtdTokens] = useState(0);

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
        setDailyTokens(
          daily.map(d => ({
            date: d.date,
            input: d.prompt_tokens,
            output: d.completion_tokens,
          })),
        );
        setMtdTokens(usageResult.total_tokens ?? 0);
        setUsageLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setUsageError(err?.message ?? 'Failed to load usage data');
          setDailyTokens([]);
          setMtdTokens(0);
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

  const summaryText =
    headline.count === 0
      ? 'no limits apply'
      : `${headline.count} limit${headline.count === 1 ? '' : 's'}`;

  const resolvedCtas = useMemo<(BudgetCtaSpec & { kind: BudgetCtaKind })[]>(() => {
    const list = ctas ?? DEFAULT_CTAS;
    return list
      .map(cta => (typeof cta === 'string' ? { kind: cta } : cta))
      .filter(cta => cta.kind !== 'all-limits' || headline.count > 0);
  }, [ctas, headline.count]);

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
          <Button key={key} size="small" variant="outlined" component={Link} to={moduleHref}>
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
            endIcon={
              <ExpandMore
                sx={{
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: theme => theme.transitions.create('transform'),
                }}
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

  const Wrapper: React.ElementType = bare ? Box : Paper;

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

      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={110}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!loading && error && (
        <Alert severity="error" sx={{ mt: 0.5 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            {gauges.map(gauge => (
              <LevelGauge key={gauge.kind} gauge={gauge} size={size} keysHref={keysTabHref} />
            ))}
            <UsageMiniChart
              data={dailyTokens}
              totalTokens={mtdTokens}
              loading={usageLoading}
              height={size}
            />
          </Box>

          <Collapse in={isExpanded} unmountOnExit>
            <Box
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
          sx={theme => ({
            mt: 2,
            pt: 2,
            borderTop: `1px solid ${theme.palette.divider}`,
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
