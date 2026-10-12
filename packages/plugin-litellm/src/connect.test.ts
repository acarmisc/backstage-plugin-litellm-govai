import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initialTeams, isLoopbackCallback } from './connect';

describe('isLoopbackCallback', () => {
  it('accepts loopback /callback URIs', () => {
    assert.ok(isLoopbackCallback('http://localhost:51234/callback'));
    assert.ok(isLoopbackCallback('http://127.0.0.1:8080/callback'));
  });

  it('rejects anything that could leak keys elsewhere', () => {
    for (const uri of [
      null,
      '',
      'https://localhost:1/callback',
      'http://evil.example.com/callback',
      'http://localhost.evil.com/callback',
      'http://localhost:1/other',
      'http://localhost:1/callback?x=1',
      'http://user@evil.com/callback',
      // eslint-disable-next-line no-script-url -- the rejected input under test
      'javascript:alert(1)',
    ]) {
      assert.strictEqual(isLoopbackCallback(uri), false, String(uri));
    }
  });
});

describe('initialTeams', () => {
  it('ticks every team on a first connect', () => {
    assert.deepStrictEqual([...initialTeams(['a', 'b'], new Set())], ['a', 'b']);
  });
  it('ticks only the teams the client has no key for', () => {
    assert.deepStrictEqual([...initialTeams(['a', 'b', 'c'], new Set(['a', 'c']))], ['b']);
    assert.deepStrictEqual([...initialTeams(['a'], new Set(['a']))], []);
  });
});
