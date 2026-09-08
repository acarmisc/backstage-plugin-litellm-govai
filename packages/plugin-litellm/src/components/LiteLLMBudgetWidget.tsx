/**
 * LiteLLM budget-policy widget. Renders the enforcement hierarchy as a
 * numbered flow — key → personal → team → global — and, against each level
 * the signed-in user actually has a limit on, a live meter showing how close
 * they are to the cap. Intended for at-a-glance use on a homepage card next
 * to `LiteLLMHomeWidget`, but works anywhere.
 *
 * The policy text mirrors the LiteLLM proxy behaviour:
 *   - every request is checked against stacked limits, in order;
 *   - a key bound to a team is capped by the team budgets, not the owner's
 *     personal budget;
 *   - a limit with a `budget_duration` resets its spend when the window
 *     closes; without one it never resets.
 *
 * Two knobs shrink it for use as a secondary column:
 *   - `compact` drops the numbered rail and the policy footnote, showing
 *     only the limits the user actually has as a tight tagged meter list;
 *   - `collapsible` folds the body under a one-line summary header.
 * `action` renders a host-supplied node (e.g. a button) pinned to the card
 * bottom, always visible.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import { ExpandMore } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useApi } from '@backstage/core-plugin-api';
import { liteLlmApiRef } from '../api';
import { UserInfo, TeamInfo, VirtualKey } from '../types';
import { fmtUsd } from '../format';
import { Meter, StatusPill, Tone } from './ui';
import {
  buildBudgetSummary,
  budgetHeadline,
  BudgetLimit,
  BudgetSummary,
  budgetTone,
  fmtBudgetDuration,
} from '../budget';

export interface LiteLLMBudgetWidgetProps {
  /** Optional title override. Defaults to 'Budget Policy'. */
  title?: string;
  /** Max key budgets to show, closest to the cap first. Defaults to 3. */
  maxKeys?: number;
  /**
   * Drop the numbered key→personal→team→global rail and the policy
   * footnote; show only the limits the user actually has. Defaults to false.
   */
  compact?: boolean;
  /** Fold the body under a clickable one-line summary header. Defaults to false. */
  collapsible?: boolean;
  /** Initial expanded state when `collapsible`. Defaults to true. */
  defaultExpanded?: boolean;
  /**
   * Node rendered at the card bottom, below a divider and outside the
   * collapsible region so it stays visible when collapsed — e.g. a
   * "create key" button.
   */
  action?: React.ReactNode;
}

interface LevelFrameProps {
  rank: number;
  name: string;
  tagline: string;
  note?: string;
  tone?: Tone;
  isLast?: boolean;
  children: React.ReactNode;
}

function levelToneColor(tone: Tone | undefined, theme: any): string {
  switch (tone) {
    case 'success': return theme.palette.success.main;
    case 'warning': return theme.palette.warning.main;
    case 'danger': return theme.palette.error.main;
    case 'info': return theme.palette.info.main;
    default: return theme.palette.primary.main;
  }
}

const LevelFrame: React.FC<LevelFrameProps> = ({
  rank,
  name,
  tagline,
  note,
  tone,
  isLast,
  children,
}) => (
  <Box sx={{ display: 'flex', gap: 1.5 }}>
    {/* Left rail: rank badge + connector to the next level. */}
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 26, flexShrink: 0 }}>
      <Box
        sx={theme => ({
          width: 26,
          height: 26,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(levelToneColor(tone, theme), 0.14),
          color: levelToneColor(tone, theme),
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        })}
      >
        {rank}
      </Box>
      <Box
        sx={theme => ({
          flex: 1,
          width: 2,
          minHeight: 14,
          bgcolor: isLast ? 'transparent' : alpha(theme.palette.text.primary, 0.12),
        })}
      />
    </Box>

    <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
        <Typography
          sx={theme => ({
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: levelToneColor(tone, theme),
          })}
        >
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11.5 }}>
          {tagline}
        </Typography>
        {note && <StatusPill label={note} tone="neutral" dot={false} sx={{ ml: 'auto' }} />}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
    </Box>
  </Box>
);

const EmptyLimitCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Paper
    variant="outlined"
    sx={theme => ({
      px: 1.5,
      py: 1.25,
      borderRadius: 1.5,
      bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.03 : 0.015),
    })}
  >
    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
      {children}
    </Typography>
  </Paper>
);

const LimitCard: React.FC<{ limit: BudgetLimit }> = ({ limit }) => {
  const tone = budgetTone(limit.pct);
  const pct = Math.round(limit.pct);
  const closeTo = limit.softLimit !== undefined && limit.spend >= limit.softLimit;
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 1.25, borderRadius: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={limit.sublabel ? `${limit.label} · ${limit.sublabel}` : limit.label}
          >
            {limit.label}
          </Typography>
          {limit.sublabel && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: 10.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {limit.sublabel}
            </Typography>
          )}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmtUsd(limit.spend)}
          <Box component="span" color="text.secondary" sx={{ fontWeight: 400 }}>
            {' / '}
            {fmtUsd(limit.budget)}
          </Box>
        </Typography>
      </Box>
      <Box sx={{ mt: 1 }}>
        <Meter value={limit.pct} tone={tone} height={6} />
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          mt: 0.75,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {pct}% of budget
          {closeTo && ` · soft-limit warning`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {fmtBudgetDuration(limit.budgetDuration)
            ? `resets ${fmtBudgetDuration(limit.budgetDuration)}`
            : 'never resets'}
        </Typography>
      </Box>
    </Paper>
  );
};

/** How each enforcement level reads in the collapsed summary line. */
const CLOSEST_LEVEL_LABEL: Record<BudgetLimit['kind'], string> = {
  key: 'key',
  user: 'personal',
  team: 'team',
};

/** A LimitCard prefixed with a small KEY / USER / TEAM tag — used in compact mode. */
const TaggedLimit: React.FC<{ limit: BudgetLimit }> = ({ limit }) => {
  const tone = budgetTone(limit.pct);
  return (
    <Box>
      <Typography
        sx={theme => ({
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color:
            tone === 'accent'
              ? theme.palette.text.secondary
              : levelToneColor(tone, theme),
          mb: 0.5,
        })}
      >
        {limit.kind}
      </Typography>
      <LimitCard limit={limit} />
    </Box>
  );
};

/** Full body: the numbered key→personal→team→global rail plus the policy footnote. */
const FullBody: React.FC<{ summary: BudgetSummary }> = ({ summary }) => {
  const hasBudgetedKeys = summary.keys.length + summary.hiddenBudgetedKeys > 0;
  return (
    <>
      <LevelFrame
        rank={1}
        name="Key"
        tagline="per-key cap · highest priority"
        note={hasBudgetedKeys ? undefined : 'no key budgets set'}
      >
        {!hasBudgetedKeys && (
          <EmptyLimitCard>No key has a budget, so no key-level cap applies.</EmptyLimitCard>
        )}
        {summary.keys.map(k => (
          <LimitCard key={k.sublabel ?? k.label} limit={k} />
        ))}
        {summary.hiddenBudgetedKeys > 0 && (
          <Typography variant="caption" color="text.secondary">
            +{summary.hiddenBudgetedKeys} more budgeted
            key{summary.hiddenBudgetedKeys > 1 ? 's' : ''} further from the cap
          </Typography>
        )}
      </LevelFrame>

      <LevelFrame
        rank={2}
        name="User"
        tagline="cap on everything you spend with your own keys"
        note="skipped for team-bound keys"
      >
        {summary.user ? (
          <LimitCard limit={summary.user} />
        ) : (
          <EmptyLimitCard>No personal budget is set on your account.</EmptyLimitCard>
        )}
      </LevelFrame>

      <LevelFrame rank={3} name="Team" tagline="shared cap for all keys in a team (if any)">
        {summary.teams.length > 0
          ? summary.teams.map(t => (
              <LimitCard key={t.sublabel ?? t.label} limit={t} />
            ))
          : (
            <EmptyLimitCard>No team you belong to has a budget.</EmptyLimitCard>
          )}
      </LevelFrame>

      <LevelFrame rank={4} name="Global" tagline="proxy-wide cap set by your admin" isLast>
        <EmptyLimitCard>
          Configured by your admin in the proxy config — it isn't visible from this page. When
          set, it limits spend across every request on the proxy.
        </EmptyLimitCard>
      </LevelFrame>

      <Box
        sx={theme => ({
          mt: 2,
          px: 1.5,
          py: 1.25,
          borderRadius: 1.5,
          border: '1px dashed',
          borderColor: alpha(theme.palette.text.primary, 0.18),
        })}
      >
        <Typography variant="caption" color="text.secondary" display="block">
          The first cap a request runs into is the one that stops it. A limit with a reset
          window (e.g. daily or every 30 days) clears its spend to $0 when the window closes;
          without a window it never resets.
        </Typography>
      </Box>
    </>
  );
};

/** Compact body: only the limits the user actually has, as a tagged meter list. */
const CompactBody: React.FC<{ summary: BudgetSummary }> = ({ summary }) => {
  const { count } = budgetHeadline(summary);
  if (count === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
        No budget limits apply to you right now.
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {summary.keys.map(k => (
        <TaggedLimit key={k.sublabel ?? k.label} limit={k} />
      ))}
      {summary.hiddenBudgetedKeys > 0 && (
        <Typography variant="caption" color="text.secondary">
          +{summary.hiddenBudgetedKeys} more budgeted
          key{summary.hiddenBudgetedKeys > 1 ? 's' : ''} further from the cap
        </Typography>
      )}
      {summary.user && <TaggedLimit limit={summary.user} />}
      {summary.teams.map(t => (
        <TaggedLimit key={t.sublabel ?? t.label} limit={t} />
      ))}
    </Box>
  );
};

export const LiteLLMBudgetWidget: React.FC<LiteLLMBudgetWidgetProps> = ({
  title = 'Budget Policy',
  maxKeys = 3,
  compact = false,
  collapsible = false,
  defaultExpanded = true,
  action,
}) => {
  const api = useApi(liteLlmApiRef);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [keys, setKeys] = useState<VirtualKey[]>([]);
  const [expanded, setExpanded] = useState(defaultExpanded);

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

  const summary = useMemo(
    () => buildBudgetSummary(user, teams, keys, maxKeys),
    [user, teams, keys, maxKeys],
  );
  const headline = useMemo(() => budgetHeadline(summary), [summary]);

  const limitsWord = `${headline.count} limit${headline.count === 1 ? '' : 's'}`;
  const closestWord =
    headline.closest === null
      ? ''
      : ` · closest: ${CLOSEST_LEVEL_LABEL[headline.closest.kind]} ${Math.round(
          headline.closest.pct,
        )}%`;
  const summaryText =
    headline.count === 0 ? 'no limits apply' : `${limitsWord}${closestWord}`;

  const body = (
    <>
      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={140}>
          <CircularProgress size={32} />
        </Box>
      )}

      {!loading && error && (
        <Alert severity="error" sx={{ mt: 0.5 }}>
          {error}
        </Alert>
      )}

      {!loading && !error &&
        (compact ? <CompactBody summary={summary} /> : <FullBody summary={summary} />)}
    </>
  );

  return (
    <Paper sx={{ p: 2 }}>
      {collapsible ? (
        <Box
          onClick={() => setExpanded(e => !e)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            userSelect: 'none',
            mb: expanded ? 1.5 : 0,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" lineHeight={1.2}>{title}</Typography>
            {!loading && !error && (
              <Box sx={{ mt: 0.5 }}>
                <StatusPill
                  label={summaryText}
                  tone={budgetTone(headline.closest?.pct ?? 0)}
                />
              </Box>
            )}
          </Box>
          <IconButton
            size="small"
            aria-label={expanded ? 'Collapse budget policy' : 'Expand budget policy'}
            aria-expanded={expanded}
            onClick={e => {
              e.stopPropagation();
              setExpanded(x => !x);
            }}
            sx={theme => ({
              color: theme.palette.text.secondary,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: theme.transitions.create('transform'),
            })}
          >
            <ExpandMore />
          </IconButton>
        </Box>
      ) : (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="h6" lineHeight={1.2}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            How LiteLLM caps spend — and where you stand right now
          </Typography>
        </Box>
      )}

      {collapsible ? (
        <Collapse in={expanded} unmountOnExit>
          {body}
        </Collapse>
      ) : (
        body
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
