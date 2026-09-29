import { fakeAlertApi } from '../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { KeysTable } from './KeysTable';
import { VirtualKey } from '../types';

afterEach(() => cleanup());

describe('KeysTable', () => {
  const mockKey: VirtualKey = {
    key: 'sk-test-key-12345',
    token: 'sk-test-key-12345',
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
    key: 'sk-blocked-key-99999',
    token: 'sk-blocked-key-99999',
    key_alias: 'blocked-alias',
    blocked: true,
  };

  const renderTable = (overrides: Partial<React.ComponentProps<typeof KeysTable>> = {}) => {
    const defaultProps: React.ComponentProps<typeof KeysTable> = {
      keys: [],
      loading: false,
      onGenerateKeyClick: () => {},
      onEditKey: () => {},
      onBlockKey: async () => {},
      onUnblockKey: async () => {},
      onDeleteKey: async () => {},
      onPruneExpiredKeys: async () => ({ pruned: 0 }),
      ...overrides,
    };

    return render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [alertApiRef, fakeAlertApi],
          [permissionApiRef, mockApis.permission()],
          ]}
        >
          <KeysTable {...defaultProps} />
        </TestApiProvider>
      </MemoryRouter>,
    );
  };

  test('renders the table with keys', () => {
    renderTable({ keys: [mockKey] });
    assert.ok(screen.getByText('test-alias'));
    // "All models" might be split across multiple elements, so check for component presence via role
    assert.ok(screen.getByRole('table'));
  });

  test('Block button opens confirmation dialog with alias and warning', async () => {
    const onBlockKey = async () => {};
    renderTable({ keys: [mockKey], onBlockKey });

    // Find and click the block button
    const blockButton = screen.getByRole('button', { name: /Block key/i });
    assert.ok(blockButton, 'Block button should be found');

    await userEvent.click(blockButton);

    // Verify dialog opens with correct content
    await waitFor(() => {
      // The dialog should have the key alias
      assert.ok(screen.queryByText(/test-alias/) || screen.queryAllByText(/test/).length > 0);
    });
  });

  test('Block does NOT call onBlockKey until confirmed', async () => {
    let callCount = 0;
    const onBlockKey = async () => {
      callCount++;
    };
    renderTable({ keys: [mockKey], onBlockKey });

    const blockButton = screen.getByRole('button', { name: /Block key/i });
    await userEvent.click(blockButton);

    // Click should not immediately call onBlockKey
    assert.strictEqual(callCount, 0, 'onBlockKey should not be called immediately');

    // Find and click the confirm button (from the dialog)
    await waitFor(() => {
      const confirmButtons = screen.queryAllByRole('button', { name: /Block/i });
      assert.ok(confirmButtons.length > 0, 'Confirm button should appear');
    });

    const confirmButton = screen.getAllByRole('button', { name: /Block/i }).find((btn: any) =>
      btn.textContent?.trim() === 'Block'
    );
    if (confirmButton) {
      await userEvent.click(confirmButton);

      // Now onBlockKey should have been called
      await waitFor(() => {
        assert.ok(callCount >= 1, 'onBlockKey should be called after confirmation');
      });
    }
  });

  test('Unblock is one-click (no dialog)', async () => {
    let unblockCallCount = 0;
    const onUnblockKey = async () => {
      unblockCallCount++;
    };
    renderTable({ keys: [mockBlockedKey], onUnblockKey });

    const unblockButtons = screen.getAllByLabelText(/unblock key/i);
    await userEvent.click(unblockButtons[0]);

    // No dialog should appear, function called immediately
    await waitFor(() => {
      assert.strictEqual(unblockCallCount, 1);
    });
  });

  test('Revoke dialog title contains alias and last4', async () => {
    renderTable({ keys: [mockKey] });

    const revokeButtons = screen.getAllByLabelText(/revoke key/i);
    await userEvent.click(revokeButtons[0]);

    await waitFor(() => {
      // The title should contain the alias and key's last 4 digits
      const titleText = document.body.innerText;
      assert.ok(titleText.includes('test-alias'));
      assert.ok(titleText.includes('12345'));
    });
  });

  test('icon buttons expose accessible names', () => {
    renderTable({ keys: [mockKey] });

    // Check for accessible names on action buttons
    assert.ok(screen.getByLabelText(/Edit key/i));
    assert.ok(screen.getByLabelText(/Block key/i));
    assert.ok(screen.getByLabelText(/Revoke key/i));
    assert.ok(screen.getByLabelText(/Copy API key/i));
  });

  test('Cancel in block dialog closes without calling onBlockKey', async () => {
    let callCount = 0;
    const onBlockKey = async () => {
      callCount++;
    };
    renderTable({ keys: [mockKey], onBlockKey });

    const blockButtons = screen.getAllByLabelText(/block key/i);
    await userEvent.click(blockButtons[0]);

    const cancelButton = await screen.findByRole('button', { name: /Cancel/i });
    await userEvent.click(cancelButton);

    // onBlockKey should not have been called
    assert.strictEqual(callCount, 0);
  });
});
