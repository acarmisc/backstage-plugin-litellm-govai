import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { readTeamAdminConfig, isTeamManagementEnabled, assertTeamAdmin } from './teamAdmin';
import * as provisioning from './provisioning';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

function mockConfig(values: Record<string, any> = {}): any {
  return {
    getOptional: (key: string) => values[key] ?? undefined,
    getOptionalString: (key: string) => values[key] ?? undefined,
    getOptionalBoolean: (key: string) => values[key] ?? undefined,
    getOptionalNumber: (key: string) => values[key] ?? undefined,
    getOptionalStringArray: (key: string) => values[key] ?? undefined,
  };
}

describe('readTeamAdminConfig', () => {
  test('returns fail-closed defaults when config is empty', () => {
    const config = mockConfig();
    const result = readTeamAdminConfig(config);
    assert.strictEqual(result.group, undefined);
    assert.deepStrictEqual(result.allowedModels, []);
    assert.deepStrictEqual(result.allowedModelAccessGroups, []);
    assert.strictEqual(result.maxBudgetCeiling, undefined);
    assert.strictEqual(result.allowUnlimitedBudget, false);
    assert.deepStrictEqual(result.allowedVectorStores, []);
    assert.deepStrictEqual(result.allowedMcpServers, []);
    assert.deepStrictEqual(result.allowedMcpAccessGroups, []);
    assert.strictEqual(result.allowTeamDelete, false);
  });

  test('reads fully-populated config correctly', () => {
    const config = mockConfig({
      'litellm.teamAdmin.group': 'group:default/litellm-team-admins',
      'litellm.teamAdmin.allowedModels': ['gpt-4o', 'gpt-4-turbo'],
      'litellm.teamAdmin.allowedModelAccessGroups': ['premium-models', 'ai-core'],
      'litellm.teamAdmin.maxBudgetCeiling': 5000,
      'litellm.teamAdmin.allowUnlimitedBudget': true,
      'litellm.teamAdmin.allowedVectorStores': ['kb-1', 'kb-2'],
      'litellm.teamAdmin.allowedMcpServers': ['mcp-server-1'],
      'litellm.teamAdmin.allowedMcpAccessGroups': ['mcp-group-1'],
      'litellm.teamAdmin.allowTeamDelete': true,
    });
    const result = readTeamAdminConfig(config);
    assert.strictEqual(result.group, 'group:default/litellm-team-admins');
    assert.deepStrictEqual(result.allowedModels, ['gpt-4o', 'gpt-4-turbo']);
    assert.deepStrictEqual(result.allowedModelAccessGroups, ['premium-models', 'ai-core']);
    assert.strictEqual(result.maxBudgetCeiling, 5000);
    assert.strictEqual(result.allowUnlimitedBudget, true);
    assert.deepStrictEqual(result.allowedVectorStores, ['kb-1', 'kb-2']);
    assert.deepStrictEqual(result.allowedMcpServers, ['mcp-server-1']);
    assert.deepStrictEqual(result.allowedMcpAccessGroups, ['mcp-group-1']);
    assert.strictEqual(result.allowTeamDelete, true);
  });

  test('booleans explicitly set to false stay false', () => {
    const config = mockConfig({
      'litellm.teamAdmin.allowUnlimitedBudget': false,
      'litellm.teamAdmin.allowTeamDelete': false,
    });
    const result = readTeamAdminConfig(config);
    assert.strictEqual(result.allowUnlimitedBudget, false);
    assert.strictEqual(result.allowTeamDelete, false);
  });

  test('arrays given as [] stay []', () => {
    const config = mockConfig({
      'litellm.teamAdmin.allowedModels': [],
      'litellm.teamAdmin.allowedModelAccessGroups': [],
      'litellm.teamAdmin.allowedVectorStores': [],
      'litellm.teamAdmin.allowedMcpServers': [],
      'litellm.teamAdmin.allowedMcpAccessGroups': [],
    });
    const result = readTeamAdminConfig(config);
    assert.deepStrictEqual(result.allowedModels, []);
    assert.deepStrictEqual(result.allowedModelAccessGroups, []);
    assert.deepStrictEqual(result.allowedVectorStores, []);
    assert.deepStrictEqual(result.allowedMcpServers, []);
    assert.deepStrictEqual(result.allowedMcpAccessGroups, []);
  });

  test('partial config merges with defaults', () => {
    const config = mockConfig({
      'litellm.teamAdmin.group': 'group:default/admins',
      'litellm.teamAdmin.allowedModels': ['gpt-4'],
    });
    const result = readTeamAdminConfig(config);
    assert.strictEqual(result.group, 'group:default/admins');
    assert.deepStrictEqual(result.allowedModels, ['gpt-4']);
    assert.deepStrictEqual(result.allowedModelAccessGroups, []);
    assert.strictEqual(result.maxBudgetCeiling, undefined);
    assert.strictEqual(result.allowUnlimitedBudget, false);
    assert.deepStrictEqual(result.allowedVectorStores, []);
  });
});

describe('isTeamManagementEnabled', () => {
  test('returns false when permission.enabled is unset', () => {
    const config = mockConfig({
      'litellm.teamAdmin.group': 'group:default/admins',
    });
    assert.strictEqual(isTeamManagementEnabled(config), false);
  });

  test('returns false when permission.enabled is true but no group is set', () => {
    const config = mockConfig({
      'permission.enabled': true,
    });
    assert.strictEqual(isTeamManagementEnabled(config), false);
  });

  test('returns true when both permission.enabled and group are set', () => {
    const config = mockConfig({
      'permission.enabled': true,
      'litellm.teamAdmin.group': 'group:default/admins',
    });
    assert.strictEqual(isTeamManagementEnabled(config), true);
  });

  test('returns false when permission.enabled is false even with group', () => {
    const config = mockConfig({
      'permission.enabled': false,
      'litellm.teamAdmin.group': 'group:default/admins',
    });
    assert.strictEqual(isTeamManagementEnabled(config), false);
  });
});

const mockPermission = (): any => ({
  name: 'litellm.team.create',
  attributes: { action: 'create' },
});

// Store original functions for restoration
const originalResolveUserId = provisioning.resolveUserId;
const originalResolveCredentials = provisioning.resolveCredentials;
const originalIsUserMemberOfGroup = provisioning.isUserMemberOfGroup;

describe('assertTeamAdmin', () => {
  afterEach(() => {
    // Restore original functions after each test
    (provisioning.resolveUserId as any) = originalResolveUserId;
    (provisioning.resolveCredentials as any) = originalResolveCredentials;
    (provisioning.isUserMemberOfGroup as any) = originalIsUserMemberOfGroup;
  });

  test('returns 401 when user is not authenticated', async () => {
    (provisioning.resolveUserId as any) = async () => undefined;

    const opts = {
      req: {} as any,
      auth: mockAuth(),
      permissions: mockPermissions(),
      catalogClient: mockCatalogClient(),
      teamAdminGroup: 'group:default/admins',
      permission: mockPermission(),
      logger: silentLogger(),
    };

    const result = await assertTeamAdmin(opts);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.ok(result.error.includes('Authentication'));
  });

  test('returns 403 when user is not in the admin group', async () => {
    (provisioning.resolveUserId as any) = async () => 'user:default/alice';
    (provisioning.resolveCredentials as any) = async () => ({});
    (provisioning.isUserMemberOfGroup as any) = async () => false;

    const opts = {
      req: {} as any,
      auth: mockAuth(),
      permissions: mockPermissions(),
      catalogClient: mockCatalogClient(),
      teamAdminGroup: 'group:default/admins',
      permission: mockPermission(),
      logger: silentLogger(),
    };

    const result = await assertTeamAdmin(opts);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.ok(result.error.includes('not a member'));
    assert.ok(result.error.includes('group:default/admins'));
  });

  test('returns 403 when permission is denied', async () => {
    (provisioning.resolveUserId as any) = async () => 'user:default/alice';
    (provisioning.resolveCredentials as any) = async () => ({});
    (provisioning.isUserMemberOfGroup as any) = async () => true;

    const opts = {
      req: {} as any,
      auth: mockAuth(),
      permissions: mockPermissions({ allow: false }),
      catalogClient: mockCatalogClient(),
      teamAdminGroup: 'group:default/admins',
      permission: mockPermission(),
      logger: silentLogger(),
    };

    const result = await assertTeamAdmin(opts);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.ok(result.error.includes('missing permission'));
    assert.ok(result.error.includes('litellm.team.create'));
  });

  test('returns ok with userEntityRef when all checks pass', async () => {
    (provisioning.resolveUserId as any) = async () => 'user:default/alice';
    (provisioning.resolveCredentials as any) = async () => ({});
    (provisioning.isUserMemberOfGroup as any) = async () => true;

    const opts = {
      req: {} as any,
      auth: mockAuth(),
      permissions: mockPermissions({ allow: true }),
      catalogClient: mockCatalogClient(),
      teamAdminGroup: 'group:default/admins',
      permission: mockPermission(),
      logger: silentLogger(),
    };

    const result = await assertTeamAdmin(opts);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.userEntityRef, 'user:default/alice');
  });

  test('returns 401 when credentials cannot be resolved', async () => {
    (provisioning.resolveUserId as any) = async () => 'user:default/alice';
    (provisioning.resolveCredentials as any) = async () => undefined;

    const opts = {
      req: {} as any,
      auth: mockAuth(),
      permissions: mockPermissions(),
      catalogClient: mockCatalogClient(),
      teamAdminGroup: 'group:default/admins',
      permission: mockPermission(),
      logger: silentLogger(),
    };

    const result = await assertTeamAdmin(opts);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
  });
});

function mockAuth(overrides: any = {}): any {
  return {
    getPluginRequestToken: async () => ({ token: 'mock-token' }),
    getOwnServiceCredentials: async () => ({}),
    authenticate: async () => ({}),
    ...overrides,
  };
}

function mockPermissions(overrides: any = {}): any {
  const allow = overrides.allow !== undefined ? overrides.allow : true;
  return {
    authorize: async () => [
      {
        result: allow ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
      },
    ],
  };
}

function mockCatalogClient(overrides: any = {}): any {
  const isMember = overrides.isMember !== undefined ? overrides.isMember : true;
  return {
    getEntityByRef: async () => {
      if (isMember) {
        return {
          relations: [{ type: 'memberOf', targetRef: 'group:default/admins' }],
        };
      }
      return { relations: [] };
    },
  };
}

function silentLogger(): any {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
  };
}
