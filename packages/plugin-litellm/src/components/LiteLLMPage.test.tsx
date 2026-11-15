import { fakeAlertApi } from '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { routeResolutionApiRef } from '@backstage/frontend-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { LiteLLMPage } from './LiteLLMPage';
import { liteLlmApiRef } from '../api';
import { GenerateKeyRequest, LiteLlmConfig, TeamInfo } from '../types';

afterEach(() => cleanup());

const button = (name: string) => screen.queryByText(name, { selector: 'button' });

const team: TeamInfo = { team_id: 'team-1', team_alias: 'Team A', models: [], spend: 0 };
const emptyUsage = {
  total_spend: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
  api_requests: 0, successful_requests: 0, failed_requests: 0,
  usage_by_model: {}, usage_by_key: {}, daily_usage: [], daily_by_model: [],
};

// The API still returns a team, as a backend without the flag would: the page
// itself must hide it.
const renderPage = (keyGeneration: LiteLlmConfig['keyGeneration'], path = '/litellm', overrides = {}) => {
  const generated: GenerateKeyRequest[] = [];
  const api = {
    getUserInfo: async () => ({ user_id: 'alice@example.com', teams: ['team-1'], spend: 0 }),
    listKeys: async () => [],
    listModels: async () => [],
    getTeams: async () => [team],
    getConfig: async () => ({ baseUrl: null, keyGeneration }),
    getManagedTeams: async () => [],
    getVectorStores: async () => [],
    getMcpServers: async () => [],
    getObjectNames: async () => ({ vector_stores: [], mcp_servers: [] }),
    getUsage: async () => emptyUsage,
    generateKey: async (r: GenerateKeyRequest) => {
      generated.push(r);
      return { key: 'sk-new' };
    },
    ...overrides,
  };
  render(
    <TestTheme>
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider
          apis={[
            [alertApiRef, fakeAlertApi],
            [routeResolutionApiRef, { resolve: () => () => '/litellm' }],
            [permissionApiRef, mockApis.permission()],
            [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
            [liteLlmApiRef, api as any],
          ]}
        >
          <LiteLLMPage />
        </TestApiProvider>
      </MemoryRouter>
    </TestTheme>,
  );
  return { generated };
};

describe('LiteLLMPage with litellm.keyGeneration.personalOnly', () => {
  const personalOnly = { allowUnlimitedBudget: false, teamRequired: false, personalOnly: true };

  test('shows no Teams tab, no team chip and no Team field, and sends no team_id', async () => {
    const { generated } = renderPage(personalOnly);
    await screen.findByText('Overview', { selector: 'button' });
    await waitFor(() => assert.ok(!button('Teams'), 'the Teams tab is shown'));
    assert.ok(!screen.queryByText('Team A'), 'a team chip is shown');

    await userEvent.click(button('Generate New Key')!);
    await screen.findByText('Generate New Key', { selector: 'h2' });
    assert.ok(!screen.queryByLabelText(/^Team/), 'the Team field is shown');

    await userEvent.click(button('Generate')!);
    await waitFor(() => assert.strictEqual(generated.length, 1));
    assert.ok(!('team_id' in generated[0]), JSON.stringify(generated[0]));
  });

  test('?tab=teams shows the Overview tab instead', async () => {
    renderPage(personalOnly, '/litellm?tab=teams');
    await screen.findByText('Overview', { selector: 'button' });
    await waitFor(() => assert.ok(!button('Teams'), 'the Teams tab is shown'));
    assert.strictEqual(button('Overview')!.getAttribute('aria-selected'), 'true');
    assert.ok(screen.getByText('Create your first API key'));
  });

  test("?tab=models lists only the user's models, with no Team dropdown", async () => {
    renderPage(personalOnly, '/litellm?tab=models', {
      getUserInfo: async () => ({ user_id: 'alice@example.com', teams: ['team-1'], models: ['gpt-a'], spend: 0 }),
      listModels: async () => [
        { model_name: 'gpt-a', mode: 'chat' },
        { model_name: 'gpt-b', mode: 'chat' },
      ],
    });
    assert.ok(await screen.findByText('gpt-a'));
    assert.ok(!screen.queryByText('gpt-b'), 'gpt-b is listed');
    assert.ok(!screen.queryByLabelText(/^Team/), 'the Team dropdown is shown');
  });

  test('unset: the Teams tab, the team chip and the Team field still show', async () => {
    renderPage({ allowUnlimitedBudget: false, teamRequired: false });
    assert.ok(await screen.findByText('Team A'));
    assert.ok(button('Teams'), 'the Teams tab is missing');

    await userEvent.click(button('Generate New Key')!);
    await screen.findByText('Generate New Key', { selector: 'h2' });
    assert.ok(screen.getByLabelText(/^Team/));
  });
});
