/** Starter-snippet tabs the key dialog can show, in default order. */
export const KEY_SNIPPET_TABS = ['office365', 'opencode', 'claude-code', 'pi', 'openai', 'curl'] as const;
export type KeySnippetTab = (typeof KEY_SNIPPET_TABS)[number];

/**
 * Reads litellm.display.keySnippets. Omitted means every tab in default order.
 * Throws at startup on an empty, unknown or duplicated list so a typo fails loudly.
 */
export function parseKeySnippetTabs(raw: string[] | undefined): KeySnippetTab[] {
  if (raw === undefined) return [...KEY_SNIPPET_TABS];
  if (raw.length === 0) {
    throw new Error('litellm.display.keySnippets must list at least one tab');
  }
  const allowed: readonly string[] = KEY_SNIPPET_TABS;
  const unknown = raw.filter(tab => !allowed.includes(tab));
  if (unknown.length > 0) {
    throw new Error(
      `litellm.display.keySnippets: unknown tab(s) ${unknown.join(', ')}. Allowed: ${KEY_SNIPPET_TABS.join(', ')}`,
    );
  }
  if (new Set(raw).size !== raw.length) {
    throw new Error('litellm.display.keySnippets lists a tab more than once');
  }
  return raw as KeySnippetTab[];
}
