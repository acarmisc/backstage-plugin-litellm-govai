import { describe, it } from 'node:test';
import assert from 'node:assert';
import { findDisallowedModels } from './modelAccess';

describe('findDisallowedModels', () => {
  it('merges access groups across deployments of the same model name', async () => {
    const client = {
      listModels: async () => [
        { model_name: 'gpt-4', access_groups: ['a'] },
        { model_name: 'gpt-4', access_groups: ['b'] },
      ],
    } as any;
    assert.deepStrictEqual(await findDisallowedModels(client, ['gpt-4'], ['b']), []);
    assert.deepStrictEqual(await findDisallowedModels(client, ['gpt-4'], ['c']), ['gpt-4']);
  });

  it('does not read the catalogue when every model matches literally', async () => {
    let reads = 0;
    const client = { listModels: async () => { reads++; return []; } } as any;
    assert.deepStrictEqual(await findDisallowedModels(client, ['gpt-4'], ['gpt-4']), []);
    assert.strictEqual(reads, 0);
  });

  it('fails closed when the catalogue cannot be read', async () => {
    const client = { listModels: async () => { throw new Error('down'); } } as any;
    await assert.rejects(() => findDisallowedModels(client, ['x'], ['gpt-4']));
  });
});
