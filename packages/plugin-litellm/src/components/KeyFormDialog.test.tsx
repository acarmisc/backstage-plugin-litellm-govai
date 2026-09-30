import { fakeAlertApi } from '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { ComponentProps } from 'react';
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { KeyFormDialog } from './KeyFormDialog';
import { ModelInfo, TeamInfo, GenerateKeyResponse, LiteLlmConfig } from '../types';

afterEach(() => cleanup());

// `getByRole` recomputes styles for every node and is pathologically slow on
// MUI's DOM in jsdom; look buttons up by visible text / label instead.
const button = (name: string) => screen.getByText(name, { selector: 'button' });
const findButton = (name: string) => screen.findByText(name, { selector: 'button' });
const stubClipboard = () => {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (t: string) => { written.push(t); } },
    configurable: true,
  });
  return written;
};

describe('KeyFormDialog', () => {
  const mockModels: ModelInfo[] = [
    {
      model_name: 'gpt-4',
      mode: 'chat',
      input_cost_per_token: 0.00003,
      output_cost_per_token: 0.00006,
      max_input_tokens: 8192,
      max_output_tokens: 8192,
      supports_function_calling: true,
      supports_vision: false,
    },
    {
      model_name: 'gpt-3.5-turbo',
      mode: 'chat',
      input_cost_per_token: 0.0000005,
      output_cost_per_token: 0.0000015,
      max_input_tokens: 4096,
      max_output_tokens: 4096,
      supports_function_calling: true,
      supports_vision: false,
    },
  ];

  const mockTeams: TeamInfo[] = [
    {
      team_id: 'team-1',
      team_alias: 'Team A',
      models: ['gpt-4', 'gpt-3.5-turbo'],
      spend: 100,
    },
  ];

  const renderDialog = (overrides: Partial<ComponentProps<typeof KeyFormDialog>> = {}) => {
    const defaultProps: ComponentProps<typeof KeyFormDialog> = {
      open: true,
      onClose: () => {},
      mode: 'create',
      keys: [],
      models: mockModels,
      teams: mockTeams,
      keyGenerationSettings: {
        allowUnlimitedBudget: false,
        teamRequired: false,
      },
      onCreateKey: async () => ({
        key: 'sk-new-secret-key-12345',
      } as GenerateKeyResponse),
      onUpdateKey: async () => {},
      onGetConfig: async () => ({
        baseUrl: 'http://localhost:8000',
        publicBaseUrl: 'https://litellm.example.com',
        keyActions: {
          allowOwnerResetSpend: false,
        },
      } as LiteLlmConfig),
      ...overrides,
    };

    return render(
      <TestTheme>
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [alertApiRef, fakeAlertApi],
          [permissionApiRef, mockApis.permission()],
          ]}
        >
          <KeyFormDialog {...defaultProps} />
        </TestApiProvider>
      </MemoryRouter>
      </TestTheme>,
    );
  };

  test('field order in create mode: Team, Models, Budget, Duration, Alias, then Advanced', () => {
    renderDialog();

    const labels = [...document.querySelectorAll('label')].map(l => (l.textContent ?? '').replace(/\s*\*$/, '').trim());
    const order = ['Team', 'Models', 'Max Budget', 'Duration', 'Alias'];
    const positions = order.map(name => labels.findIndex(l => l.startsWith(name)));
    positions.forEach((pos, i) => assert.ok(pos >= 0, `${order[i]} field is present (labels: ${labels.join(' | ')})`));
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i - 1] < positions[i], `${order[i - 1]} should come before ${order[i]}`);
    }

    // Advanced (accordion) comes after Alias in the DOM.
    const alias = screen.getByLabelText(/^Alias/);
    const advanced = screen.getByText('Advanced');
    assert.ok(
      alias.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING,
      'Advanced should come after Alias',
    );
  });

  test('shows no validation errors before blur or submit', () => {
    renderDialog();
    assert.strictEqual(screen.queryByText(/Enter a positive budget/), null);
    assert.strictEqual(screen.queryByText('Alias is required'), null);
  });

  test('blurring the empty budget field reveals its error', async () => {
    renderDialog();
    const budget = screen.getByLabelText(/^Max Budget/);
    await userEvent.clear(budget); // budget is pre-filled with 100
    await userEvent.tab();
    assert.ok(await screen.findByText(/Enter a positive budget/));
  });

  test('submitting an invalid form shows errors, focuses the first invalid field and does not call onCreateKey', async () => {
    let calls = 0;
    renderDialog({ onCreateKey: async () => { calls++; return { key: 'sk-x' } as GenerateKeyResponse; } });

    await userEvent.clear(screen.getByLabelText(/^Max Budget/));
    await userEvent.click(button('Generate'));

    assert.ok(await screen.findByText(/Enter a positive budget/));
    assert.strictEqual(calls, 0);
    assert.strictEqual(document.activeElement, screen.getByLabelText(/^Max Budget/));
    // Submit stays enabled so the user can retry after fixing.
    assert.strictEqual((button('Generate') as HTMLButtonElement).disabled, false);
  });

  test('a valid submit sends the entered budget and alias', async () => {
    const requests: any[] = [];
    renderDialog({ onCreateKey: async r => { requests.push(r); return { key: 'sk-ok' } as GenerateKeyResponse; } });

    const budget = screen.getByLabelText(/^Max Budget/);
    await userEvent.clear(budget);
    await userEvent.type(budget, '25');
    await userEvent.click(button('Generate'));

    await waitFor(() => assert.strictEqual(requests.length, 1));
    assert.strictEqual(requests[0].max_budget, 25);
    assert.ok(requests[0].alias && requests[0].alias.length > 0);
    assert.strictEqual(requests[0].duration, '30d');
  });

  describe('one-time secret', () => {
    const createAndShowSecret = async (onClose: () => void) => {
      renderDialog({ onClose, onCreateKey: async () => ({ key: 'sk-secret-value-1' } as GenerateKeyResponse) });
      await userEvent.click(button('Generate'));
      await screen.findByText('Copy this key now. It will never be shown again.');
    };

    test('shows the secret with the never-shown-again warning', async () => {
      await createAndShowSecret(() => {});
      assert.ok(screen.getAllByText(/sk-secret-value-1/).length >= 1);
    });

    test('Escape and backdrop clicks do not dismiss the secret', async () => {
      let closed = 0;
      await createAndShowSecret(() => { closed++; });

      const dialogEl = document.querySelector('[role="dialog"]') as HTMLElement;
      fireEvent.keyDown(dialogEl, { key: 'Escape', code: 'Escape' });
      const container = dialogEl.parentElement as HTMLElement;
      fireEvent.mouseDown(container);
      fireEvent.click(container);

      await new Promise(r => setTimeout(r, 200));
      assert.strictEqual(closed, 0, 'onClose must not fire');
      assert.ok(screen.getAllByText(/sk-secret-value-1/).length >= 1);
    });

    test('Done before copying asks for confirmation; Go back keeps the secret, Close anyway closes', async () => {
      let closed = 0;
      await createAndShowSecret(() => { closed++; });

      await userEvent.click(button('Done'));
      assert.ok(await screen.findByText("You haven't copied the key. Close anyway?"));
      assert.strictEqual(closed, 0);

      await userEvent.click(button('Go back'));
      await waitFor(() => assert.strictEqual(screen.queryByText("You haven't copied the key. Close anyway?"), null));
      assert.strictEqual(closed, 0);
      assert.ok(screen.getAllByText(/sk-secret-value-1/).length >= 1);

      await userEvent.click(button('Done'));
      await userEvent.click(await findButton('Close anyway'));
      await waitFor(() => assert.strictEqual(closed, 1));
    });

    test('after copying the key, Done closes without a confirmation', async () => {
      const written = stubClipboard();
      let closed = 0;
      await createAndShowSecret(() => { closed++; });

      await userEvent.click(screen.getByLabelText('Copy API key'));
      await waitFor(() => assert.deepStrictEqual(written, ['sk-secret-value-1']));

      await userEvent.click(button('Done'));
      await waitFor(() => assert.strictEqual(closed, 1));
      assert.strictEqual(screen.queryByText("You haven't copied the key. Close anyway?"), null);
    });
  });
});
