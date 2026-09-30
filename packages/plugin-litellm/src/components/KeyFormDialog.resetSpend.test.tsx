import { fakeAlertApi } from '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { KeyFormDialog } from './KeyFormDialog';
import { VirtualKey, LiteLlmConfig } from '../types';

afterEach(() => cleanup());

const keyToEdit: VirtualKey = {
  key: 'sk-...2345',
  token: 'hash-12345',
  key_alias: 'my-key',
  created_at: '2026-09-01T00:00:00Z',
  spend: 42,
  max_budget: 100,
  models: [],
  team_id: undefined,
};

const renderEdit = (onResetKeySpend: (id: string) => Promise<void>, onClose: () => void) =>
  render(
    <TestTheme>
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [alertApiRef, fakeAlertApi],
            [permissionApiRef, mockApis.permission()],
          ]}
        >
          <KeyFormDialog
            open
            mode="edit"
            keyToEdit={keyToEdit}
            onClose={onClose}
            keys={[keyToEdit]}
            models={[]}
            teams={[]}
            keyGenerationSettings={{ allowUnlimitedBudget: false, teamRequired: false }}
            onCreateKey={async () => ({ key: 'x' } as any)}
            onUpdateKey={async () => {}}
            onResetKeySpend={onResetKeySpend}
            onGetConfig={async () => ({ keyActions: { allowOwnerResetSpend: true } } as LiteLlmConfig)}
          />
        </TestApiProvider>
      </MemoryRouter>
    </TestTheme>,
  );

const button = (name: string) => screen.findByText(name, { selector: 'button' }, { timeout: 5000 });

describe('KeyFormDialog reset spend', () => {
  test('a failed reset keeps the dialog open and shows the error inline', async () => {
    let closed = 0;
    renderEdit(async () => { throw new Error('LiteLLM rejected the request'); }, () => { closed++; });

    await userEvent.click(await button('Reset Spend to $0'));
    await userEvent.click(await button('Confirm'));

    assert.ok(await screen.findByText('LiteLLM rejected the request'));
    assert.strictEqual(closed, 0, 'must not close as if the reset worked');
  });

  test('a successful reset calls the handler with the key token and closes', async () => {
    const reset: string[] = [];
    let closed = 0;
    renderEdit(async id => { reset.push(id); }, () => { closed++; });

    await userEvent.click(await button('Reset Spend to $0'));
    await userEvent.click(await button('Confirm'));

    await waitFor(() => assert.strictEqual(closed, 1));
    assert.deepStrictEqual(reset, ['hash-12345']);
  });
});
