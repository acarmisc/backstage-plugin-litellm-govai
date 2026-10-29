import '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen, within } from '@testing-library/react';
import { MemberUsageCards } from './TeamUsage';
import { TeamMemberUsage, TeamMemberUsageRow } from '../types';

afterEach(() => cleanup());

const row = (over: Partial<TeamMemberUsageRow>): TeamMemberUsageRow => ({
  user_id: 'x',
  spend: 0,
  spend_share_pct: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  api_requests: 0,
  successful_requests: 0,
  failed_requests: 0,
  success_rate: null,
  key_count: 0,
  ...over,
});

const usage: TeamMemberUsage = {
  team_id: 't1',
  total_spend: 10,
  members: [
    row({ user_id: 'alice', user_email: 'alice@corp.it', display_name: 'Alice A.', spend: 7.5, spend_share_pct: 75, api_requests: 10, success_rate: 90, key_count: 2 }),
    row({ user_id: null, spend: 2.5, spend_share_pct: 25 }),
    row({ user_id: 'bob@corp.it', user_email: 'bob@corp.it' }),
  ],
};

const renderTable = (u: TeamMemberUsage) =>
  render(
    <TestTheme>
      <MemberUsageCards usage={u} />
    </TestTheme>,
  );

describe('MemberUsageCards', () => {
  test('shows each member with spend, share and success rate', () => {
    renderTable(usage);
    const table = screen.getByRole('list', { name: 'Usage by member' });
    const alice = within(table).getByText('Alice A.').closest('[role=listitem]') as HTMLElement;
    assert.ok(within(alice).getByText('alice@corp.it'));
    assert.ok(within(alice).getByText('$7.50'));
    assert.ok(within(alice).getByText('75% of team'));
    assert.ok(within(alice).getByText('90%'));
    assert.ok(within(table).getByText('Unattributed'));
    // An email id is shown once, not repeated as a subtitle.
    assert.strictEqual(within(table).getAllByText('bob@corp.it').length, 1);
  });

  test('shows team average per member', () => {
    renderTable(usage);
    assert.ok(screen.getByText('Team spend $10.00 · avg $5.00 per member'));
  });

  test('drops the spend column when dollars are hidden', () => {
    renderTable({
      ...usage,
      budget_hidden: true,
      total_spend: 0,
      members: usage.members.map(m => ({ ...m, spend: 0 })),
    });
    assert.strictEqual(screen.queryByText('$0.00'), null);
    assert.strictEqual(screen.queryByText(/avg/), null);
    assert.ok(screen.getByText('75%'));
  });

  test('says so when there is nothing to show', () => {
    renderTable({ team_id: 't1', total_spend: 0, members: [] });
    assert.ok(screen.getByText('No members or activity in this period.'));
  });
});
