import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  toLiteLLMUserId,
  readRoleConfigs,
  applyRoleOverrides,
  readProvisioningDefaults,
  ProvisioningError,
  getOrProvisionUser,
} from './provisioning';

// ---------------------------------------------------------------------------
// Minimal mock factories — avoid heavy frameworks, keep dependencies minimal
// ---------------------------------------------------------------------------

function mockConfig(values: Record<string, any> = {}): any {
  return {
    getString: (key: string) => values[key],
    getOptionalString: (key: string) => values[key] ?? undefined,
    getOptionalBoolean: (key: string) => values[key] ?? undefined,
    getOptionalNumber: (key: string) => values[key] ?? undefined,
    getOptionalStringArray: (key: string) => values[key] ?? undefined,
    getOptional: (key: string) => values[key] ?? undefined,
  };
}

function mockClient(
  overrides: Partial<{
    getUserInfo: (userId?: string) => Promise<any>;
    createUser: (payload: any) => Promise<any>;
  }>,
): any {
  return {
    getUserInfo: overrides.getUserInfo ?? (() => Promise.resolve(null)),
    createUser: overrides.createUser ?? (() => Promise.resolve({})),
  };
}

function mockCatalogClient(entity: any = null): any {
  return {
    getEntityByRef: () => Promise.resolve(entity),
  };
}

function mockAuth(token = 'mock-token'): any {
  return {
    getPluginRequestToken: async () => ({ token }),
    getOwnServiceCredentials: async () => ({}),
  };
}

function silentLogger(): any {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
  };
}

// ---------------------------------------------------------------------------
// toLiteLLMUserId
// ---------------------------------------------------------------------------

describe('toLiteLLMUserId', () => {
  test('strips namespace and suffixes domain when configured', () => {
    assert.strictEqual(toLiteLLMUserId('user:default/andrea.carmisciano', 'abstract.it'), 'andrea.carmisciano@abstract.it');
  });

  test('returns bare name when no domain is configured', () => {
    assert.strictEqual(toLiteLLMUserId('user:default/john.doe'), 'john.doe');
  });

  test('falls back to full ref when there is no slash', () => {
    const raw = 'plain-name';
    assert.strictEqual(toLiteLLMUserId(raw, 'example.com'), 'plain-name@example.com');
  });
});

// ---------------------------------------------------------------------------
// readProvisioningDefaults
// ---------------------------------------------------------------------------

describe('readProvisioningDefaults', () => {
  test('returns safe defaults when config is empty', () => {
    const config = mockConfig();
    const result = readProvisioningDefaults(config);
    assert.strictEqual(result.enabled, false);
    assert.strictEqual(result.defaults.maxBudget, 10);
    assert.strictEqual(result.defaults.budgetDuration, '30d');
    assert.deepStrictEqual(result.defaults.models, []);
    assert.deepStrictEqual(result.defaults.teams, []);
    assert.strictEqual(result.defaults.tpmLimit, undefined);
    assert.strictEqual(result.defaults.rpmLimit, undefined);
  });

  test('reads explicit values from config', () => {
    const config = mockConfig({
      'litellm.provisioning.enabled': true,
      'litellm.provisioning.defaults.maxBudget': 42,
      'litellm.provisioning.defaults.budgetDuration': '7d',
      'litellm.provisioning.defaults.models': ['gpt-4o'],
      'litellm.provisioning.defaults.teams': ['team-1'],
      'litellm.provisioning.defaults.tpmLimit': 100,
      'litellm.provisioning.defaults.rpmLimit': 200,
    });
    const result = readProvisioningDefaults(config);
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.defaults.maxBudget, 42);
    assert.strictEqual(result.defaults.budgetDuration, '7d');
    assert.deepStrictEqual(result.defaults.models, ['gpt-4o']);
    assert.deepStrictEqual(result.defaults.teams, ['team-1']);
    assert.strictEqual(result.defaults.tpmLimit, 100);
    assert.strictEqual(result.defaults.rpmLimit, 200);
  });
});

// ---------------------------------------------------------------------------
// readRoleConfigs
// ---------------------------------------------------------------------------

describe('readRoleConfigs', () => {
  test('returns empty array when no roles configured', () => {
    const config = mockConfig();
    assert.deepStrictEqual(readRoleConfigs(config), []);
  });

  test('parses role definitions', () => {
    const config = mockConfig({
      'litellm.provisioning.roles': [
        { group: 'group:default/admins', maxBudget: 100, models: ['gpt-4o'] },
        { group: 'group:default/users', maxBudget: 5 },
      ],
    });
    const roles = readRoleConfigs(config);
    assert.strictEqual(roles.length, 2);
    assert.strictEqual(roles[0].group, 'group:default/admins');
    assert.strictEqual(roles[0].maxBudget, 100);
    assert.deepStrictEqual(roles[0].models, ['gpt-4o']);
    assert.strictEqual(roles[1].group, 'group:default/users');
    assert.strictEqual(roles[1].maxBudget, 5);
  });
});

// ---------------------------------------------------------------------------
// applyRoleOverrides
// ---------------------------------------------------------------------------

describe('applyRoleOverrides', () => {
  const defaults: any = {
    maxBudget: 10,
    budgetDuration: '30d',
    models: [],
    teams: [],
    metadata: { source: 'default' },
  };

  test('overrides only explicitly-set fields', () => {
    const role: any = { group: 'g', maxBudget: 50 };
    const result = applyRoleOverrides(defaults, role);
    assert.strictEqual(result.maxBudget, 50);
    assert.strictEqual(result.budgetDuration, '30d');
    assert.deepStrictEqual(result.models, []);
    assert.deepStrictEqual(result.teams, []);
    assert.deepStrictEqual(result.metadata, { source: 'default' });
  });

  test('merges metadata objects', () => {
    const role: any = { group: 'g', metadata: { team: 'alpha' } };
    const result = applyRoleOverrides(defaults, role);
    assert.deepStrictEqual(result.metadata, { source: 'default', team: 'alpha' });
  });
});

// ---------------------------------------------------------------------------
// ProvisioningError
// ---------------------------------------------------------------------------

describe('ProvisioningError', () => {
  test('stores message, hint, and provisioning flag', () => {
    const err = new ProvisioningError('Not found', 'Go create the user', true);
    assert.strictEqual(err.status, 404);
    assert.strictEqual(err.body.error, 'Not found');
    assert.strictEqual(err.body.hint, 'Go create the user');
    assert.strictEqual(err.body.provisioning, true);
  });
});

// ---------------------------------------------------------------------------
// getOrProvisionUser — the core orchestration function
// ---------------------------------------------------------------------------

describe('getOrProvisionUser', () => {
  const defaults: any = { maxBudget: 10, budgetDuration: '30d', models: [], teams: [], metadata: {} };

  test('returns existing user without provisioning', async () => {
    const existing = { user_id: 'alice', spend: 0 };
    const client = mockClient({ getUserInfo: () => Promise.resolve(existing) });
    const result = await getOrProvisionUser(
      client,
      'user:default/alice',
      'alice',
      false,               // disabled
      defaults,
      [],
      mockCatalogClient(),
      mockAuth(),
      silentLogger(),
    );
    assert.deepStrictEqual(result, existing);
  });

  test('provisions a new user when enabled and user is missing', async () => {
    let getUserCallCount = 0;
    const created = { user_id: 'bob', spend: 0 };
    let creationCalled = false;
    const client = mockClient({
      getUserInfo: (userId: any) => {
        getUserCallCount++;
        // First call -> missing; subsequent call (after createUser) -> exists
        return Promise.resolve(getUserCallCount === 1 ? null : created);
      },
      createUser: (payload: any) => {
        creationCalled = true;
        assert.strictEqual(payload.user_id, 'bob');
        assert.strictEqual(payload.max_budget, 10);
        return Promise.resolve({});
      },
    });

    const result = await getOrProvisionUser(
      client,
      'user:default/bob',
      'bob',
      true,                // enabled
      defaults,
      [],
      mockCatalogClient(),
      mockAuth(),
      silentLogger(),
    );

    assert.strictEqual(creationCalled, true);
    assert.deepStrictEqual(result, created);
  });

  test('throws ProvisioningError when disabled and user is missing', async () => {
    const client = mockClient({ getUserInfo: () => Promise.resolve(null) });

    await assert.rejects(
      getOrProvisionUser(
        client,
        'user:default/charlie',
        'charlie',
        false,               // disabled
        defaults,
        [],
        mockCatalogClient(),
        mockAuth(),
        silentLogger(),
      ),
      (err: any) => {
        assert.ok(err instanceof ProvisioningError);
        assert.strictEqual(err.body.provisioning, false);
        assert.ok(err.body.hint.includes('Enable litellm.provisioning.enabled'));
        return true;
      },
    );
  });

  test('throws ProvisioningError when provisioning fails', async () => {
    const client = mockClient({
      getUserInfo: () => Promise.resolve(null),
      createUser: () => Promise.reject(new Error('LiteLLM down')),
    });

    await assert.rejects(
      getOrProvisionUser(
        client,
        'user:default/dave',
        'dave',
        true,                // enabled, but createUser will throw
        defaults,
        [],
        mockCatalogClient(),
        mockAuth(),
        silentLogger(),
      ),
      (err: any) => {
        assert.ok(err instanceof ProvisioningError);
        assert.strictEqual(err.body.provisioning, true);
        assert.ok(err.body.hint.includes('Provisioning attempted but failed'));
        return true;
      },
    );
  });

  test('provisions with role overrides when user matches group', async () => {
    let getUserCallCount = 0;
    let creationPayload: any;
    const client = mockClient({
      getUserInfo: (userId: any) => {
        getUserCallCount++;
        // First call returns null (missing), second call returns created user
        return Promise.resolve(getUserCallCount === 1 ? null : { user_id: 'eve', spend: 0 });
      },
      createUser: (payload: any) => {
        creationPayload = payload;
        return Promise.resolve({});
      },
    });

    const catalogEntity = {
      relations: [
        { type: 'memberOf', targetRef: 'group:default/admins' },
      ],
    };

    const roleConfigs = [
      { group: 'group:default/admins', maxBudget: 999 },
      { group: 'group:default/users', maxBudget: 1 },
    ];

    const result = await getOrProvisionUser(
      client,
      'user:default/eve',
      'eve',
      true,
      defaults,
      roleConfigs,
      mockCatalogClient(catalogEntity),
      mockAuth(),
      silentLogger(),
    );

    assert.deepStrictEqual(result, { user_id: 'eve', spend: 0 });
    assert.strictEqual(creationPayload.max_budget, 999);   // role override applied
  });

  test('does not provision when no userId is resolved', async () => {
    const client = mockClient({ getUserInfo: () => Promise.resolve(null) });

    await assert.rejects(
      getOrProvisionUser(
        client,
        undefined,           // no token entity ref
        undefined,           // no user id
        true,                // provisioning enabled does not matter
        defaults,
        [],
        mockCatalogClient(),
        mockAuth(),
        silentLogger(),
      ),
      (err: any) => {
        assert.ok(err instanceof ProvisioningError);
        assert.strictEqual(err.body.error, 'User not found in LiteLLM');
        assert.ok(err.body.hint.includes('No user identity could be resolved'));
        return true;
      },
    );
  });
});
