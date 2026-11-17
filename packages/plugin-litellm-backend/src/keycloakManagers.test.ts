import { test } from 'node:test';
import assert from 'node:assert';
import { managersGroupTransformer } from './keycloakManagers';

test('copies the managers attribute into the annotation', async () => {
  const out = await managersGroupTransformer()(
    { metadata: { annotations: { a: 'b' } } },
    { attributes: { managers: ['alice@x.it', 'bob, carol'] } },
    'realm',
  );
  assert.deepStrictEqual(out.metadata.annotations, { a: 'b', 'govai.litellm/managers': 'alice,bob,carol' });
});

test('leaves groups without the attribute untouched', async () => {
  const e = { metadata: {} };
  assert.strictEqual(await managersGroupTransformer()(e, {}, 'r'), e);
});
