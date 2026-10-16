import { describe, it } from 'node:test';
import assert from 'node:assert';
import { findDisallowedMcpServers, teamMcpServers } from './mcpAccess';

describe('teamMcpServers', () => {
  it('returns exactly the team list, de-duplicated', () => {
    assert.deepStrictEqual(
      teamMcpServers({ object_permission: { mcp_servers: ['a', 'a', 'b'] } }),
      ['a', 'b'],
    );
  });

  it('grants nothing to a team without a list (empty means unrestricted, not a grant)', () => {
    assert.deepStrictEqual(teamMcpServers({}), []);
    assert.deepStrictEqual(teamMcpServers({ object_permission: {} }), []);
    assert.deepStrictEqual(teamMcpServers({ object_permission: { mcp_servers: [] } }), []);
    assert.deepStrictEqual(teamMcpServers(undefined), []);
  });

  it('drops entries the mint schema would reject', () => {
    assert.deepStrictEqual(
      teamMcpServers({ object_permission: { mcp_servers: ['ok.1', 'has space', 'a,b', ''] } }),
      ['ok.1'],
    );
  });
});

describe('findDisallowedMcpServers', () => {
  it('returns the unique names outside the allowed set', () => {
    assert.deepStrictEqual(findDisallowedMcpServers(['a', 'x', 'x'], ['a', 'b']), ['x']);
    assert.deepStrictEqual(findDisallowedMcpServers(['a'], ['a']), []);
    assert.deepStrictEqual(findDisallowedMcpServers(['a'], []), ['a']);
  });
});
