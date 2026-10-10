import { Config } from '@backstage/config';
import {
  TeamInfo,
  TeamMemberUsage,
  TeamMemberUsageRow,
  UsageMetrics,
  VirtualKey,
} from './types';

/** `litellm.teamUsage.memberBreakdown`: who may see a team's per-member usage. */
export interface MemberBreakdownConfig {
  /** Off by default: the route returns 404 and the UI hides the table. */
  enabled: boolean;
  /** LiteLLM team roles (e.g. "admin") whose holders may view their own team's breakdown. */
  viewerRoles: string[];
  /** Whether `litellm.team.usage.read` may grant access (needs `permission.enabled`). */
  permissionEnabled: boolean;
}

export function readMemberBreakdownConfig(config: Config): MemberBreakdownConfig {
  return {
    enabled:
      config.getOptionalBoolean('litellm.teamUsage.memberBreakdown.enabled') ?? false,
    viewerRoles:
      config.getOptionalStringArray('litellm.teamUsage.memberBreakdown.viewerRoles') ?? [],
    permissionEnabled: config.getOptionalBoolean('permission.enabled') ?? false,
  };
}

/** Catalog profile of a member, keyed by lower-cased email. */
export type MemberProfiles = Map<string, { displayName?: string }>;

/**
 * Emails worth looking up in the catalog for the members of a breakdown:
 * the team roster's emails and email-shaped user ids.
 */
export function memberEmails(team: TeamInfo, keys: VirtualKey[]): string[] {
  const emails = new Set<string>();
  for (const m of team.members_with_roles ?? []) {
    if (m.user_email) emails.add(m.user_email.toLowerCase());
    else if (m.user_id?.includes('@')) emails.add(m.user_id.toLowerCase());
  }
  for (const k of keys) {
    if (k.user_id?.includes('@')) emails.add(k.user_id.toLowerCase());
  }
  return [...emails];
}

/**
 * Attributes a team's usage to its members. Each key in the team's daily
 * activity is credited to the key's owner (from `/key/list?team_id=`), so the
 * rows add up to the team total. Activity of keys with no known owner
 * (deleted keys, keys without a user) lands in one `user_id: null` row.
 * Team members without activity get zero rows.
 */
export function buildTeamMemberUsage(
  teamId: string,
  usage: UsageMetrics,
  keys: VirtualKey[],
  team: TeamInfo,
  profiles: MemberProfiles = new Map(),
): TeamMemberUsage {
  const rows = new Map<string | null, TeamMemberUsageRow>();
  const rowFor = (userId: string | null): TeamMemberUsageRow => {
    let row = rows.get(userId);
    if (!row) {
      row = {
        user_id: userId,
        spend: 0,
        spend_share_pct: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        api_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        success_rate: null,
        key_count: 0,
      };
      rows.set(userId, row);
    }
    return row;
  };

  for (const m of team.members_with_roles ?? []) {
    if (!m.user_id) continue;
    const row = rowFor(m.user_id);
    row.role = m.role;
    if (m.user_email) row.user_email = m.user_email;
  }

  const ownerByKey = new Map<string, string>();
  for (const k of keys) {
    if (!k.user_id || !k.token) continue;
    ownerByKey.set(k.token, k.user_id);
    rowFor(k.user_id).key_count += 1;
  }

  for (const [keyHash, k] of Object.entries(usage.usage_by_key ?? {})) {
    const row = rowFor(ownerByKey.get(keyHash) ?? null);
    row.spend += k.total_spend ?? 0;
    row.prompt_tokens += k.prompt_tokens ?? 0;
    row.completion_tokens += k.completion_tokens ?? 0;
    row.total_tokens += k.total_tokens ?? 0;
    row.api_requests += k.api_requests ?? 0;
    row.successful_requests += k.successful_requests ?? 0;
    row.failed_requests += k.failed_requests ?? 0;
  }

  const members = [...rows.values()];
  const totalSpend = members.reduce((sum, r) => sum + r.spend, 0);
  for (const row of members) {
    row.spend_share_pct = totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0;
    const finished = row.successful_requests + row.failed_requests;
    row.success_rate = finished > 0 ? (row.successful_requests / finished) * 100 : null;
    if (!row.user_email && row.user_id?.includes('@')) row.user_email = row.user_id;
    const profile = row.user_email && profiles.get(row.user_email.toLowerCase());
    if (profile && profile.displayName) row.display_name = profile.displayName;
  }

  members.sort(
    (a, b) =>
      b.spend - a.spend ||
      b.total_tokens - a.total_tokens ||
      String(a.user_id ?? '￿').localeCompare(String(b.user_id ?? '￿')),
  );

  return { team_id: teamId, total_spend: totalSpend, members };
}

/**
 * Hides dollar amounts: spend becomes 0 and `spend_share_pct` remains the
 * way to compare members. Tokens and requests are kept.
 */
export function redactTeamMemberUsage(usage: TeamMemberUsage): TeamMemberUsage {
  return {
    ...usage,
    total_spend: 0,
    budget_hidden: true,
    members: usage.members.map(m => ({ ...m, spend: 0 })),
  };
}
