import { TeamInfo } from './types';

/**
 * Checks whether a user can manage members of a team (add/remove members).
 * A user is a member manager if:
 * - The feature is not in readOnly mode (teams synced from identity provider)
 * - There are configured memberManagerRoles
 * - The user is a member of the team with a role in memberManagerRoles
 */
export function isTeamMemberManager(
  team: TeamInfo | undefined,
  userId: string | undefined,
  memberManagerRoles: string[] | undefined,
  readOnly: boolean | undefined,
): boolean {
  if (!team || !userId || !memberManagerRoles || memberManagerRoles.length === 0 || readOnly) {
    return false;
  }
  return team.members_with_roles?.some(m => m.user_id === userId && memberManagerRoles.includes(m.role)) ?? false;
}
