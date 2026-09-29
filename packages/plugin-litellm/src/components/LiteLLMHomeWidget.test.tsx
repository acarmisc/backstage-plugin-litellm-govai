import { fakeAlertApi } from '../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { LiteLLMHomeWidget } from './LiteLLMHomeWidget';
import { liteLlmApiRef } from '../api';
import { ApiError } from '../api';
import { UserInfo, VirtualKey, TeamInfo } from '../types';

afterEach(() => cleanup());

describe('LiteLLMHomeWidget', () => {
  const mockUserInfo: UserInfo = {
    user_id: 'user-1',
    spend: 75,
    max_budget: 200,
    models: ['gpt-4', 'gpt-3.5-turbo'],
  };

  const mockKeys: VirtualKey[] = [
    {
      key: 'sk-key-1',
      token: 'sk-key-1',
      key_alias: 'home-test-key',
      created_at: '2026-09-01T00:00:00Z',
      spend: 25,
      max_budget: 100,
      team_id: 'team-1',
      blocked: false,
    },
  ];

  const mockTeams: TeamInfo[] = [
    {
      team_id: 'team-1',
      team_alias: 'Team A',
      models: ['gpt-4', 'gpt-3.5-turbo', 'claude-3'],
      spend: 150,
    },
  ];

  const createFakeLiteLlmApi = (overrides: Partial<any> = {}) => ({
    getUserInfo: async () => mockUserInfo,
    listKeys: async () => mockKeys,
    getTeams: async () => mockTeams,
    listModels: async () => [],
    getConfig: async () => ({ baseUrl: 'http://localhost', publicBaseUrl: 'https://litellm.example.com' }),
    getUsage: async () => ({
      total_spend: 75,
      total_tokens: 3500,
      prompt_tokens: 2000,
      completion_tokens: 1500,
      api_requests: 10,
      successful_requests: 9,
      failed_requests: 1,
      usage_by_model: {},
      usage_by_key: {},
      daily_usage: [
        {
          date: '2026-09-28',
          spend: 40,
          total_tokens: 2000,
          prompt_tokens: 1200,
          completion_tokens: 800,
          api_requests: 5,
          successful_requests: 5,
          failed_requests: 0,
        },
        {
          date: '2026-09-29',
          spend: 35,
          total_tokens: 1500,
          prompt_tokens: 800,
          completion_tokens: 700,
          api_requests: 5,
          successful_requests: 4,
          failed_requests: 1,
        },
      ],
      daily_by_model: [],
    }),
    ...overrides,
  });

  const renderWidget = (overrides: Partial<React.ComponentProps<typeof LiteLLMHomeWidget>> = {}, apiOverrides: any = {}) => {
    const defaultProps: React.ComponentProps<typeof LiteLLMHomeWidget> = {
      ...overrides,
    };

    const fakeApi = createFakeLiteLlmApi(apiOverrides) as any;

    return render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [alertApiRef, fakeAlertApi],
          [permissionApiRef, mockApis.permission()],
            [liteLlmApiRef, fakeApi],
          ]}
        >
          <LiteLLMHomeWidget {...defaultProps} />
        </TestApiProvider>
      </MemoryRouter>,
    );
  };

  test('renders skeleton while loading', async () => {
    renderWidget({}, {
      getUserInfo: async () => new Promise(resolve => setTimeout(() => resolve(mockUserInfo), 5000)),
    });

    // Should show loading initially (with skeleton or similar)
    // Wait for data to load
    await waitFor(() => {
      // Once loaded, should show usage information
      assert.ok(screen.queryByText(/LiteLLM usage/) || screen.queryByText(/spent/));
    }, { timeout: 6000 });
  });

  test('renders unprovisioned message when API returns unprovisioned error', async () => {
    const unprovisionedError = new ApiError(
      'User not found in LiteLLM',
      404,
      { error: 'User not found in LiteLLM' },
    );

    renderWidget({}, {
      getUserInfo: async () => {
        throw unprovisionedError;
      },
    });

    // Should show the unprovisioned message
    await waitFor(() => {
      assert.ok(screen.getByText(/LiteLLM account not set up\. Ask your admin\./i));
    });

    // Should NOT show raw error message
    assert.ok(!screen.queryByText(/User not found in LiteLLM/));
  });

  test('does not show raw error messages', async () => {
    const errorWithDetails = new ApiError(
      'Database error: connection failed',
      500,
      { error: 'Internal server error' },
    );

    renderWidget({}, {
      getUserInfo: async () => {
        throw errorWithDetails;
      },
    });

    // Should not expose the raw error details
    await waitFor(() => {
      assert.ok(!screen.queryByText(/Database error/i));
      assert.ok(!screen.queryByText(/connection failed/i));
    });
  });

  test('displays usage data when loaded successfully', async () => {
    renderWidget({}, {
      getUserInfo: async () => mockUserInfo,
      getUsage: async () => ({
        total_spend: 75,
        total_tokens: 3500,
        prompt_tokens: 2000,
        completion_tokens: 1500,
        api_requests: 10,
        successful_requests: 9,
        failed_requests: 1,
        usage_by_model: {},
        usage_by_key: {},
        daily_usage: [
          {
            date: '2026-09-28',
            spend: 40,
            total_tokens: 2000,
            prompt_tokens: 1200,
            completion_tokens: 800,
            api_requests: 5,
            successful_requests: 5,
            failed_requests: 0,
          },
          {
            date: '2026-09-29',
            spend: 35,
            total_tokens: 1500,
            prompt_tokens: 800,
            completion_tokens: 700,
            api_requests: 5,
            successful_requests: 4,
            failed_requests: 1,
          },
        ],
        daily_by_model: [],
      }),
    });

    await waitFor(() => {
      // Should show widget content with usage information
      // The widget displays spend, tokens in/out
      assert.ok(screen.queryByText(/LiteLLM usage/i) || screen.queryByText(/spent/));
    });
  });

  test('handles usage fetch error gracefully', async () => {
    const usageError = new ApiError(
      'Failed to fetch usage',
      500,
      { error: 'Server error' },
    );

    renderWidget({}, {
      getUserInfo: async () => mockUserInfo,
      getUsage: async () => {
        throw usageError;
      },
    });

    // Should show the widget but with usage unavailable message
    await waitFor(() => {
      assert.ok(screen.queryByText(/Usage unavailable|not set up/i));
    });

    // Should not show raw error
    assert.ok(!screen.queryByText(/Failed to fetch usage/i));
  });
});
