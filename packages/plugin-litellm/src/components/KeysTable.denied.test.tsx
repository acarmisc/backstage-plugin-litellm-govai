import { fakeAlertApi } from '../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { render, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { KeysTable } from './KeysTable';
import { VirtualKey } from '../types';

afterEach(() => cleanup());

const mockKey: VirtualKey = {
  key: 'sk-...2345',
  token: 'hash-test-12345',
  key_alias: 'test-alias',
  created_at: '2026-09-01T00:00:00Z',
  expires_at: '2026-12-01T00:00:00Z',
  spend: 10,
  max_budget: 100,
  tpm_limit: 10000,
  rpm_limit: 100,
  models: ['gpt-4'],
  blocked: false,
  team_id: 'team-1',
};

type Props = React.ComponentProps<typeof KeysTable>;

const renderTable = (
  overrides: Partial<Props> = {},
  permission: 'ALLOW' | 'DENY' = 'ALLOW',
) => {
  const props: Props = {
    keys: [],
    loading: false,
    onGenerateKeyClick: () => {},
    onEditKey: () => {},
    onBlockKey: async () => {},
    onUnblockKey: async () => {},
    onDeleteKey: async () => {},
    onPruneExpiredKeys: async () => ({ pruned: 0, failed: 0 }),
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <TestApiProvider
        apis={[
          [alertApiRef, fakeAlertApi],
          [permissionApiRef, mockApis.permission({ authorize: permission })],
        ]}
      >
        <KeysTable {...props} />
      </TestApiProvider>
    </MemoryRouter>,
  );
};

// `queryByRole` recomputes styles for every node and is pathologically slow on
// MUI's DOM in jsdom, so check for an open dialog directly.
const dialogIsOpen = () => document.querySelector('[role="dialog"]') !== null;

const dialog = async () => within(await screen.findByRole('dialog'));

// Kept in its own file: `usePermission` caches decisions in SWR's process-wide
// cache, and node --test gives every file a fresh process, so a DENY policy
// can't be polluted by (or leak into) the ALLOW tests in KeysTable.test.tsx.
describe('KeysTable without permission', () => {
  test('without permission the action buttons are disabled and say why', async () => {
    renderTable({ keys: [mockKey] }, 'DENY');

    // Role-name queries are slow on MUI's DOM in jsdom and the permission
    // check resolves asynchronously, so allow a generous timeout.
    for (const name of [
      'No permission to edit keys',
      'No permission to block keys',
      'No permission to revoke keys',
    ]) {
      const button = await screen.findByLabelText(name, {}, { timeout: 5000 });
      assert.strictEqual((button as HTMLButtonElement).disabled, true, name);
    }
  });
});
