import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LiteLLMClient, LiteLLMUpstreamError } from './client';

const mockConfig = {
  baseUrl: 'http://localhost:8000',
  masterKey: 'sk-test-key-12345',
};

let fetchCalls: Array<{ url: string; init: RequestInit }> = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(
  response: any,
  options: { status?: number; ok?: boolean } = {},
) {
  const { status = 200, ok = true } = options;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init: init || {} });
    return {
      ok,
      status,
      statusText: status === 200 ? 'OK' : 'Bad Request',
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as any;
  };
}

describe('LiteLLMClient team CRUD methods', () => {
  test('createTeam POSTs to /team/new with payload', async () => {
    const payload = {
      team_alias: 'new-team',
      models: ['gpt-4'],
      max_budget: 1000,
    };
    const response = { team_id: 't1', team_alias: 'new-team' };
    stubFetch(response);

    const client = new LiteLLMClient(mockConfig);
    const result = await client.createTeam(payload);

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('/team/new'));
    assert.strictEqual(fetchCalls[0].init.method, 'POST');
    assert.deepStrictEqual(JSON.parse(fetchCalls[0].init.body as string), payload);
    assert.strictEqual(
      (fetchCalls[0].init.headers as Record<string, string>)?.Authorization,
      `Bearer ${mockConfig.masterKey}`,
    );
    assert.deepStrictEqual(result, response);
  });

  test('updateTeam POSTs to /team/update with team_id in body', async () => {
    const payload = {
      team_id: 't1',
      models: ['gpt-4o'],
      max_budget: 2000,
    };
    stubFetch({ team_id: 't1' });

    const client = new LiteLLMClient(mockConfig);
    await client.updateTeam(payload);

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('/team/update'));
    assert.strictEqual(fetchCalls[0].init.method, 'POST');
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.strictEqual(body.team_id, 't1');
    assert.deepStrictEqual(body.models, ['gpt-4o']);
  });

  test('deleteTeam POSTs to /team/delete with team_ids array', async () => {
    stubFetch({ success: true });

    const client = new LiteLLMClient(mockConfig);
    await client.deleteTeam('t1');

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('/team/delete'));
    assert.strictEqual(fetchCalls[0].init.method, 'POST');
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.deepStrictEqual(body, { team_ids: ['t1'] });
  });

  test('blockTeam POSTs to /team/block with team_id', async () => {
    stubFetch({ success: true });

    const client = new LiteLLMClient(mockConfig);
    await client.blockTeam('t1');

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('/team/block'));
    assert.strictEqual(fetchCalls[0].init.method, 'POST');
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.deepStrictEqual(body, { team_id: 't1' });
  });

  test('unblockTeam POSTs to /team/unblock with team_id', async () => {
    stubFetch({ success: true });

    const client = new LiteLLMClient(mockConfig);
    await client.unblockTeam('t1');

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('/team/unblock'));
    assert.strictEqual(fetchCalls[0].init.method, 'POST');
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.deepStrictEqual(body, { team_id: 't1' });
  });

  test('getTeamInfo surfaces metadata, object_permission, blocked, team_member_budget', async () => {
    const response = {
      team_info: {
        team_id: 't1',
        team_alias: 'my-team',
        metadata: { department: 'ai-team' },
        object_permission: {
          vector_stores: ['kb-1'],
          mcp_servers: ['mcp-server-1'],
          mcp_access_groups: ['mcp-group-1'],
        },
        blocked: true,
        team_member_budget: 500,
      },
    };
    stubFetch(response);

    const client = new LiteLLMClient(mockConfig);
    const result = await client.getTeamInfo('t1');

    assert.deepStrictEqual(result.metadata, { department: 'ai-team' });
    assert.deepStrictEqual(result.object_permission, {
      vector_stores: ['kb-1'],
      mcp_servers: ['mcp-server-1'],
      mcp_access_groups: ['mcp-group-1'],
    });
    assert.strictEqual(result.blocked, true);
    assert.strictEqual(result.team_member_budget, 500);
  });

  test('getTeamInfo with missing optional fields returns undefined for them', async () => {
    const response = {
      team_info: {
        team_id: 't1',
        spend: 50,
      },
    };
    stubFetch(response);

    const client = new LiteLLMClient(mockConfig);
    const result = await client.getTeamInfo('t1');

    assert.strictEqual(result.metadata, undefined);
    assert.strictEqual(result.object_permission, undefined);
    assert.strictEqual(result.blocked, undefined);
    assert.strictEqual(result.team_member_budget, undefined);
  });

  test('non-2xx response throws LiteLLMUpstreamError', async () => {
    stubFetch({ error: { message: 'team not found' } }, { status: 400, ok: false });

    const client = new LiteLLMClient(mockConfig);

    await assert.rejects(
      client.createTeam({ team_alias: 'bad' }),
      (err: any) => {
        assert.ok(err instanceof LiteLLMUpstreamError);
        assert.strictEqual(err.status, 400);
        return true;
      },
    );
  });

  test('Authorization header uses Bearer token', async () => {
    stubFetch({ team_id: 't1' });

    const client = new LiteLLMClient(mockConfig);
    await client.createTeam({ team_alias: 'test' });

    const auth = (fetchCalls[0].init.headers as Record<string, string>)?.Authorization;
    assert.strictEqual(auth, `Bearer ${mockConfig.masterKey}`);
  });

  test('listTeams GETs /team/list and surfaces metadata on each row', async () => {
    stubFetch([
      { team_id: 't1', spend: 0, metadata: { owning_group: 'group:default/admins' } },
      { team_info: { team_id: 't2', spend: 5, metadata: { owning_group: 'group:default/other' } } },
    ]);

    const client = new LiteLLMClient(mockConfig);
    const result = await client.listTeams();

    assert.ok(fetchCalls[0].url.endsWith('/team/list'), fetchCalls[0].url);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].team_id, 't1');
    assert.deepStrictEqual(result[0].metadata, { owning_group: 'group:default/admins' });
    // second row was wrapped in a team_info envelope — must be unwrapped
    assert.strictEqual(result[1].team_id, 't2');
    assert.deepStrictEqual(result[1].metadata, { owning_group: 'group:default/other' });
  });

  test('listTeams tolerates { teams: [...] } and { data: [...] } shapes', async () => {
    stubFetch({ teams: [{ team_id: 'a', spend: 0 }] });
    let client = new LiteLLMClient(mockConfig);
    let result = await client.listTeams();
    assert.deepStrictEqual(result.map(t => t.team_id), ['a']);

    stubFetch({ data: [{ team_id: 'b', spend: 0 }, { team_id: 'c', spend: 0 }] });
    client = new LiteLLMClient(mockConfig);
    result = await client.listTeams();
    assert.deepStrictEqual(result.map(t => t.team_id), ['b', 'c']);
  });

  test('listTeams returns [] for an unrecognised shape', async () => {
    stubFetch({ unexpected: true });
    const client = new LiteLLMClient(mockConfig);
    const result = await client.listTeams();
    assert.deepStrictEqual(result, []);
  });

  test('teamMemberAdd POSTs /team/member_add with the member nested', async () => {
    stubFetch({ team_id: 't1' });
    const client = new LiteLLMClient(mockConfig);
    await client.teamMemberAdd({ team_id: 't1', user_id: 'alice@example.com' });

    assert.ok(fetchCalls[0].url.endsWith('/team/member_add'), fetchCalls[0].url);
    assert.strictEqual(fetchCalls[0].init.method, 'POST');
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.deepStrictEqual(body, {
      team_id: 't1',
      member: { user_id: 'alice@example.com', role: 'user' },
    });
  });

  test('teamMemberAdd includes max_budget_in_team when given', async () => {
    stubFetch({});
    const client = new LiteLLMClient(mockConfig);
    await client.teamMemberAdd({
      team_id: 't1',
      user_id: 'bob',
      max_budget_in_team: 25,
    });
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.strictEqual(body.max_budget_in_team, 25);
    assert.strictEqual(body.member.role, 'user');
  });

  test('teamMemberDelete POSTs /team/member_delete with team_id + user_id', async () => {
    stubFetch({});
    const client = new LiteLLMClient(mockConfig);
    await client.teamMemberDelete({ team_id: 't1', user_id: 'alice@example.com' });

    assert.ok(fetchCalls[0].url.endsWith('/team/member_delete'), fetchCalls[0].url);
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.deepStrictEqual(body, { team_id: 't1', user_id: 'alice@example.com' });
  });

  test('teamMemberAdd surfaces a non-2xx as LiteLLMUpstreamError', async () => {
    stubFetch({ error: { message: 'team not found' } }, { status: 404, ok: false });
    const client = new LiteLLMClient(mockConfig);
    await assert.rejects(
      client.teamMemberAdd({ team_id: 'nope', user_id: 'x' }),
      (err: any) => err instanceof LiteLLMUpstreamError && err.status === 404,
    );
  });
});
