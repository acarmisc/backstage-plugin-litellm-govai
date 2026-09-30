import { fakeAlertApi, deferred, skeletonCount } from '../testing/setupDom';
import { routeResolutionApiRef } from '@backstage/frontend-plugin-api';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { ComponentProps } from 'react';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { LiteLLMBudgetGauges } from './LiteLLMBudgetGauges';
import { liteLlmApiRef } from '../api';
import { ApiError } from '../api';
import { UserInfo, VirtualKey, TeamInfo } from '../types';
import { toLocalDay } from '../dates';

// Mock the route-resolution API for useRouteRef
afterEach(() => cleanup());

describe('LiteLLMBudgetGauges', () => {
  const mockUserInfo: UserInfo = {
    user_id: 'user-1',
    spend: 50,
    max_budget: 100,
    models: ['gpt-4', 'gpt-3.5-turbo'],
  };

  const mockKeys: VirtualKey[] = [
    {
      key: 'sk-key-1',
      token: 'sk-key-1',
      key_alias: 'test-key-1',
      created_at: '2026-09-01T00:00:00Z',
      spend: 10,
      max_budget: 50,
      team_id: 'team-1',
      blocked: false,
    },
  ];

  const mockTeams: TeamInfo[] = [
    {
      team_id: 'team-1',
      team_alias: 'Team A',
      models: ['gpt-4', 'gpt-3.5-turbo', 'claude-3'],
      spend: 100,
    },
  ];

  const createFakeLiteLlmApi = (overrides: Partial<any> = {}) => ({
    getUserInfo: async () => mockUserInfo,
    listKeys: async () => mockKeys,
    getTeams: async () => mockTeams,
    listModels: async () => [],
    getConfig: async () => ({ baseUrl: 'http://localhost' }),
    getUsage: async () => ({ daily_usage: [] }),
    ...overrides,
  });

  const renderWidget = (overrides: Partial<ComponentProps<typeof LiteLLMBudgetGauges>> = {}, apiOverrides: any = {}) => {
    const defaultProps: ComponentProps<typeof LiteLLMBudgetGauges> = {
      title: 'Budget',
      ...overrides,
    };

    const fakeApi = createFakeLiteLlmApi(apiOverrides) as any;

    return render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [alertApiRef, fakeAlertApi],
            [routeResolutionApiRef, { resolve: () => () => '/litellm' }],
          [permissionApiRef, mockApis.permission()],
            [liteLlmApiRef, fakeApi],
          ]}
        >
          <LiteLLMBudgetGauges {...defaultProps} />
        </TestApiProvider>
      </MemoryRouter>,
    );
  };

  test('shows skeleton placeholders while loading, then the content', async () => {
    const userInfo = deferred<typeof mockUserInfo>();
    renderWidget({}, { getUserInfo: () => userInfo.promise });

    assert.ok(skeletonCount() > 0, 'skeletons are shown while the profile loads');
    assert.strictEqual(document.querySelector('[role="progressbar"]'), null, 'no bare spinner');

    userInfo.resolve(mockUserInfo);
    await waitFor(() => assert.strictEqual(skeletonCount(), 0));
    assert.ok(screen.getAllByText(/limit/).length > 0);
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

  test('renders error message for non-provisioning errors', async () => {
    const networkError = new ApiError(
      'Network error',
      500,
      { error: 'Internal server error' },
    );

    renderWidget({}, {
      getUserInfo: async () => {
        throw networkError;
      },
    });

    // Should show a generic unavailable message
    await waitFor(() => {
      assert.ok(screen.getByText(/Usage unavailable|not set up/i));
    });
  });

  test('never renders raw error message text', async () => {
    const errorWithDetails = new ApiError(
      'Details: database connection failed at 192.168.1.1',
      500,
      { error: 'Internal server error: connection failed' },
    );

    renderWidget({}, {
      getUserInfo: async () => {
        throw errorWithDetails;
      },
    });

    // Should not expose internal details
    await waitFor(() => {
      assert.ok(!screen.queryByText(/database connection/i));
      assert.ok(!screen.queryByText(/192.168.1.1/i));
    });
  });

  test('displays budget information when data loads successfully', async () => {
    renderWidget({}, {
      getUserInfo: async () => mockUserInfo,
      getUsage: async () => ({
        total_spend: 50,
        total_tokens: 2000,
        prompt_tokens: 1000,
        completion_tokens: 500,
        api_requests: 10,
        successful_requests: 9,
        failed_requests: 1,
        usage_by_model: {},
        usage_by_key: {},
        daily_usage: [
          {
            date: '2026-09-28',
            spend: 25,
            total_tokens: 1000,
            prompt_tokens: 600,
            completion_tokens: 400,
            api_requests: 5,
            successful_requests: 5,
            failed_requests: 0,
          },
          {
            date: '2026-09-29',
            spend: 25,
            total_tokens: 1000,
            prompt_tokens: 400,
            completion_tokens: 100,
            api_requests: 5,
            successful_requests: 4,
            failed_requests: 1,
          },
        ],
        daily_by_model: [],
      }),
    });

    await waitFor(() => {
      // Should show some budget information
      assert.ok(screen.getByText(/Budget/));
    });
  });

  /** A `daily_usage` point with every required field filled in. */
  const dailyPoint = (date: string, spend: number) => ({
    date,
    spend,
    total_tokens: 1000,
    prompt_tokens: 700,
    completion_tokens: 300,
    api_requests: 5,
    successful_requests: 5,
    failed_requests: 0,
  });

  test('shows an inline today-spent KPI beside month-to-date spend', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    renderWidget({}, {
      getUsage: async () => ({
        total_spend: 116.51,
        daily_usage: [
          dailyPoint(toLocalDay(yesterday), 9.1),
          dailyPoint(toLocalDay(new Date()), 12.4),
        ],
        daily_by_model: [],
      }),
    });

    await waitFor(() => assert.ok(screen.getByText('Today spent')));
    assert.ok(screen.getByText('$12.40'));
    assert.ok(screen.getByText('vs $9.10 yesterday'));
    assert.ok(screen.getByText('Month to date'));
    assert.ok(screen.getAllByText('$116.51').length > 0);
  });

  test('renders one inline row per enforcement level, ring first', async () => {
    renderWidget();

    await waitFor(() => assert.ok(screen.getByText('Team')));
    for (const level of ['Key', 'User', 'Team']) {
      assert.ok(screen.getAllByText(level).length >= 1, `level tag ${level}`);
    }
    assert.strictEqual(screen.getAllByRole('meter').length, 3);
  });

  test('prints the reset window once per row and the key id under the name', async () => {
    renderWidget();

    await waitFor(() => assert.ok(screen.getByText('test-key-1')));
    // The identifying detail sits under the limit name…
    assert.ok(screen.getByText('sk-key-1'));

    // …and the reset window only in the right track, not repeated under the
    // name where it used to print twice in the same row.
    const name = screen.getByText('test-key-1');
    const row = name.parentElement?.parentElement;
    assert.ok(row, 'the limit name sits inside a row grid');
    const resetLines = Array.from(row.querySelectorAll('*')).filter(
      el => el.children.length === 0 && /^never resets$|^resets /.test(el.textContent ?? ''),
    );
    assert.strictEqual(resetLines.length, 1, 'reset caption appears exactly once');
  });

  test('keeps the percentage in the ring when a limit is over cap', async () => {
    renderWidget({ keys: [{ ...mockKeys[0], spend: 60, max_budget: 50 }] });

    await waitFor(() => assert.ok(screen.getByText('120%')));
    assert.ok(screen.getByText('Over cap'));
    assert.ok(screen.getAllByText('$60.00 / $50.00').length > 0);
    // The status rides in the row: a second line inside the ring collides
    // with the stroke at this size.
    const m = screen.getByRole('meter', { name: 'Key budget used: 120%' });
    assert.ok(!m.textContent?.includes('Over cap'), 'ring holds only the number');
  });
});
