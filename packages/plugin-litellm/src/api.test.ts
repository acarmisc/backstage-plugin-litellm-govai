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

  test('getManagedTeams → GET /teams/managed', async () => {
    const teams = [{ team_id: 't1', spend: 0 }];
    const { api, calls } = makeApi(200, teams);
    const result = await api.getManagedTeams();
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/teams/managed'), calls[0].url);
    assert.strictEqual(calls[0].init, undefined);
    assert.deepStrictEqual(result, teams);
  });

  test('getConfig → GET /config', async () => {
    const { api, calls } = makeApi(200, { baseUrl: 'https://llm-gw.example.com' });
    const config = await api.getConfig();
    assert.strictEqual(calls[0].url.endsWith('/config'), true, calls[0].url);
    assert.strictEqual(config.baseUrl, 'https://llm-gw.example.com');
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

  test('uses body.error as the message when present', async () => {
    const { api } = makeApi(502, { error: 'LiteLLM rejected the key duration for this team.' });
    await assert.rejects(
      () => api.generateKey({ alias: 'x' }),
      (err: any) => {
        assert.strictEqual(err.message, 'LiteLLM rejected the key duration for this team.');
        return true;
      },
    );
  });

  test('falls back to status text when body has no error field', async () => {
    const { api } = makeApi(404, { message: 'not found' });
    await assert.rejects(
      () => api.getUserInfo(),
      (err: any) => {
        assert.strictEqual(err.message, '404 Not Found');
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

describe('createTeam', () => {
  test('POST /teams with payload round-trip', async () => {
    const { api, calls } = makeApi(200, { team_id: 't123', team_alias: 'squad-a' });
    const req = { team_alias: 'squad-a', models: ['gpt-4o'], max_budget: 500 };
    const result = await api.createTeam(req);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/teams'), calls[0].url);
    assert.strictEqual(calls[0].init?.method, 'POST');
    const body = JSON.parse(calls[0].init?.body as string);
    assert.deepStrictEqual(body, req);
    assert.strictEqual(result.team_id, 't123');
  });

  test('throws on non-2xx', async () => {
    const { api } = makeApi(400, { error: 'Invalid model' });
    await assert.rejects(
      () => api.createTeam({ team_alias: 'bad', models: [] }),
      /Invalid model/,
    );
  });
});

describe('updateTeam', () => {
  test('PATCH /teams/:id with payload round-trip', async () => {
    const { api, calls } = makeApi(200, { team_id: 't123', max_budget: 250 });
    const req = { max_budget: 250 };
    const result = await api.updateTeam('t123', req);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].url.includes('/teams/t123'), calls[0].url);
    assert.strictEqual(calls[0].init?.method, 'PATCH');
    const body = JSON.parse(calls[0].init?.body as string);
    assert.deepStrictEqual(body, req);
    assert.strictEqual(result.team_id, 't123');
  });

  test('encodes teamId in URL', async () => {
    const { api, calls } = makeApi(200, { team_id: 'team/id' });
    await api.updateTeam('team/id', {});
    assert.ok(calls[0].url.includes('team%2Fid'), calls[0].url);
  });
});

describe('team members', () => {
  test('addTeamMember → POST /teams/:id/members with body round-trip', async () => {
    const { api, calls } = makeApi(200, { team_id: 't1', members_with_roles: [] });
    const body = { userEntityRef: 'user:default/alice', maxBudgetInTeam: 25 };
    const result = await api.addTeamMember('t1', body);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/teams/t1/members'), calls[0].url);
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.deepStrictEqual(JSON.parse(calls[0].init?.body as string), body);
    assert.strictEqual(result.team_id, 't1');
  });

  test('removeTeamMember → DELETE with userEntityRef query param, encoded', async () => {
    const { api, calls } = makeApi(200, { team_id: 't1' });
    await api.removeTeamMember('t1', 'user:default/alice');
    assert.strictEqual(calls[0].init?.method, 'DELETE');
    assert.ok(
      calls[0].url.includes(
        '/teams/t1/members?userEntityRef=user%3Adefault%2Falice',
      ),
      calls[0].url,
    );
  });
});

describe('team knowledge bases', () => {
  test('getVectorStores → GET /vector-stores', async () => {
    const stores = [{ id: 'vs_1', name: 'HR' }];
    const { api, calls } = makeApi(200, stores);
    const result = await api.getVectorStores();
    assert.ok(calls[0].url.endsWith('/vector-stores'), calls[0].url);
    assert.strictEqual(calls[0].init, undefined);
    assert.deepStrictEqual(result, stores);
  });

  test('setTeamKnowledgeBases → PUT /teams/:id/knowledge-bases with body', async () => {
    const { api, calls } = makeApi(200, { team_id: 't1' });
    await api.setTeamKnowledgeBases('t1', ['vs_1', 'vs_2']);
    assert.ok(
      calls[0].url.endsWith('/teams/t1/knowledge-bases'),
      calls[0].url,
    );
    assert.strictEqual(calls[0].init?.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(calls[0].init?.body as string), {
      vector_stores: ['vs_1', 'vs_2'],
    });
  });

  test('getMcpServers → GET /mcp-servers', async () => {
    const servers = [{ id: 'mcp_1', name: 'GitHub' }];
    const { api, calls } = makeApi(200, servers);
    const result = await api.getMcpServers();
    assert.ok(calls[0].url.endsWith('/mcp-servers'), calls[0].url);
    assert.deepStrictEqual(result, servers);
  });

  test('setTeamMcpServers → PUT /teams/:id/mcp-servers with body', async () => {
    const { api, calls } = makeApi(200, { team_id: 't1' });
    await api.setTeamMcpServers('t1', ['mcp_1']);
    assert.ok(calls[0].url.endsWith('/teams/t1/mcp-servers'), calls[0].url);
    assert.strictEqual(calls[0].init?.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(calls[0].init?.body as string), {
      mcp_servers: ['mcp_1'],
    });
  });
});
