import { describe, test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createRouter } from './router';

// ---------------------------------------------------------------------------
// Minimal fakes — mirror the style used in bridge.test.ts / provisioning.test.ts.
// ---------------------------------------------------------------------------

function mockConfig(values: Record<string, any> = {}): any {
  return {
    getString: (key: string) => values[key] ?? 'unused',
    getOptionalString: (key: string) => values[key] ?? undefined,
    getOptionalBoolean: (key: string) => values[key] ?? undefined,
    getOptionalNumber: (key: string) => values[key] ?? undefined,
    getOptionalStringArray: (key: string) => values[key] ?? undefined,
    getOptional: (key: string) => values[key] ?? undefined,
  };
}

function silentLogger(): any {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

/** Resolves 'Bearer <token>' to a Backstage user principal for known tokens only. */
function fakeAuth(tokenToEntityRef: Record<string, string>): any {
  return {
    authenticate: async (token: string) => {
      const userEntityRef = tokenToEntityRef[token];
      if (!userEntityRef) throw new Error('invalid token');
      return { principal: { type: 'user', userEntityRef } };
    },
  };
}

const fakeDiscovery: any = {
  getBaseUrl: async () => 'http://localhost/api/catalog',
};

/** Fake LiteLLMClient. Records every mutating call so tests can assert on them. */
function fakeClient(keysByUser: Record<string, { key: string; token: string }[]>) {
  const calls: Record<string, any[]> = {
    regenerateKey: [],
    updateKey: [],
    deleteKeys: [],
    blockKey: [],
    unblockKey: [],
    resetKeySpend: [],
  };
  return {
    calls,
    listKeys: async (userId?: string) => keysByUser[userId ?? ''] ?? [],
    regenerateKey: async (token: string) => {
      calls.regenerateKey.push(token);
      return { key: 'sk-rotated' };
    },
    updateKey: async (req: any) => {
      calls.updateKey.push(req);
      return { ...req };
    },
    deleteKeys: async (req: any) => {
      calls.deleteKeys.push(req);
      return { success: true };
    },
    blockKey: async (key: string) => {
      calls.blockKey.push(key);
      return {};
    },
    unblockKey: async (key: string) => {
      calls.unblockKey.push(key);
      return {};
    },
    resetKeySpend: async (key: string) => {
      calls.resetKeySpend.push(key);
      return {};
    },
  } as any;
}

async function startServer(client: any) {
  const auth = fakeAuth({
    'alice-token': 'user:default/alice',
    'mallory-token': 'user:default/mallory',
  });
  const router = await createRouter({
    config: mockConfig(),
    logger: silentLogger(),
    auth,
    discovery: fakeDiscovery,
    client,
  });
  const app = express();
  app.use('/api/litellm', router);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api/litellm`;
  return { server, baseUrl };
}

async function stop(server: http.Server) {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// Ownership check on key-mutation routes
// ---------------------------------------------------------------------------

describe('key-mutation routes enforce ownership', () => {
  test('owner can delete their own key', async () => {
    const client = fakeClient({
      alice: [{ key: 'sk-...aaaa', token: 'alice-key-token' }],
    });
    const { server, baseUrl } = await startServer(client);
    try {
      const res = await fetch(`${baseUrl}/keys/alice-key-token`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer alice-token' },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(client.calls.deleteKeys, [{ keys: ['alice-key-token'] }]);
    } finally {
      await stop(server);
    }
  });

  test('a different authenticated user cannot delete someone else\'s key', async () => {
    const client = fakeClient({
      alice: [{ key: 'sk-...aaaa', token: 'alice-key-token' }],
      mallory: [],
    });
    const { server, baseUrl } = await startServer(client);
    try {
      const res = await fetch(`${baseUrl}/keys/alice-key-token`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer mallory-token' },
      });
      assert.equal(res.status, 404);
      assert.equal(client.calls.deleteKeys.length, 0);
    } finally {
      await stop(server);
    }
  });

  test('unauthenticated requests are rejected before touching the key', async () => {
    const client = fakeClient({
      alice: [{ key: 'sk-...aaaa', token: 'alice-key-token' }],
    });
    const { server, baseUrl } = await startServer(client);
    try {
      const res = await fetch(`${baseUrl}/keys/alice-key-token`, { method: 'DELETE' });
      assert.equal(res.status, 401);
      assert.equal(client.calls.deleteKeys.length, 0);
    } finally {
      await stop(server);
    }
  });

  test('a non-owner cannot rotate, block, unblock, or reset spend on a key that is not theirs', async () => {
    const client = fakeClient({
      alice: [{ key: 'sk-...aaaa', token: 'alice-key-token' }],
      mallory: [],
    });
    const { server, baseUrl } = await startServer(client);
    try {
      const mutations: [string, string][] = [
        ['/keys/alice-key-token/regenerate', 'POST'],
        ['/keys/alice-key-token/block', 'POST'],
        ['/keys/alice-key-token/unblock', 'POST'],
        ['/keys/alice-key-token/reset_spend', 'POST'],
        ['/keys/alice-key-token/update', 'POST'],
      ];
      for (const [path, method] of mutations) {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { Authorization: 'Bearer mallory-token', 'Content-Type': 'application/json' },
          body: method === 'POST' ? '{}' : undefined,
        });
        assert.equal(res.status, 404, `${method} ${path} should 404 for a non-owner`);
      }
      assert.equal(client.calls.regenerateKey.length, 0);
      assert.equal(client.calls.blockKey.length, 0);
      assert.equal(client.calls.unblockKey.length, 0);
      assert.equal(client.calls.resetKeySpend.length, 0);
      assert.equal(client.calls.updateKey.length, 0);
    } finally {
      await stop(server);
    }
  });

  test('the owner can still rotate, block, unblock, and reset spend on their own key', async () => {
    const client = fakeClient({
      alice: [{ key: 'sk-...aaaa', token: 'alice-key-token' }],
    });
    const { server, baseUrl } = await startServer(client);
    try {
      const mutations: [string, string][] = [
        ['/keys/alice-key-token/regenerate', 'POST'],
        ['/keys/alice-key-token/block', 'POST'],
        ['/keys/alice-key-token/unblock', 'POST'],
        ['/keys/alice-key-token/reset_spend', 'POST'],
      ];
      for (const [path, method] of mutations) {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { Authorization: 'Bearer alice-token', 'Content-Type': 'application/json' },
          body: '{}',
        });
        assert.equal(res.status, 200, `${method} ${path} should succeed for the owner`);
      }
      assert.equal(client.calls.regenerateKey.length, 1);
      assert.equal(client.calls.blockKey.length, 1);
      assert.equal(client.calls.unblockKey.length, 1);
      assert.equal(client.calls.resetKeySpend.length, 1);
    } finally {
      await stop(server);
    }
  });

  test('matches ownership by masked key value too, not just the hashed token', async () => {
    const client = fakeClient({
      alice: [{ key: 'sk-...aaaa', token: 'alice-key-token' }],
    });
    const { server, baseUrl } = await startServer(client);
    try {
      const res = await fetch(`${baseUrl}/keys/sk-...aaaa`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer alice-token' },
      });
      assert.equal(res.status, 200);
    } finally {
      await stop(server);
    }
  });
});
