import { describe, test } from 'node:test';
import assert from 'node:assert';
import { DEFAULT_SNIPPET_TABS, buildSnippets, resolveSnippetTabs } from './KeySnippets';

describe('resolveSnippetTabs', () => {
  test('defaults to every tab with Office365 first', () => {
    assert.deepStrictEqual(resolveSnippetTabs(undefined), DEFAULT_SNIPPET_TABS);
    assert.strictEqual(DEFAULT_SNIPPET_TABS[0], 'office365');
  });

  test('keeps the configured order and drops unknown names', () => {
    assert.deepStrictEqual(resolveSnippetTabs(['curl', 'nope', 'opencode']), ['curl', 'opencode']);
  });

  test('falls back to the default set when nothing known is configured', () => {
    assert.deepStrictEqual(resolveSnippetTabs([]), DEFAULT_SNIPPET_TABS);
    assert.deepStrictEqual(resolveSnippetTabs(['toString']), DEFAULT_SNIPPET_TABS);
  });
});

describe('buildSnippets tabs', () => {
  test('carries the configured tabs onto the snippets', () => {
    const s = buildSnippets('https://gw.example.com', 'sk-test', 'gpt-4', ['pi', 'office365']);
    assert.deepStrictEqual(s.tabs, ['pi', 'office365']);
  });
});
