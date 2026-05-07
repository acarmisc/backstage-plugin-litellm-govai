import React from 'react';
import {
  Table,
  TableColumn,
  WarningPanel,
} from '@backstage/core-components';
import { Typography, Chip } from '@material-ui/core';
import type { LiteLLMKey } from '../api';

interface Props {
  keys: LiteLLMKey[];
  totalSpend: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString();
}

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return date <= sevenDaysFromNow && date > now;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date < new Date();
}

const columns: TableColumn<LiteLLMKey>[] = [
  {
    title: 'Key Alias',
    field: 'key_alias',
    highlight: true,
  },
  {
    title: 'Spend (USD)',
    field: 'spend',
    render: (row) => formatCurrency(row.spend),
    align: 'right',
  },
  {
    title: 'Models',
    field: 'models',
    render: (row) => (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {row.models.slice(0, 3).map((model) => (
          <Chip key={model} label={model} size="small" />
        ))}
        {row.models.length > 3 && (
          <Chip label={`+${row.models.length - 3}`} size="small" variant="outlined" />
        )}
      </div>
    ),
  },
  {
    title: 'Expires',
    field: 'expires',
    render: (row) => {
      const isExpiredVal = isExpired(row.expires);
      const isExpiring = isExpiringSoon(row.expires);
      return (
        <Typography
          color={isExpiredVal ? 'error' : isExpiring ? 'warning' : undefined}
        >
          {formatDate(row.expires)}
          {isExpiredVal && ' (Expired)'}
          {isExpiring && !isExpiredVal && ' (Expiring soon)'}
        </Typography>
      );
    },
  },
];

export function KeysTable({ keys, totalSpend }: Props) {
  if (keys.length === 0) {
    return (
      <WarningPanel
        title="No API Keys Found"
        message="You don't have any LiteLLM virtual keys. Keys will appear here once generated."
      />
    );
  }

  return (
    <Table
      title={`Virtual Keys (Total: ${formatCurrency(totalSpend)})`}
      options={{ search: false, paging: false }}
      columns={columns}
      data={keys}
    />
  );
}