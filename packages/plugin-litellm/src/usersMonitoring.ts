import type { SpendLogEntry, UserKeyUsage } from '@acarmisc/backstage-plugin-litellm-common';

export interface UserAgg {
  /** Unique user|team|key combination. */
  id: string;
  /** Display name: user id, else email, else key alias. */
  userId: string;
  userEmail?: string;
  teamId?: string;
  keyHash: string;
  keyAlias?: string;
  /** Key without a user id (service account). */
  serviceKey: boolean;
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

/** LiteLLM already aggregates per key, so each row maps to one UserAgg. */
export function aggregateUsers(rows: UserKeyUsage[]): UserAgg[] {
  return rows.map(r => ({
    id: `${r.userId || 'service'}|${r.teamId ?? ''}|${r.keyHash}`,
    userId: r.userId || r.userEmail || r.keyAlias || UNKNOWN,
    userEmail: r.userEmail,
    teamId: r.teamId,
    keyHash: r.keyHash,
    keyAlias: r.keyAlias,
    serviceKey: !r.userId,
    spend: r.spend ?? 0,
    promptTokens: r.promptTokens ?? 0,
    completionTokens: r.completionTokens ?? 0,
    totalTokens: r.totalTokens ?? 0,
    requests: r.requests ?? 0,
  }));
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
