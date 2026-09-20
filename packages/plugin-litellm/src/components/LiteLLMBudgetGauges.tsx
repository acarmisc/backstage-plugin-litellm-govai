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
 */
import React, { useEffect, useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { useApi } from '@backstage/core-plugin-api';
import { Link } from '@backstage/core-components';
import { liteLlmApiRef } from '../api';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { fmtUsd } from '../format';
import { Gauge, StatusPill } from './ui';
import {
  buildBudgetGauges,
  buildBudgetSummary,
  budgetHeadline,
  BudgetGauge,
  BudgetLimit,
  budgetTone,
  fmtBudgetDuration,
} from '../budget';

export interface LiteLLMBudgetGaugesProps {
  /** Optional title override. Defaults to 'Budget'. */
  title?: string;
  /** Ring diameter in px. Defaults to 72. */
  size?: number;
  /** Where the "+N more" key link points. Defaults to the Keys tab. */
  keysHref?: string;
  /**
   * Node rendered at the card bottom, below a divider — e.g. a "create key"
   * button.
   */
  action?: React.ReactNode;
}

/** Where "see all keys" points; `LiteLLMPage` reads `?tab=` to open it. */
const DEFAULT_KEYS_HREF = '/litellm?tab=keys';

/** One-word level names, and the note shown when the level has no cap. */
const LEVEL: Record<BudgetGauge['kind'], { name: string; none: string }> = {
  key: { name: 'Key', none: 'No key budget' },
  user: { name: 'User', none: 'No personal budget' },
  team: { name: 'Team', none: 'No team budget' },
};

/**
 * Compact USD for the tight gauge caption — drops trailing cents so a
 * "$187.42 / $500" pair fits one ~90px column. Keeps two decimals when they
 * carry information.
 */
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
  keysHref = DEFAULT_KEYS_HREF,
  action,
}) => {
  const api = useApi(liteLlmApiRef);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [keys, setKeys] = useState<VirtualKey[]>([]);

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
  // beyond the full widget's display cap; the count still drives the caption.
  const summary = useMemo(
    () => buildBudgetSummary(user, teams, keys, keys.length),
    [user, teams, keys],
  );
  const gauges = useMemo(() => buildBudgetGauges(summary), [summary]);
  const headline = useMemo(() => budgetHeadline(summary), [summary]);

  const summaryText =
    headline.count === 0
      ? 'no limits apply'
      : `${headline.count} limit${headline.count === 1 ? '' : 's'}`;

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          {gauges.map(gauge => (
            <LevelGauge key={gauge.kind} gauge={gauge} size={size} keysHref={keysHref} />
          ))}
        </Box>
      )}

      {action && (
        <Box
          sx={theme => ({
            mt: 2,
            pt: 2,
            borderTop: `1px solid ${theme.palette.divider}`,
          })}
        >
          {action}
        </Box>
      )}
    </Paper>
  );
};
