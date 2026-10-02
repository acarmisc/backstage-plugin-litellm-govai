import '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { ManageTeamDialog, InitialMember } from './ManageTeamDialog';
import { TeamUsage } from './TeamUsage';
import { TeamInfo } from '../types';

afterEach(() => cleanup());

const team: TeamInfo = {
  team_id: 't1',
  team_alias: 'Platform',
  models: ['gold'],
  spend: 1,
  max_budget: 100,
  members_with_roles: [
    { user_id: 'me@example.com', role: 'admin' },
    { user_id: 'peer@example.com', role: 'admin' },
    { user_id: 'dev@example.com', role: 'user' },
  ],
} as TeamInfo;

const catalogApi = {
  getEntities: async () => ({ items: [] }),
  queryEntities: async () => ({ items: [], totalItems: 0, pageInfo: {} }),
};

const renderDialog = () =>
  render(
    <TestTheme>
      <TestApiProvider apis={[[catalogApiRef, catalogApi]]}>
        <ManageTeamDialog
          open
          onClose={() => {}}
          mode="edit"
          team={team}
          allModels={[]}
          onSubmit={async () => {}}
          canManageMembers
          onAddMember={async () => {}}
          onRemoveMember={async () => {}}
          membersOnly
          currentUserId="me@example.com"
          memberManagerRoles={['admin']}
        />
      </TestApiProvider>
    </TestTheme>,
  );

describe('ManageTeamDialog membersOnly', () => {
  test('shows only the members section and a Done action', () => {
    renderDialog();
    assert.ok(screen.getByText('Manage members — Platform'));
    assert.ok(screen.getByText(/Budgets and models are managed by your platform admins/));
    assert.strictEqual(screen.queryByLabelText(/Team Alias/), null);
    assert.strictEqual(screen.queryByLabelText(/Max Budget/), null);
    assert.strictEqual(screen.queryByLabelText(/Max budget in team/), null);
    assert.strictEqual(screen.queryByText('Save', { selector: 'button' }), null);
    assert.ok(screen.getByText('Done', { selector: 'button' }));
  });

  test('disables removing yourself and peer managers, not regular members', () => {
    renderDialog();
    const remove = (id: string) =>
      screen.getByLabelText(`remove ${id}`) as HTMLButtonElement;
    assert.strictEqual(remove('me@example.com').disabled, true);
    assert.strictEqual(remove('peer@example.com').disabled, true);
    assert.strictEqual(remove('dev@example.com').disabled, false);
  });
});

describe('TeamUsage', () => {
  const base = {
    teams: [team],
    loading: false,
    getTeamUsage: () => null,
    getTeamUsageLoading: () => false,
  };

  test('readOnly shows the sync badge instead of Create / Edit', () => {
    render(
      <TestTheme>
        <TeamUsage {...base} readOnly canCreate={false} onCreateTeam={() => {}} />
      </TestTheme>,
    );
    assert.ok(screen.getByText('Synced from identity provider'));
    assert.strictEqual(screen.queryByText('Create Team'), null);
  });

  test('Manage members is shown per team, only where allowed', () => {
    const other = { ...team, team_id: 't2', team_alias: 'Other' } as TeamInfo;
    render(
      <TestTheme>
        <TeamUsage
          {...base}
          teams={[team, other]}
          canManageMembers={t => t.team_id === 't1'}
          onManageMembers={() => {}}
        />
      </TestTheme>,
    );
    assert.strictEqual(screen.getAllByText('Manage members').length, 1);
  });
});

describe('ManageTeamDialog create', () => {
  test('collects initial members and hands them to onSubmit', async () => {
    let submitted: InitialMember[] | undefined;
    render(
      <TestTheme>
        <TestApiProvider apis={[[catalogApiRef, catalogApi]]}>
          <ManageTeamDialog
            open
            onClose={() => {}}
            mode="create"
            allModels={[{ model_name: 'gold' } as any]}
            onSubmit={async (_payload, initialMembers) => {
              submitted = initialMembers;
            }}
            canManageMembers
          />
        </TestApiProvider>
      </TestTheme>,
    );
    assert.ok(screen.getByText('Initial members'));
    fireEvent.change(screen.getByLabelText(/Add member/), {
      target: { value: 'user:default/dev' },
    });
    fireEvent.click(screen.getByText('Add', { selector: 'button' }));
    assert.ok(await screen.findByText('user:default/dev', { selector: 'p' }));

    fireEvent.change(screen.getByLabelText(/Team Alias/), {
      target: { value: 'New team' },
    });
    // Models autocomplete: type and pick the only option.
    const models = screen.getByLabelText(/Models/);
    fireEvent.change(models, { target: { value: 'gold' } });
    fireEvent.keyDown(models, { key: 'ArrowDown' });
    fireEvent.keyDown(models, { key: 'Enter' });

    fireEvent.click(screen.getByText('Create team', { selector: 'button' }));
    await waitFor(() =>
      assert.deepStrictEqual(submitted, [{ userEntityRef: 'user:default/dev' }]),
    );
  });
});
