import { describe, test } from 'node:test';
import assert from 'node:assert';
import { ConfigReader } from '@backstage/config';
import { assertPersonalOnlyConfig, personalOnlyConflicts } from './personalOnly';

const config = (litellm: Record<string, any>) => new ConfigReader({ litellm });

describe('personalOnlyConflicts', () => {
  test('none for an empty config', () => {
    assert.deepStrictEqual(personalOnlyConflicts(config({})), []);
  });

  test('none for team settings that are off or empty', () => {
    const c = config({
      keyGeneration: { personalOnly: true, teamRequired: false },
      provisioning: {
        defaults: { teams: [] },
        roles: [{ group: 'group:default/a', teams: [] }, { group: 'group:default/b' }],
      },
      opencode: { enabled: true, requireTeam: false },
    });
    assert.deepStrictEqual(personalOnlyConflicts(c), []);
  });

  test('each team setting is reported by its key', () => {
    const cases: [Record<string, any>, string[]][] = [
      [{ keyGeneration: { teamRequired: true } }, ['litellm.keyGeneration.teamRequired']],
      [{ teamAdmin: { group: 'group:default/admins' } }, ['litellm.teamAdmin.group']],
      [{ provisioning: { defaults: { teams: ['t1'] } } }, ['litellm.provisioning.defaults.teams']],
      [
        { provisioning: { roles: [{ group: 'a', teams: ['t1'] }, { group: 'b' }, { group: 'c', teams: ['t2'] }] } },
        ['litellm.provisioning.roles[0].teams', 'litellm.provisioning.roles[2].teams'],
      ],
      [{ opencode: { requireTeam: true } }, ['litellm.opencode.requireTeam']],
    ];
    for (const [litellm, expected] of cases) {
      assert.deepStrictEqual(personalOnlyConflicts(config(litellm)), expected, JSON.stringify(litellm));
    }
  });

  test('lists every conflict in a fixed order', () => {
    const c = config({
      opencode: { requireTeam: true },
      provisioning: { roles: [{ group: 'a', teams: ['t1'] }], defaults: { teams: ['t1'] } },
      teamAdmin: { group: 'group:default/admins' },
      keyGeneration: { personalOnly: true, teamRequired: true },
    });
    assert.deepStrictEqual(personalOnlyConflicts(c), [
      'litellm.keyGeneration.teamRequired',
      'litellm.teamAdmin.group',
      'litellm.provisioning.defaults.teams',
      'litellm.provisioning.roles[0].teams',
      'litellm.opencode.requireTeam',
    ]);
  });
});

describe('assertPersonalOnlyConfig', () => {
  test('passes without conflicts', () => {
    assert.doesNotThrow(() => assertPersonalOnlyConfig(config({ keyGeneration: { personalOnly: true } })));
  });

  test('throws one error naming every conflict', () => {
    const c = config({
      keyGeneration: { personalOnly: true, teamRequired: true },
      opencode: { requireTeam: true },
    });
    assert.throws(() => assertPersonalOnlyConfig(c), {
      message:
        'litellm.keyGeneration.personalOnly is true, so remove these team settings: ' +
        'litellm.keyGeneration.teamRequired, litellm.opencode.requireTeam',
    });
  });
});
