import { MCP_SERVER_NAME_RE } from '@acarmisc/backstage-plugin-litellm-common';

/** LiteLLM's documented value that denies every MCP server. */
export const NO_MCP_SERVERS = 'no-mcp-servers';

/**
 * MCP servers a team may bind to a key: exactly the team's own list, as stored
 * (LiteLLM accepts a server's name or id interchangeably when enforcing). A team
 * with no list gets nothing: "empty" means unrestricted to LiteLLM, but a key
 * list is a grant, so an unrestricted team must not let a member name servers it
 * was never given. Entries the mint schema would reject are dropped so the
 * picker never offers an unselectable name.
 *
 * shortcut: team `mcp_access_groups` are not expanded into server names; add
 * that when a team grants MCP access only through groups.
 */
export function teamMcpServers(
  team: { object_permission?: { mcp_servers?: string[] } } | undefined,
): string[] {
  const listed = team?.object_permission?.mcp_servers ?? [];
  return [...new Set(listed)].filter(n => MCP_SERVER_NAME_RE.test(n));
}

/**
 * Requested names that are not granted, de-duplicated. A team's list may hold a
 * server's id while a caller names it (or the reverse), so a request also counts
 * as granted when the gateway's listing links its name and id to an allowed entry.
 * Without `servers` only exact matches count.
 */
export function findDisallowedMcpServers(
  requested: string[],
  allowed: string[],
  servers: Array<{ id: string; name?: string }> = [],
): string[] {
  const ok = new Set(allowed);
  const granted = (n: string) =>
    ok.has(n) ||
    servers.some(
      s => (s.name === n || s.id === n) && (ok.has(s.id) || (s.name !== undefined && ok.has(s.name))),
    );
  return [...new Set(requested)].filter(n => !granted(n));
}
