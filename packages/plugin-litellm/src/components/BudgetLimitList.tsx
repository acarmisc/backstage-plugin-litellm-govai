/**
 * Shared budget-limit presentation used by both budget cards: the
 * `LiteLLMBudgetWidget` (full/compact meter list) and the condensed
 * `LiteLLMBudgetGauges` (expanded "all limits" view). Keeping the card in one
 * place means a limit reads identically wherever it is shown.
 */
import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { Link } from '@backstage/core-components';
import { BudgetLimit, fmtBudgetDuration, budgetTone } from '../budget';
import { fmtUsd } from '../format';
import { Meter, Tone } from './ui';

/** Semantic colour for a tone, from the host theme. */
export function levelToneColor(tone: Tone | undefined, theme: Theme): string {
  switch (tone) {
    case 'success': return theme.palette.success.main;
    case 'warning': return theme.palette.warning.main;
    case 'danger': return theme.palette.error.main;
    case 'info': return theme.palette.info.main;
    default: return theme.palette.primary.main;
  }
}

/** Spend-vs-cap meter card for a single limit. */
export const LimitCard: React.FC<{ limit: BudgetLimit }> = ({ limit }) => {
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
        {limit.hidden ? (
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {pct}% used
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {fmtUsd(limit.spend)}
            <Box component="span" color="text.secondary" sx={{ fontWeight: 400 }}>
              {' / '}
              {fmtUsd(limit.budget)}
            </Box>
          </Typography>
        )}
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
          {limit.hidden ? (
            <>Hidden by admin</>
          ) : (
            <>{pct}% of budget{closeTo && ` · soft-limit warning`}</>
          )}
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

/** A LimitCard prefixed with a small KEY / USER / TEAM tag. */
export const TaggedLimit: React.FC<{ limit: BudgetLimit }> = ({ limit }) => {
  const theme = useTheme();
  const tone = budgetTone(limit.pct);
  return (
    <Box>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: tone === 'accent' ? theme.palette.text.secondary : levelToneColor(tone, theme),
          mb: 0.5,
        }}
      >
        {limit.kind}
      </Typography>
      <LimitCard limit={limit} />
    </Box>
  );
};

/** A key-budget note under a limit list — plain text when no href is given. */
export const MoreKeysNote: React.FC<{ count: number; href?: string; label?: string }> = ({
  count,
  href,
  label,
}) => {
  const text = label ?? `+${count} more budgeted key${count > 1 ? 's' : ''} further from the cap`;
  if (!href) {
    return (
      <Typography variant="caption" color="text.secondary">
        {text}
      </Typography>
    );
  }
  return (
    <Link to={href} variant="caption">
      {text} →
    </Link>
  );
};

/**
 * Flat list of concrete limits across every level, as tagged meter cards.
 * Used by the condensed gauges card's expanded view; the full widget renders
 * its own grouped-by-level rail instead.
 */
export const BudgetLimitList: React.FC<{
  limits: BudgetLimit[];
  /** Keys beyond the supplied limits — rendered as a trailing note. */
  hiddenKeyCount?: number;
  keysHref?: string;
}> = ({ limits, hiddenKeyCount = 0, keysHref }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
    {limits.map(limit => (
      <TaggedLimit key={`${limit.kind}:${limit.sublabel ?? limit.label}`} limit={limit} />
    ))}
    {hiddenKeyCount > 0 && <MoreKeysNote count={hiddenKeyCount} href={keysHref} />}
  </Box>
);

/** Inset panel used to hold a nested list of limits inside a card. */
export const LimitListPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={theme => ({
      px: 1.5,
      py: 1.5,
      borderRadius: 1.5,
      bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.03 : 0.02),
    })}
  >
    {children}
  </Box>
);
