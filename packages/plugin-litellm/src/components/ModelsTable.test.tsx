import '../testing/setupDom';
import { TestTheme } from '../testing/TestTheme';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen } from '@testing-library/react';
import { ModelsTable } from './ModelsTable';
import { ModelInfo, TeamInfo } from '../types';

afterEach(() => cleanup());

const models: ModelInfo[] = [
  { model_name: 'gpt-a', mode: 'chat' },
  { model_name: 'gpt-b', mode: 'chat' },
];
const team: TeamInfo = { team_id: 'team-1', team_alias: 'Team A', models: [], spend: 0 };

const renderTable = (props: { personalOnly?: boolean; userModels?: string[] }) =>
  render(
    <TestTheme>
      <ModelsTable allModels={models} teams={[team]} loading={false} {...props} />
    </TestTheme>,
  );

describe('ModelsTable with litellm.keyGeneration.personalOnly', () => {
  test("lists only the user's models, with no Team dropdown", () => {
    renderTable({ personalOnly: true, userModels: ['gpt-a'] });
    assert.ok(screen.getByText('gpt-a'));
    assert.ok(!screen.queryByText('gpt-b'), 'gpt-b is listed');
    assert.ok(!screen.queryByLabelText(/^Team/), 'the Team dropdown is shown');
    assert.ok(!screen.queryByText(/Select a team/), 'a "Select a team" text is shown');
    assert.ok(screen.getByText('1 model'));
    assert.strictEqual(screen.getByLabelText('Filter Models').hasAttribute('disabled'), false);
  });

  test('an unrestricted user sees every model', () => {
    renderTable({ personalOnly: true, userModels: [] });
    assert.ok(screen.getByText('gpt-a'));
    assert.ok(screen.getByText('gpt-b'));
    assert.ok(screen.getByText('2 models'));
  });

  test('a user with no usable model sees the empty state', () => {
    renderTable({ personalOnly: true, userModels: ['nothing-matches'] });
    assert.ok(screen.getByText('No models are available to your account'));
    assert.ok(screen.getByText('Ask an admin to give your LiteLLM user access to models'));
    assert.ok(!screen.queryByText('gpt-a'), 'gpt-a is listed');
  });

  test('unset: the Team dropdown and the "Select a team" prompt still show', () => {
    renderTable({});
    assert.ok(screen.getByLabelText(/^Team/));
    assert.ok(screen.getByText('Select a team to see available models'));
    assert.ok(!screen.queryByText('gpt-a'), 'gpt-a is listed');
  });
});
