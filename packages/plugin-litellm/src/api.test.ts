import { describe, test } from 'node:test';
import assert from 'node:assert';
import { LiteLlmApi, expiryStatus } from './api';

// window.location.origin is read inside LiteLlmApi.get() — set it before any
// test method calls (it's never read at module-load time, so this is safe).
(global as any).window = { location: { origin: 'http://localhost' } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init?: RequestInit };

function makeFetch(status: number, body: unknown) {
  const calls: FetchCall[] = [];
  const fetchApi = {
    fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Not Found',
        json: async () => body,
        text: async () => String(body),
      } as unknown as Response;
    },
  };
  return { fetchApi, calls };
}

function makeApi(status = 200, body: unknown = {}) {
  const { fetchApi, calls } = makeFetch(status, body);
  const api = new LiteLlmApi(fetchApi, 'http://localhost/api/litellm');
  return { api, calls };
}

// ---------------------------------------------------------------------------
// expiryStatus
// ---------------------------------------------------------------------------

describe('expiryStatus', () => {
  test('returns null for undefined', () => {
    assert.strictEqual(expiryStatus(undefined), null);
  });

  test('returns expired for a past date', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    assert.strictEqual(expiryStatus(past), 'expired');
  });

  test('returns soon for a date < 7 days out', () => {
    const near = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(expiryStatus(near), 'soon');
  });

  test('returns ok for a date >= 7 days out', () => {
    const far = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(expiryStatus(far), 'ok');
  });
});

// ---------------------------------------------------------------------------
// LiteLlmApi — HTTP routing
// ---------------------------------------------------------------------------

describe('LiteLlmApi routing', () => {
  test('getUserInfo → GET /user/info', async () => {
    const { api, calls } = makeApi(200, { user_id: 'alice', spend: 0 });
    await api.getUserInfo();
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/user/info'), calls[0].url);
    assert.strictEqual(calls[0].init, undefined);
  });

  test('listKeys → GET /keys', async () => {
    const { api, calls } = makeApi(200, []);
    await api.listKeys();
    assert.ok(calls[0].url.endsWith('/keys'), calls[0].url);
  });

  test('generateKey → POST /keys/generate with JSON body', async () => {
    const { api, calls } = makeApi(200, { key: 'sk-x' });
    await api.generateKey({ alias: 'test' });
    assert.ok(calls[0].url.endsWith('/keys/generate'));
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.strictEqual(JSON.parse(calls[0].init?.body as string).alias, 'test');
  });

  test('updateKey → POST /keys/:id/update with encodeURIComponent', async () => {
    const { api, calls } = makeApi(200, { key: 'sk-x', spend: 0, created_at: '' });
    await api.updateKey('sk-abc/xyz', { key_alias: 'new' });
    assert.ok(calls[0].url.includes('sk-abc%2Fxyz'), calls[0].url);
    assert.ok(calls[0].url.endsWith('/update'));
    assert.strictEqual(calls[0].init?.method, 'POST');
  });

  test('deleteKey → DELETE /keys/:id', async () => {
    const { api, calls } = makeApi(200, { success: true });
    await api.deleteKey('sk-abc');
    assert.ok(calls[0].url.endsWith('/keys/sk-abc'), calls[0].url);
    assert.strictEqual(calls[0].init?.method, 'DELETE');
  });

  test('rotateKey → POST /keys/:id/regenerate', async () => {
    const { api, calls } = makeApi(200, { key: 'sk-new' });
    await api.rotateKey('sk-abc');
    assert.ok(calls[0].url.endsWith('/sk-abc/regenerate'), calls[0].url);
    assert.strictEqual(calls[0].init?.method, 'POST');
  });

  test('getUsage → GET /usage with date params', async () => {
    const { api, calls } = makeApi(200, {});
    await api.getUsage('2025-01-01', '2025-01-31');
    assert.ok(calls[0].url.includes('/usage'), calls[0].url);
    assert.ok(calls[0].url.includes('start_date=2025-01-01'), calls[0].url);
    assert.ok(calls[0].url.includes('end_date=2025-01-31'), calls[0].url);
  });

  test('getTeamUsage → GET /teams/:id/usage with date params', async () => {
    const { api, calls } = makeApi(200, {});
    await api.getTeamUsage('team/alpha', '2025-01-01', '2025-01-31');
    assert.ok(calls[0].url.includes('team%2Falpha'), calls[0].url);
    assert.ok(calls[0].url.includes('/usage'), calls[0].url);
    assert.ok(calls[0].url.includes('start_date='), calls[0].url);
  });
});

// ---------------------------------------------------------------------------
// LiteLlmApi — error handling
// ---------------------------------------------------------------------------

describe('LiteLlmApi errors', () => {
  test('throws on non-2xx with status and body', async () => {
    const { api } = makeApi(404, { message: 'not found' });
    await assert.rejects(
      () => api.getUserInfo(),
      (err: any) => {
        assert.strictEqual(err.status, 404);
        assert.deepStrictEqual(err.body, { message: 'not found' });
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// LiteLlmApi — getAuditLogs param serialization
// ---------------------------------------------------------------------------

describe('getAuditLogs', () => {
  test('includes only defined params', async () => {
    const { api, calls } = makeApi(200, { audit_logs: [], total: 0, page: 1, page_size: 10, total_pages: 0 });
    await api.getAuditLogs({ page: 2, action: 'update' });
    const url = calls[0].url;
    assert.ok(url.includes('page=2'), url);
    assert.ok(url.includes('action=update'), url);
    assert.ok(!url.includes('page_size'), url);
    assert.ok(!url.includes('start_date'), url);
  });

  test('omits all params when none provided', async () => {
    const { api, calls } = makeApi(200, { audit_logs: [], total: 0, page: 1, page_size: 10, total_pages: 0 });
    await api.getAuditLogs({});
    assert.ok(!calls[0].url.includes('?'), calls[0].url);
  });
});

// ---------------------------------------------------------------------------
// LiteLlmApi — pruneExpiredKeys
// ---------------------------------------------------------------------------

describe('pruneExpiredKeys', () => {
  test('returns 0 when no keys are expired', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { api } = makeApi(200, [{ key: 'sk-...1', token: 'sk-full', spend: 0, created_at: '', expires_at: future }]);
    const result = await api.pruneExpiredKeys();
    assert.strictEqual(result.pruned, 0);
  });

  test('deletes expired keys and returns count', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const calls: FetchCall[] = [];
    let requestCount = 0;
    const fetchApi = {
      fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = input.toString();
        calls.push({ url, init });
        requestCount++;
        // First call is listKeys, subsequent calls are deletes
        const body = requestCount === 1
          ? [
              { key: 'sk-...a', token: 'sk-hash-a', spend: 0, created_at: '', expires_at: past },
              { key: 'sk-...b', token: 'sk-hash-b', spend: 0, created_at: '', expires_at: future },
            ]
          : { success: true };
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => body,
          text: async () => '',
        } as unknown as Response;
      },
    };
    const api = new LiteLlmApi(fetchApi, 'http://localhost/api/litellm');
    const result = await api.pruneExpiredKeys();
    assert.strictEqual(result.pruned, 1);
    // The delete should use token (sk-hash-a), not the masked key (sk-...a)
    assert.ok(calls[1].url.includes('sk-hash-a'), calls[1].url);
    assert.strictEqual(calls[1].init?.method, 'DELETE');
  });

  test('falls back to key when token is absent', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const calls: FetchCall[] = [];
    let req = 0;
    const fetchApi = {
      fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = input.toString();
        calls.push({ url, init });
        req++;
        const body = req === 1
          ? [{ key: 'sk-...c', spend: 0, created_at: '', expires_at: past }]  // no token
          : { success: true };
        return { ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => '' } as unknown as Response;
      },
    };
    const api = new LiteLlmApi(fetchApi, 'http://localhost/api/litellm');
    await api.pruneExpiredKeys();
    assert.ok(calls[1].url.includes('sk-...c'), calls[1].url);
  });
});
