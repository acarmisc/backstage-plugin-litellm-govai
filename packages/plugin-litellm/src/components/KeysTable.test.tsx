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

const mockBlockedKey: VirtualKey = {
  ...mockKey,
  key: 'sk-...9999',
  token: 'hash-blocked-99999',
  key_alias: 'blocked-alias',
  blocked: true,
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

describe('KeysTable', () => {
  test('renders one row per key with the alias', () => {
    renderTable({ keys: [mockKey, mockBlockedKey] });
    assert.ok(screen.getByText('test-alias'));
    assert.ok(screen.getByText('blocked-alias'));
  });

  test('icon buttons expose accessible names', async () => {
    renderTable({ keys: [mockKey] });
    assert.ok(await screen.findByRole('button', { name: 'Edit key' }));
    assert.ok(await screen.findByRole('button', { name: /^Block key/ }));
    assert.ok(await screen.findByRole('button', { name: 'Revoke key' }));
    assert.ok(await screen.findByRole('button', { name: 'Copy key ID' }));
  });

  test('Block asks for confirmation naming the key and does not fire until confirmed', async () => {
    const blocked: string[] = [];
    renderTable({ keys: [mockKey], onBlockKey: async id => { blocked.push(id); } });

    await userEvent.click(await screen.findByRole('button', { name: /^Block key/ }));

    const d = await dialog();
    assert.ok(d.getByText('Block key?'));
    assert.ok(d.getByText('test-alias'));
    assert.ok(d.getByText(/Integrations using it will fail immediately/));
    assert.deepStrictEqual(blocked, [], 'must not block before confirming');

    await userEvent.click(d.getByRole('button', { name: 'Block' }));
    await waitFor(() => assert.deepStrictEqual(blocked, ['hash-test-12345']));
  });

  test('Cancel in the block dialog closes it without blocking', async () => {
    const blocked: string[] = [];
    renderTable({ keys: [mockKey], onBlockKey: async id => { blocked.push(id); } });

    await userEvent.click(await screen.findByRole('button', { name: /^Block key/ }));
    const d = await dialog();
    await userEvent.click(d.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => assert.strictEqual(dialogIsOpen(), false));
    assert.deepStrictEqual(blocked, []);
  });

  test('Unblock is one click with no dialog', async () => {
    const unblocked: string[] = [];
    renderTable({ keys: [mockBlockedKey], onUnblockKey: async id => { unblocked.push(id); } });

    await userEvent.click(await screen.findByRole('button', { name: 'Unblock key' }));

    await waitFor(() => assert.deepStrictEqual(unblocked, ['hash-blocked-99999']));
    assert.strictEqual(dialogIsOpen(), false);
  });

  test('Revoke dialog names the key with its last four characters', async () => {
    const deleted: string[] = [];
    renderTable({ keys: [mockKey], onDeleteKey: async id => { deleted.push(id); } });

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));

    const d = await dialog();
    const heading = d.getByRole('heading');
    assert.ok(heading.textContent?.includes('test-alias'), heading.textContent ?? '');
    assert.ok(heading.textContent?.includes('sk-…2345'), heading.textContent ?? '');
    assert.deepStrictEqual(deleted, [], 'must not delete before confirming');

    await userEvent.click(d.getByRole('button', { name: /revoke/i }));
    await waitFor(() => assert.deepStrictEqual(deleted, ['hash-test-12345']));
  });
});
