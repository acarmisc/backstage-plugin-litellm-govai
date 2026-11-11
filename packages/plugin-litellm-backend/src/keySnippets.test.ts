import { describe, test } from 'node:test';
import assert from 'node:assert';
import { KEY_SNIPPET_TABS, parseKeySnippetTabs } from './keySnippets';

describe('parseKeySnippetTabs', () => {
  test('omitted config returns every tab in default order, Office365 first', () => {
    assert.deepStrictEqual(parseKeySnippetTabs(undefined), [...KEY_SNIPPET_TABS]);
    assert.strictEqual(KEY_SNIPPET_TABS[0], 'office365');
  });

  test('keeps the configured subset and order', () => {
    assert.deepStrictEqual(parseKeySnippetTabs(['curl', 'opencode']), ['curl', 'opencode']);
  });

  test('rejects an empty list', () => {
    assert.throws(() => parseKeySnippetTabs([]), /at least one tab/);
  });

  test('rejects an unknown tab and names it', () => {
    assert.throws(() => parseKeySnippetTabs(['office-365']), /unknown tab\(s\) office-365/);
  });

  test('rejects a duplicated tab', () => {
    assert.throws(() => parseKeySnippetTabs(['pi', 'pi']), /more than once/);
  });
});
