import '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen, within } from '@testing-library/react';
import { TeamKeyUsageTable } from './TeamUsage';
import { TeamKeyUsage, TeamKeyUsageRow } from '../types';

afterEach(() => cleanup());

const row = (over: Partial<TeamKeyUsageRow>): TeamKeyUsageRow => ({
  key: 'sk-...0000',
  user_id: 'x',
  created_at: '2026-01-02T00:00:00Z',
  blocked: false,
  spend: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  api_requests: 0,
  successful_requests: 0,
  failed_requests: 0,
  ...over,
});

const usage: TeamKeyUsage = {
  team_id: 't1',
  keys: [
    row({ key: 'sk-...aaaa', key_alias: 'alice-dev', user_id: 'alice', display_name: 'Alice A.', spend: 7.5, max_budget: 50, api_requests: 10 }),
    row({ key: 'sk-...bbbb', user_id: 'bob', blocked: true }),
  ],
};

const renderTable = (u: TeamKeyUsage) =>
  render(
    <TestTheme>
      <TeamKeyUsageTable usage={u} />
    </TestTheme>,
  );

describe('TeamKeyUsageTable', () => {
  test('shows alias, owner, status, spend and budget per key', () => {
    renderTable(usage);
    const table = screen.getByRole('table', { name: 'Keys by member' });
    const alice = within(table).getByText('alice-dev').closest('tr')!;
    assert.ok(within(alice).getByText('sk-...aaaa'));
    assert.ok(within(alice).getByText('Alice A.'));
    assert.ok(within(alice).getByText('Active'));
    assert.ok(within(alice).getByText('$7.50'));
    assert.ok(within(alice).getByText('$50.00'));
    const bob = within(table).getByText('sk-...bbbb').closest('tr')!;
    assert.ok(within(bob).getByText('Blocked'));
    assert.ok(within(bob).getByText('Unlimited'));
  });

  test('drops the dollar columns when hidden', () => {
    renderTable({ ...usage, budget_hidden: true });
    assert.strictEqual(screen.queryByText('Spend'), null);
    assert.strictEqual(screen.queryByText('Budget'), null);
    assert.ok(screen.getByText('Tokens'));
  });

  test('says so when the team has no keys', () => {
    renderTable({ team_id: 't1', keys: [] });
    assert.ok(screen.getByText('This team has no keys.'));
  });
});
