/**
 * Condensed budget card for a homepage column: one ring gauge per
 * enforcement level (key → personal → team), each showing the limit nearest
 * its cap. Where the full `LiteLLMBudgetWidget` lists every limit as a
 * spend-vs-cap meter, this trades detail for density — a single row of rings
 * with a label and spend figure under each.
 *
 * Gauges are always rendered in the same order, with an empty ring when the
 * user has no cap at that level, so the card keeps a stable shape as data
 * loads and across users. When a level holds several limits, the ring shows
 * the one closest to its cap and a "+N more" link counts the rest.
 *
 * The bottom action bar is composable: pass any subset of `ctas` — mint a new
 * key, open the LiteLLM module, or expand the full per-limit list in place —
 * in the order you want. `action` remains an escape hatch for a fully custom
 * node; when either is present it renders below a divider.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import { ExpandMore } from '@mui/icons-material';
import { useApi } from '@backstage/core-plugin-api';
import { Link } from '@backstage/core-components';
import { liteLlmApiRef } from '../api';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { fmtUsd } from '../format';
import { Gauge, StatusPill } from './ui';
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

/** The module page; `?tab=` picks the tab and `?generate=1` opens the dialog. */
const MODULE_PATH = '/litellm';

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
  /** Ring diameter in px. Defaults to 72. */
  size?: number;
  /** Where the "+N more" key link points. Defaults to the Keys tab. */
  keysHref?: string;
  /** Where the module CTA points. Defaults to the LiteLLM page. */
  moduleHref?: string;
  /**
   * Called when the "new key" CTA is used. When omitted, the CTA deep-links
   * to the module with `?generate=1`, which opens the generate-key dialog.
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
}

/** One-word level names, and the note shown when the level has no cap. */
const LEVEL: Record<BudgetGauge['kind'], { name: string; none: string }> = {
  key: { name: 'Key', none: 'No key budget' },
  user: { name: 'User', none: 'No personal budget' },
  team: { name: 'Team', none: 'No team budget' },
};

const DEFAULT_CTAS: BudgetCtaKind[] = ['new-key', 'module', 'all-limits'];

const CTA_LABELS: Record<BudgetCtaKind, string> = {
  'new-key': 'New key',
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

const LevelGauge: React.FC<{ gauge: BudgetGauge; size: number; keysHref: string }> = ({
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
          {extra > 0 ? (
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

export const LiteLLMBudgetGauges: React.FC<LiteLLMBudgetGaugesProps> = ({
  title = 'Budget',
  size = 72,
  keysHref,
  moduleHref = MODULE_PATH,
  onCreateKey,
  ctas,
  maxExpandedKeys = 8,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  action,
}) => {
  const api = useApi(liteLlmApiRef);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [keys, setKeys] = useState<VirtualKey[]>([]);

  const isControlled = expanded !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const isExpanded = isControlled ? expanded! : uncontrolledExpanded;

  const toggleExpanded = useCallback(() => {
    const next = !isExpanded;
    if (!isControlled) setUncontrolledExpanded(next);
    onExpandedChange?.(next);
  }, [isControlled, isExpanded, onExpandedChange]);

  const keysTabHref = keysHref ?? `${moduleHref}?tab=keys`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([api.getUserInfo(), api.getTeams(), api.listKeys()]).then(
      ([userResult, teamsResult, keysResult]) => {
        if (cancelled) return;
        if (userResult.status === 'fulfilled') {
          setUser(userResult.value);
        } else {
          setUser(null);
          setError(
            userResult.reason?.message ?? 'Failed to load your LiteLLM profile',
          );
        }
        setTeams(teamsResult.status === 'fulfilled' ? teamsResult.value : []);
        setKeys(keysResult.status === 'fulfilled' ? keysResult.value : []);
        setLoading(false);
      },
    );
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
        return onCreateKey ? (
          <Button key={key} size="small" variant="contained" onClick={onCreateKey}>
            {label}
          </Button>
        ) : (
          <Button
            key={key}
            size="small"
            variant="contained"
            component={Link}
            to={`${moduleHref}?generate=1`}
          >
            {label}
          </Button>
        );
      case 'module':
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

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, minWidth: 0 }}>
        <Typography variant="h6" lineHeight={1.2} sx={{ minWidth: 0, flex: 1 }}>
          {title}
        </Typography>
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
    </Paper>
  );
};
