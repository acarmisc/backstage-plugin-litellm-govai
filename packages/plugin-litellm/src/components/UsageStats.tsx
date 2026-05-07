import React from 'react';
import { InfoCard, Progress } from '@backstage/core-components';
import { Typography, Grid } from '@material-ui/core';
import type { LiteLLMDailyActivity } from '../api';

interface Props {
  usage: LiteLLMDailyActivity[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function UsageStats({ usage }: Props) {
  const totalSpend = usage.reduce((sum, day) => sum + day.spend, 0);
  const totalPromptTokens = usage.reduce((sum, day) => sum + day.prompt_tokens, 0);
  const totalCompletionTokens = usage.reduce((sum, day) => sum + day.completion_tokens, 0);
  const totalTokens = totalPromptTokens + totalCompletionTokens;

  return (
    <InfoCard
      title="Usage (Last 7 Days)"
      subvariant="elevated"
    >
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="h6">{formatCurrency(totalSpend)}</Typography>
          <Typography variant="body2" color="textSecondary">Total Spend</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="h6">{formatNumber(totalTokens)}</Typography>
          <Typography variant="body2" color="textSecondary">Total Tokens</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="h6">{formatNumber(totalPromptTokens)}</Typography>
          <Typography variant="body2" color="textSecondary">Prompt Tokens</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="h6">{formatNumber(totalCompletionTokens)}</Typography>
          <Typography variant="body2" color="textSecondary">Completion Tokens</Typography>
        </Grid>
      </Grid>

      <div style={{ marginTop: 24 }}>
        <Typography variant="subtitle2" gutterBottom>Daily Breakdown</Typography>
        <TableSimple usage={usage} />
      </div>
    </InfoCard>
  );
}

function TableSimple({ usage }: { usage: LiteLLMDailyActivity[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Date</th>
          <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' }}>Spend</th>
          <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' }}>Prompt</th>
          <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' }}>Completion</th>
          <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {usage.slice().reverse().map((day) => (
          <tr key={day.date}>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{day.date}</td>
            <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>{formatCurrency(day.spend)}</td>
            <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>{formatNumber(day.prompt_tokens)}</td>
            <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>{formatNumber(day.completion_tokens)}</td>
            <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #eee' }}>{formatNumber(day.total_tokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}