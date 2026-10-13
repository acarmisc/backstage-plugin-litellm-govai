import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createRouter } from '../router';
import { LiteLLMClient, LiteLLMUpstreamError } from '../client';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

// ---------------------------------------------------------------------------
// Harness — mirrors router.test.ts style (mock client records getSpendLogs args).
// ---------------------------------------------------------------------------

function mockConfig(values: Record<string, any> = {}): any {
  return {
    getString: (key: string) => {
      if (!(key in values)) throw new Error(`missing required config: ${key}`);
      return values[key];
    },
    getOptionalString: (key: string) => values[key] ?? undefined,
    getOptionalBoolean: (key: string) => values[key] ?? undefined,
    getOptionalNumber: (key: string) => values[key] ?? undefined,
    getOptionalStringArray: (key: string) => values[key] ?? undefined,
    getOptional: (key: string) => values[key] ?? undefined,
  };
}

function silentLogger(): any {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

function mockAuth(): any {
  return {
    authenticate: async (token: string) => ({
      principal: { type: 'user', userEntityRef: token },
    }),
    getPluginRequestToken: async () => ({ token: 'catalog-token' }),
    getOwnServiceCredentials: async () => ({}),
  };
}

function mockCatalog(memberOf: string[] = []): any {
  return {
    getEntityByRef: async () => ({
      kind: 'User',
      spec: { profile: {} },
      relations: memberOf.map(t => ({ type: 'memberOf', targetRef: t })),
    }),
  };
}

function mockClient(): any {
  const calls: { getSpendLogs: any[] } = { getSpendLogs: [] };
  return {
    calls,
    getUserInfo: (uid?: string) =>
      Promise.resolve({ user_id: uid ?? 'alice', teams: [] }),
    getUserByEmail: () => Promise.resolve(null),
    getSpendLogs: (p: any) => {
      calls.getSpendLogs.push(p);
      return Promise.resolve({ data: [], total: 0, page: 1, pageSize: 25, truncated: false });
    },
  };
}

interface Harness {
  baseUrl: string;
  client: any;
  server: http.Server;
}

async function startHarness(opts: {
  config?: Record<string, any>;
  memberOf?: string[];
}): Promise<Harness> {
  const cfg = mockConfig({
    'litellm.baseUrl': 'http://litellm.local',
    'litellm.masterKey': 'mk-test',
    ...(opts.config ?? {}),
  });
  const client = mockClient();
  const router = await createRouter({
    config: cfg,
    logger: silentLogger(),
    auth: mockAuth(),
    discovery: { getBaseUrl: () => Promise.resolve('http://127.0.0.1:1') } as any,
    permissions: {
      authorize: async (queries: any[]) =>
        queries.map(() => ({ result: AuthorizeResult.ALLOW })),
      authorizeConditional: async () => [],
    },
    client,
    catalogClient: mockCatalog(opts.memberOf ?? []),
  });
  const app = express();
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, client, server };
}

function req(
  baseUrl: string,
  path: string,
  opts: { authRef?: string } = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.authRef !== undefined) headers.authorization = `Bearer ${opts.authRef}`;
    const r = http.request(`${baseUrl}${path}`, { method: 'GET', headers }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let parsed: any;
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = data; }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

const DATES = 'start_date=2026-09-01&end_date=2026-10-01';

describe('GET /insights/spend-logs', () => {
  let harnesses: Harness[] = [];
  after(() => {
    for (const h of harnesses) h.server.close();
  });

  test('unauthenticated caller gets 401', async () => {
    const h = await startHarness({});
    harnesses.push(h);
    const { status } = await req(h.baseUrl, `/insights/spend-logs?${DATES}`);
    assert.strictEqual(status, 401);
  });

  test('missing dates get 400', async () => {
    const h = await startHarness({});
    harnesses.push(h);
    const { status } = await req(h.baseUrl, '/insights/spend-logs', {
      authRef: 'user:default/alice',
    });
    assert.strictEqual(status, 400);
  });

  test('non-audit caller is scoped to own user_id (query userId/teamId ignored)', async () => {
    const h = await startHarness({});
    harnesses.push(h);
    const { status, body } = await req(
      h.baseUrl,
      `/insights/spend-logs?${DATES}&userId=someone-else&teamId=team-x`,
      { authRef: 'user:default/alice' },
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(h.client.calls.getSpendLogs.length, 1);
    const params = h.client.calls.getSpendLogs[0];
    assert.strictEqual(params.userId, 'alice');
    assert.strictEqual(params.teamId, undefined);
    assert.deepStrictEqual(body, { data: [], total: 0, page: 1, pageSize: 25, truncated: false });
  });

  test('audit-group member may pass userId/teamId through', async () => {
    const h = await startHarness({
      config: { 'litellm.audit.group': 'group:default/auditors' },
      memberOf: ['group:default/auditors'],
    });
    harnesses.push(h);
    const { status } = await req(
      h.baseUrl,
      `/insights/spend-logs?${DATES}&userId=bob&teamId=team-x`,
      { authRef: 'user:default/alice' },
    );
    assert.strictEqual(status, 200);
    const params = h.client.calls.getSpendLogs[0];
    assert.strictEqual(params.userId, 'bob');
    assert.strictEqual(params.teamId, 'team-x');
  });
});

// ---------------------------------------------------------------------------
// Client tolerant parse — real LiteLLMClient with stubbed fetch.
// ---------------------------------------------------------------------------

const mockClientConfig = { baseUrl: 'http://localhost:8000', masterKey: 'sk-test' };
let fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetchSequence(responses: Array<{ body: any; status?: number }>) {
  let i = 0;
  globalThis.fetch = (async (url: any) => {
    fetchCalls.push(String(url));
    const r = responses[Math.min(i++, responses.length - 1)];
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 404 ? 'Not Found' : 'OK',
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  }) as any;
}

describe('LiteLLMClient.getSpendLogs', () => {
  test('parses a bare-array body with snake_case fields', async () => {
    stubFetchSequence([
      {
        body: [
          {
            request_id: 'req-1',
            model: 'gpt-4o',
            spend: 0.012,
            prompt_tokens: 100,
            completion_tokens: 50,
            status: 'success',
            cache_hit: false,
            user_id: 'alice',
            timestamp: '2026-10-01T00:00:00Z',
          },
        ],
      },
    ]);
    const client = new LiteLLMClient(mockClientConfig);
    const result = await client.getSpendLogs({ startDate: '2026-09-01', endDate: '2026-10-01' });
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].includes('/spend/logs?'));
    assert.ok(fetchCalls[0].includes('summarize=false'));
    assert.deepStrictEqual(result.data[0], {
      requestId: 'req-1',
      model: 'gpt-4o',
      spend: 0.012,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      status: 'success',
      cacheHit: false,
      userId: 'alice',
      timestamp: '2026-10-01T00:00:00Z',
    });
    assert.strictEqual(result.truncated, false);
  });

  test('parses a {results} envelope with alternate field names', async () => {
    stubFetchSequence([
      {
        body: {
          results: [
            {
              id: 'req-2',
              model_name: 'claude-sonnet-4',
              cost: '0.05',
              input_tokens: 200,
              output_tokens: 100,
              request_status: 'success',
              cached: true,
              team_id: 'team-x',
              created_at: '2026-09-15T00:00:00Z',
            },
          ],
          total: 1,
        },
      },
    ]);
    const client = new LiteLLMClient(mockClientConfig);
    const result = await client.getSpendLogs({ startDate: '2026-09-01', endDate: '2026-10-01' });
    assert.deepStrictEqual(result.data[0], {
      requestId: 'req-2',
      model: 'claude-sonnet-4',
      spend: 0.05,
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      status: 'success',
      cacheHit: true,
      teamId: 'team-x',
      timestamp: '2026-09-15T00:00:00Z',
    });
    assert.strictEqual(result.total, 1);
  });

  test('retries /spend/logs/v2 on 404 and caps pageSize at 100', async () => {
    stubFetchSequence([
      { body: { error: 'not found' }, status: 404 },
      { body: { data: [], total: 0 } },
    ]);
    const client = new LiteLLMClient(mockClientConfig);
    const result = await client.getSpendLogs({
      startDate: '2026-09-01',
      endDate: '2026-10-01',
      pageSize: 500,
    });
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].includes('/spend/logs?'));
    assert.ok(fetchCalls[1].includes('/spend/logs/v2?'));
    assert.ok(fetchCalls[1].includes('page_size=100'));
    assert.deepStrictEqual(result, { data: [], total: 0, page: 1, pageSize: 100, truncated: false });
  });

  test('truncated is true when a full page is returned', async () => {
    stubFetchSequence([
      {
        body: {
          data: Array.from({ length: 25 }, (_, i) => ({
            request_id: `req-${i}`,
            model: 'gpt-4o',
            spend: 0.01,
          })),
        },
      },
    ]);
    const client = new LiteLLMClient(mockClientConfig);
    const result = await client.getSpendLogs({ startDate: '2026-09-01', endDate: '2026-10-01' });
    assert.strictEqual(result.data.length, 25);
    assert.strictEqual(result.truncated, true);
    assert.strictEqual(result.data[0].status, 'unknown');
  });

  test('non-404 upstream errors propagate without retry', async () => {
    stubFetchSequence([{ body: { error: 'boom' }, status: 500 }]);
    const client = new LiteLLMClient(mockClientConfig);
    await assert.rejects(
      client.getSpendLogs({ startDate: '2026-09-01', endDate: '2026-10-01' }),
      (e: unknown) => e instanceof LiteLLMUpstreamError && e.status === 500,
    );
    assert.strictEqual(fetchCalls.length, 1);
  });
});
