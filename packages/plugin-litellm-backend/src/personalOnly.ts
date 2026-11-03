import { Config } from '@backstage/config';
import { readRoleConfigs } from './provisioning';

/**
 * litellm.keyGeneration.personalOnly: every key belongs to its user alone,
 * and Backstage shows no teams. These are the errors the routes answer with.
 */
export const PERSONAL_ONLY_TEAM_ID_ERROR =
  'team_id is not allowed: keys are personal (litellm.keyGeneration.personalOnly)';
export const PERSONAL_ONLY_TEAM_PARAM_ERROR =
  'team is not allowed: keys are personal (litellm.keyGeneration.personalOnly)';
export const PERSONAL_ONLY_TEAMS_DISABLED_ERROR =
  'Teams are disabled (litellm.keyGeneration.personalOnly)';

/**
 * Team settings that contradict personalOnly, in a fixed order. Empty when
 * there are none.
 */
export function personalOnlyConflicts(config: Config): string[] {
  const conflicts: string[] = [];
  if (config.getOptionalBoolean('litellm.keyGeneration.teamRequired') === true) {
    conflicts.push('litellm.keyGeneration.teamRequired');
  }
  if (config.getOptionalString('litellm.teamAdmin.group')) {
    conflicts.push('litellm.teamAdmin.group');
  }
  if (config.getOptionalStringArray('litellm.provisioning.defaults.teams')?.length) {
    conflicts.push('litellm.provisioning.defaults.teams');
  }
  readRoleConfigs(config).forEach((role, i) => {
    if (role.teams?.length) conflicts.push(`litellm.provisioning.roles[${i}].teams`);
  });
  if (config.getOptionalBoolean('litellm.opencode.requireTeam') === true) {
    conflicts.push('litellm.opencode.requireTeam');
  }
  return conflicts;
}

/**
 * Fails plugin startup when personalOnly is combined with team settings, so a
 * half-applied config never runs. Lists every conflict at once.
 */
export function assertPersonalOnlyConfig(config: Config): void {
  const conflicts = personalOnlyConflicts(config);
  if (conflicts.length > 0) {
    throw new Error(
      `litellm.keyGeneration.personalOnly is true, so remove these team settings: ${conflicts.join(', ')}`,
    );
  }
}
