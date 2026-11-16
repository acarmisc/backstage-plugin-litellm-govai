import type { SpendLogEntry } from '@acarmisc/backstage-plugin-litellm-common';

export interface UserAgg {
  userId: string;
  teams: string[];
  spend: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

export interface BreakdownRow {
  name: string;
  spend: number;
  tokens: number;
  requests: number;
}

const UNKNOWN = 'unknown';

/** One row per user; rows with no user id are grouped under "unknown". */
export function aggregateUsers(rows: SpendLogEntry[]): UserAgg[] {
  const byUser = new Map<string, UserAgg & { teamSet: Set<string> }>();
  for (const r of rows) {
    const id = r.userId || UNKNOWN;
    let u = byUser.get(id);
    if (!u) {
      u = {
        userId: id,
        teams: [],
        teamSet: new Set(),
        spend: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
      byUser.set(id, u);
    }
    if (r.teamId) u.teamSet.add(r.teamId);
    u.spend += r.spend ?? 0;
    u.promptTokens += r.promptTokens ?? 0;
    u.completionTokens += r.completionTokens ?? 0;
    u.totalTokens += r.totalTokens ?? 0;
    u.requests += 1;
  }
  return [...byUser.values()].map(({ teamSet, ...u }) => ({ ...u, teams: [...teamSet].sort() }));
}

function breakdown(
  rows: SpendLogEntry[],
  keys: (r: SpendLogEntry) => string[],
): BreakdownRow[] {
  const m = new Map<string, BreakdownRow>();
  for (const r of rows) {
    for (const name of keys(r)) {
      const b = m.get(name) ?? { name, spend: 0, tokens: 0, requests: 0 };
      b.spend += r.spend ?? 0;
      b.tokens += r.totalTokens ?? 0;
      b.requests += 1;
      m.set(name, b);
    }
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend || b.requests - a.requests);
}

export const byModel = (rows: SpendLogEntry[]) => breakdown(rows, r => [r.model || UNKNOWN]);

/** "OpenCode/1.2 (linux)" and "OpenCode/1.3" are the same client. */
export const clientName = (ua?: string) => (ua ? ua.split(/[\s/]/)[0] || UNKNOWN : UNKNOWN);

export const byUserAgent = (rows: SpendLogEntry[]) =>
  breakdown(rows, r => [clientName(r.userAgent)]);

/** A request with several tags counts once under each. Untagged rows are skipped. */
export const byTag = (rows: SpendLogEntry[]) =>
  breakdown(rows.filter(r => r.tags?.length), r => r.tags ?? []);
