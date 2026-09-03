import { describe, test } from 'node:test';
import assert from 'node:assert';
import { readTeamAdminConfig } from './teamAdmin';

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
