import { describe, test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createRouter } from './router';
import { readLangfuseConfig } from './langfuse';
import { getQualitySummary } from './langfuseClient';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

// ---------------------------------------------------------------------------
// Harness — mirrors routes/insights.test.ts.
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
  return {
    getUserInfo: (uid?: string) =>
      Promise.resolve({ user_id: uid ?? 'alice', teams: [] }),
    getUserByEmail: () => Promise.resolve(null),
  };
}

interface Harness {
  baseUrl: string;
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
    client: mockClient(),
    catalogClient: mockCatalog(opts.memberOf ?? []),
  });
  const app = express();
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
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

// ---------------------------------------------------------------------------
// Stubbed fetch for the Langfuse Metrics API.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; auth: string | null }> = [];

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function queryOf(url: string): any {
  return JSON.parse(new URL(url).searchParams.get('query') ?? '{}');
}

/** Stub fetch with a canned sequence of {body,status} responses. */
function stubFetchSequence(responses: Array<{ body: any; status?: number }>) {
  let i = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    const headers = new Headers(init?.headers);
    fetchCalls.push({ url: String(url), auth: headers.get('authorization') });
    const r = responses[Math.min(i++, responses.length - 1)];
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 404 ? 'Not Found' : 'OK',
      json: async () => r.body,
    };
  }) as any;
}

const DATES = 'start_date=2026-09-01&end_date=2026-10-01';
const LANGFUSE_CONFIG = {
  'litellm.langfuse.enabled': true,
  'litellm.langfuse.baseUrl': 'https://langfuse.example.com',
  'litellm.langfuse.publicKey': 'pk-test',
  'litellm.langfuse.secretKey': 'sk-test',
};

const OBS_BODY = {
  data: [
    { providedModelName: 'gpt-4o', sum_totalCost: 1.5, sum_totalTokens: 1000, avg_latency: 250, count_id: 10 },
  ],
};
const SCORES_BODY = { data: [{ name: 'helpfulness', avg_value: 0.8, count_id: 5 }] };

describe('readLangfuseConfig', () => {
  test('defaults to disabled with the userId join key', () => {
    const cfg = readLangfuseConfig(mockConfig({}));
    assert.deepStrictEqual(cfg, {
      enabled: false,
      baseUrl: null,
      publicKey: null,
      secretKey: null,
      userIdField: 'userId',
    });
  });
});

describe('GET /insights/quality', () => {
  const harnesses: Harness[] = [];
  after(() => {
    for (const h of harnesses) h.server.close();
  });

  test('disabled Langfuse returns {configured:false} without calling upstream', async () => {
    const h = await startHarness({});
    harnesses.push(h);
    stubFetchSequence([{ body: {} }]);
    const { status, body } = await req(h.baseUrl, `/insights/quality?${DATES}`, {
      authRef: 'user:default/alice',
    });
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { configured: false });
    assert.strictEqual(fetchCalls.length, 0);
  });

  test('missing dates get 400', async () => {
    const h = await startHarness({ config: LANGFUSE_CONFIG });
    harnesses.push(h);
    const { status } = await req(h.baseUrl, '/insights/quality', {
      authRef: 'user:default/alice',
    });
    assert.strictEqual(status, 400);
  });

  test('non-audit caller is scoped to own user_id (query userId ignored)', async () => {
    const h = await startHarness({ config: LANGFUSE_CONFIG });
    harnesses.push(h);
    stubFetchSequence([{ body: OBS_BODY }, { body: SCORES_BODY }]);
    const { status, body } = await req(
      h.baseUrl,
      `/insights/quality?${DATES}&userId=someone-else`,
      { authRef: 'user:default/alice' },
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.configured, true);
    // Observations query carries the forced caller id in the join-key filter.
    const obsQuery = queryOf(fetchCalls[0].url);
    assert.strictEqual(obsQuery.view, 'observations');
    assert.strictEqual(obsQuery.filters[0].column, 'userId');
    assert.strictEqual(obsQuery.filters[0].value, 'alice');
    // Basic auth uses the configured key pair.
    assert.strictEqual(
      fetchCalls[0].auth,
      `Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`,
    );
    assert.deepStrictEqual(body.byModel[0], {
      model: 'gpt-4o',
      cost: 1.5,
      tokens: 1000,
      avgLatencyMs: 250,
      requests: 10,
    });
    assert.deepStrictEqual(body.scores, [{ name: 'helpfulness', avg: 0.8, count: 5 }]);
  });

  test('audit-group member may pass userId through', async () => {
    const h = await startHarness({
      config: { ...LANGFUSE_CONFIG, 'litellm.audit.group': 'group:default/auditors' },
      memberOf: ['group:default/auditors'],
    });
    harnesses.push(h);
    stubFetchSequence([{ body: OBS_BODY }, { body: SCORES_BODY }]);
    const { status } = await req(h.baseUrl, `/insights/quality?${DATES}&userId=bob`, {
      authRef: 'user:default/alice',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(queryOf(fetchCalls[0].url).filters[0].value, 'bob');
  });

  test('v3 server (non-2xx metrics endpoint) degrades to {configured:false}', async () => {
    const h = await startHarness({ config: LANGFUSE_CONFIG });
    harnesses.push(h);
    stubFetchSequence([{ body: { error: 'not found' }, status: 404 }]);
    const { status, body } = await req(h.baseUrl, `/insights/quality?${DATES}`, {
      authRef: 'user:default/alice',
    });
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { configured: false });
  });
});

describe('getQualitySummary', () => {
  test('returns null when disabled or unconfigured', async () => {
    stubFetchSequence([{ body: {} }]);
    assert.strictEqual(
      await getQualitySummary(readLangfuseConfig(mockConfig({})), {
        from: '2026-09-01',
        to: '2026-10-01',
        userId: 'alice',
      }),
      null,
    );
    assert.strictEqual(fetchCalls.length, 0);
  });

  test('tolerates a failing scores query, keeping observations', async () => {
    stubFetchSequence([
      { body: OBS_BODY },
      { body: { error: 'no scores' }, status: 500 },
    ]);
    const summary = await getQualitySummary(readLangfuseConfig(mockConfig(LANGFUSE_CONFIG)), {
      from: '2026-09-01',
      to: '2026-10-01',
      userId: 'alice',
    });
    assert.strictEqual(summary?.configured, true);
    assert.strictEqual(summary?.byModel.length, 1);
    assert.deepStrictEqual(summary?.scores, []);
  });
});
