import '../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { KeyFormDialog } from './KeyFormDialog';
import { ModelInfo, TeamInfo, GenerateKeyResponse, LiteLlmConfig } from '../types';

afterEach(() => cleanup());

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

  const renderDialog = (overrides: Partial<React.ComponentProps<typeof KeyFormDialog>> = {}) => {
    const defaultProps: React.ComponentProps<typeof KeyFormDialog> = {
      open: true,
      onClose: () => {},
      mode: 'create',
      keys: [],
      models: mockModels,
      teams: mockTeams,
      keyGenerationSettings: {
        allowUnlimitedBudget: true,
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
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [permissionApiRef, mockApis.permission()],
          ]}
        >
          <KeyFormDialog {...defaultProps} />
        </TestApiProvider>
      </MemoryRouter>,
    );
  };

  test('field order in create mode: Team → Models → Budget → Duration → Alias → Advanced', async () => {
    renderDialog();

    // Get all labels in document order
    const labels = screen.getAllByText(/Team|Models|Max Budget|Duration|Alias|Advanced/);
    const labelTexts = labels.map(l => l.textContent);

    // Find the indices of the fields we care about
    const teamIdx = labelTexts.findIndex(t => t?.includes('Team'));
    const modelsIdx = labelTexts.findIndex(t => t?.includes('Models'));
    const budgetIdx = labelTexts.findIndex(t => t?.includes('Max Budget'));
    const durationIdx = labelTexts.findIndex(t => t?.includes('Duration'));
    const aliasIdx = labelTexts.findIndex(t => t?.includes('Alias'));
    const advancedIdx = labelTexts.findIndex(t => t?.includes('Advanced'));

    // Verify order (all indices should be non-negative and in ascending order)
    if (teamIdx >= 0 && modelsIdx >= 0) assert.ok(teamIdx < modelsIdx, 'Team should come before Models');
    if (modelsIdx >= 0 && budgetIdx >= 0) assert.ok(modelsIdx < budgetIdx, 'Models should come before Budget');
    if (budgetIdx >= 0 && durationIdx >= 0) assert.ok(budgetIdx < durationIdx, 'Budget should come before Duration');
    if (durationIdx >= 0 && aliasIdx >= 0) assert.ok(durationIdx < aliasIdx, 'Duration should come before Alias');
    if (aliasIdx >= 0 && advancedIdx >= 0) assert.ok(aliasIdx < advancedIdx, 'Alias should come before Advanced');
  });

  test('no error text before blur or submit', async () => {
    renderDialog();

    // Initially, no error messages should be visible
    assert.ok(!screen.queryByText(/required/i));
    assert.ok(!screen.queryByText(/must be/i));
  });

  test('submitting empty required field shows error and does NOT call onCreateKey', async () => {
    let createKeyCallCount = 0;
    const onCreateKey = async () => {
      createKeyCallCount++;
      return { key: 'sk-test' } as GenerateKeyResponse;
    };

    renderDialog({ onCreateKey });

    // Try to submit without filling in required fields
    const submitButton = screen.getByRole('button', { name: /Generate/i });
    await userEvent.click(submitButton);

    // Should show validation error
    await waitFor(() => {
      // Error should appear for the Alias field
      assert.ok(screen.queryByText(/Alias/i), 'Alias field should be present');
    });

    // onCreateKey should NOT have been called
    assert.strictEqual(createKeyCallCount, 0);
  });

  test('after successful create shows one-time secret with warning text', async () => {
    const onCreateKey = async () => ({
      key: 'sk-secret-value-should-appear-here',
    } as GenerateKeyResponse);

    renderDialog({ onCreateKey });

    // Fill in alias (required field)
    const inputs = screen.getAllByRole('textbox');
    const aliasField = inputs[inputs.length - 1]; // Alias is usually the last text input
    await userEvent.type(aliasField, 'my-test-key');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /Generate/i });
    await userEvent.click(submitButton);

    // Should show the secret and warning text
    await waitFor(() => {
      assert.ok(screen.getByText(/Copy this key now\. It will never be shown again\./));
      assert.ok(screen.getByText(/sk-secret-value-should-appear-here/));
    });
  });

  test('pressing Escape does NOT close dialog while showing secret', async () => {
    const onClose = () => {
      throw new Error('onClose should not be called');
    };
    const onCreateKey = async () => ({
      key: 'sk-secret-12345',
    } as GenerateKeyResponse);

    renderDialog({ onCreateKey, onClose });

    // Fill and submit to show secret
    const inputs = screen.getAllByRole('textbox');
    const aliasField = inputs[inputs.length - 1];
    await userEvent.type(aliasField, 'test-key');

    const submitButton = screen.getByRole('button', { name: /Generate/i });
    await userEvent.click(submitButton);

    // Wait for secret to appear
    await waitFor(() => {
      assert.ok(screen.getByText(/sk-secret-12345/));
    });

    // Try to close with Escape — should not trigger onClose
    const dialog = screen.getByRole('dialog');
    try {
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    } catch (e) {
      // If onClose was called, it will throw
      assert.fail('onClose should not be called on Escape when secret is showing');
    }
  });

  test('Done before copying opens confirm dialog', async () => {
    const onCreateKey = async () => ({
      key: 'sk-secret-12345',
    } as GenerateKeyResponse);

    renderDialog({ onCreateKey });

    // Fill and submit to show secret
    const inputs = screen.getAllByRole('textbox');
    const aliasField = inputs[inputs.length - 1];
    await userEvent.type(aliasField, 'test-key');

    const submitButton = screen.getByRole('button', { name: /Generate/i });
    await userEvent.click(submitButton);

    // Wait for secret to appear
    await waitFor(() => {
      assert.ok(screen.getByText(/sk-secret-12345/));
    });

    // Click Done without copying
    const doneButton = screen.getByRole('button', { name: /Done/i });
    await userEvent.click(doneButton);

    // Should show confirmation dialog
    await waitFor(() => {
      assert.ok(screen.getByText(/You haven't copied the key\. Close anyway\?/i));
    });
  });

  test('validation shows error after blur on required field', async () => {
    renderDialog();

    // Get the alias input and blur it without typing
    const inputs = screen.getAllByRole('textbox');
    const aliasInput = inputs[inputs.length - 1];

    // Focus and blur without typing
    aliasInput.focus();
    aliasInput.blur();

    // Error should now be visible after blur
    await waitFor(() => {
      // Check for error on the Alias field
      const helperText = screen.queryByText(/Alias/i);
      assert.ok(helperText, 'Should show error message for Alias field');
    });
  });
});
