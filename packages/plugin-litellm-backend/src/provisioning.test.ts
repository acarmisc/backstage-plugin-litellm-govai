import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  toLiteLLMUserId,
  readRoleConfigs,
  applyRoleOverrides,
  readProvisioningDefaults,
  ProvisioningError,
  getOrProvisionUser,
  effectiveUserId,
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
    getUserByEmail: (email: string) => Promise<any>;
    createUser: (payload: any) => Promise<any>;
  }>,
): any {
  return {
    getUserInfo: overrides.getUserInfo ?? (() => Promise.resolve(null)),
    getUserByEmail: overrides.getUserByEmail ?? (() => Promise.resolve(null)),
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
    debug: () => {},
  };
}

// ---------------------------------------------------------------------------
// toLiteLLMUserId
// ---------------------------------------------------------------------------

describe('toLiteLLMUserId', () => {
  test('strips namespace and suffixes domain when configured', () => {
    assert.strictEqual(toLiteLLMUserId('user:default/andrea.carmisciano', 'example.com'), 'andrea.carmisciano@example.com');
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
      getUserInfo: (_userId: any) => {
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
        // When createUser throws a generic Error (no .status), the catch
        // path maps it to a 502 with an "LiteLLM upstream error: <msg>" hint.
        assert.ok(err.body.hint.includes('LiteLLM upstream'));
        assert.ok(err.body.hint.includes('LiteLLM down'));
        assert.strictEqual(err.status, 502);
        return true;
      },
    );
  });

  test('provisions with role overrides when user matches group', async () => {
    let getUserCallCount = 0;
    let creationPayload: any;
    const client = mockClient({
      getUserInfo: (_userId: any) => {
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

  describe('existing user with the same email but another id', () => {
    const entity = (email: string) => ({ spec: { profile: { email } } });
    const emailUser = (id: string) => ({ user_id: id, user_email: id, teams: ['t1'] });

    test('adopts it instead of calling /user/new', async () => {
      const looked: string[] = [];
      let created = false;
      const client = mockClient({
        getUserInfo: async (id?: string) => (id === 'nb1@acme.it' ? emailUser(id) : null),
        getUserByEmail: async (email: string) => {
          looked.push(email);
          return emailUser(email);
        },
        createUser: async () => {
          created = true;
          return {};
        },
      });
      const run = () =>
        getOrProvisionUser(
          client, 'user:default/nb1', 'nb1', true, defaults, [],
          mockCatalogClient(entity('nb1@acme.it')), mockAuth(), silentLogger(),
        );

      const result = await run();
      assert.strictEqual(result.user_id, 'nb1@acme.it');
      assert.strictEqual(created, false);
      assert.strictEqual(effectiveUserId('nb1'), 'nb1@acme.it');

      // Later requests go straight to the adopted id.
      const again = await run();
      assert.strictEqual(again.user_id, 'nb1@acme.it');
      assert.deepStrictEqual(looked, ['nb1@acme.it']);
    });

    test('adopts it even when provisioning is disabled', async () => {
      const client = mockClient({
        getUserByEmail: async (email: string) => emailUser(email),
      });
      const result = await getOrProvisionUser(
        client, 'user:default/nb2', 'nb2', false, defaults, [],
        mockCatalogClient(entity('nb2@acme.it')), mockAuth(), silentLogger(),
      );
      assert.strictEqual(result.user_id, 'nb2@acme.it');
      assert.strictEqual(effectiveUserId('nb2'), 'nb2@acme.it');
    });

    test('recovers from "User with email … already exists" on /user/new', async () => {
      let emailLookups = 0;
      const client = mockClient({
        getUserInfo: async () => null,
        // Not found before creating (e.g. created by another replica in between).
        getUserByEmail: async (email: string) => (++emailLookups === 1 ? null : emailUser(email)),
        createUser: async () => {
          throw new Error(`LiteLLM 400: {'error': 'User with email nb3@acme.it already exists'}`);
        },
      });
      const result = await getOrProvisionUser(
        client, 'user:default/nb3', 'nb3', true, defaults, [],
        mockCatalogClient(entity('nb3@acme.it')), mockAuth(), silentLogger(),
      );
      assert.strictEqual(result.user_id, 'nb3@acme.it');
      assert.strictEqual(emailLookups, 2);
    });

    test('drops the adoption when the adopted user disappears', async () => {
      let adoptedExists = true;
      let derivedLookups = 0;
      const client = mockClient({
        getUserInfo: async (id?: string) => {
          if (id === 'nb4@acme.it') return adoptedExists ? emailUser(id) : null;
          // The derived id is missing at first, then exists (e.g. recreated by an admin).
          derivedLookups += 1;
          return derivedLookups === 1 ? null : { user_id: 'nb4', teams: [] };
        },
        getUserByEmail: async (email: string) => (adoptedExists ? emailUser(email) : null),
      });
      const run = () =>
        getOrProvisionUser(
          client, 'user:default/nb4', 'nb4', false, defaults, [],
          mockCatalogClient(entity('nb4@acme.it')), mockAuth(), silentLogger(),
        );
      assert.strictEqual((await run()).user_id, 'nb4@acme.it');
      adoptedExists = false;
      assert.strictEqual((await run()).user_id, 'nb4');
      assert.strictEqual(effectiveUserId('nb4'), 'nb4');
    });

    test('no catalog email means no lookup by email', async () => {
      let looked = false;
      const client = mockClient({
        getUserByEmail: async () => {
          looked = true;
          return null;
        },
      });
      await assert.rejects(
        getOrProvisionUser(
          client, 'user:default/nb5', 'nb5', false, defaults, [],
          mockCatalogClient(null), mockAuth(), silentLogger(),
        ),
        ProvisioningError,
      );
      assert.strictEqual(looked, false);
    });
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
