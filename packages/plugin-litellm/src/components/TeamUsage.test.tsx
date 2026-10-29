import '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { TeamUsage } from './TeamUsage';
import { TeamInfo } from '../types';

afterEach(() => cleanup());

const team: TeamInfo = { team_id: 't1', team_alias: 'abstrid', spend: 0 } as TeamInfo;

const renderCard = (over: { memberUsageFailed?: boolean }) =>
  render(
    <TestTheme>
      <TeamUsage
        teams={[team]}
        loading={false}
        getTeamUsage={() => null}
        getTeamUsageLoading={() => false}
        getTeamMemberUsage={() => null}
        getTeamMemberUsageFailed={() => over.memberUsageFailed ?? false}
        getTeamKeyUsage={() => null}
        getTeamKeyUsageFailed={() => false}
      />
    </TestTheme>,
  );

describe('TeamUsage per-member breakdown errors', () => {
  test('shows a caption when the breakdown failed for a non-refusal reason', () => {
    renderCard({ memberUsageFailed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Show team details' }));
    assert.ok(screen.getByText('Could not load per-member usage'));
  });

  test('hides the section silently when the caller is refused', () => {
    renderCard({ memberUsageFailed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Show team details' }));
    assert.strictEqual(screen.queryByText('Could not load per-member usage'), null);
    assert.strictEqual(screen.queryByText('Usage by member'), null);
  });
});
