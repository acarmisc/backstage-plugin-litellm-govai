import { describe, test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
} from 'jose';
import {
  KeycloakJWTVerifier,
  BridgeAuthError,
  resolveBridgeUserId,
  getOrProvisionUserFromClaims,
  bridgeListKeys,
  bridgeGenerateKey,
} from './bridge';
import { ProvisioningError } from './provisioning';

// ---------------------------------------------------------------------------
// Minimal mock factories — mirror provisioning.test.ts style.
// ---------------------------------------------------------------------------

function mockConfig(values: Record<string, any> = {}): any {
  return {
    getString: (key: string) => values[key],
    getOptionalString: (key: string) => values[key] ?? undefined,
    getOptionalBoolean: (key: string) => values[key] ?? undefined,
    getOptionalNumber: (key: string) => values[key] ?? undefined,
    getOptional: (key: string) => values[key] ?? undefined,
  };
}

function silentLogger(): any {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

const defaults = {
  maxBudget: 10,
  budgetDuration: '30d',
  models: [] as string[],
  teams: [] as string[],
  tpmLimit: undefined as number | undefined,
  rpmLimit: undefined as number | undefined,
  userRole: undefined as string | undefined,
  metadata: {} as Record<string, string>,
};

/**
 * Mock LiteLLMClient. `userInfo` is returned by getUserInfo; if it is a
 * function it is called (so the second call in the provision path can return
 * the freshly-created user). createUser/updateUser/listKeys/generateKey are
 * recorded for assertions.
 */
function mockClient(opts: {
  userInfo?: any;
  createUser?: (p: any) => Promise<any>;
  listKeys?: (uid: string) => Promise<any[]>;
  generateKey?: (r: any) => Promise<any>;
}): any {
  const calls: Record<string, any[]> = {
    createUser: [],
    updateUser: [],
    getUserInfo: [],
  };
  let getUserInfoSeq = Array.isArray(opts.userInfo)
    ? [...opts.userInfo]
    : opts.userInfo !== undefined
      ? [opts.userInfo]
      : [null];
  return {
    calls,
    getUserInfo: (uid?: string) => {
      calls.getUserInfo.push(uid);
      const next = getUserInfoSeq.shift();
      const value = typeof next === 'function' ? next() : next;
      return Promise.resolve(value === undefined ? null : value);
    },
    createUser: (p: any) => {
      calls.createUser.push(p);
      return opts.createUser
        ? opts.createUser(p)
        : Promise.resolve({ user_id: p.user_id });
    },
    updateUser: (p: any) => {
      calls.updateUser.push(p);
      return Promise.resolve({});
    },
    listKeys: (uid?: string) =>
      opts.listKeys ? opts.listKeys(uid!) : Promise.resolve([]),
    generateKey: (r: any) =>
      opts.generateKey
        ? opts.generateKey(r)
        : Promise.resolve({ key: 'sk-test', key_alias: r.key_alias, ...r }),
  };
}

// ---------------------------------------------------------------------------
// resolveBridgeUserId
// ---------------------------------------------------------------------------

describe('resolveBridgeUserId', () => {
  test('prefers email over username over sub', () => {
    assert.equal(
      resolveBridgeUserId({
        sub: 's1',
        email: 'a@b.it',
        preferred_username: 'alice',
      }),
      'a@b.it',
    );
    assert.equal(
      resolveBridgeUserId({ sub: 's1', preferred_username: 'alice' }),
      'alice',
    );
    assert.equal(resolveBridgeUserId({ sub: 's1' }), 's1');
  });
});

// ---------------------------------------------------------------------------
// getOrProvisionUserFromClaims
// ---------------------------------------------------------------------------

describe('getOrProvisionUserFromClaims', () => {
  const claims = {
    sub: 's1',
    email: 'alice@abstract.it',
    preferred_username: 'alice@abstract.it',
    azp: 'abby-cli',
  };

  test('returns the existing user without provisioning', async () => {
    const c = mockClient({ userInfo: { user_id: 'alice@abstract.it' } });
    const u = await getOrProvisionUserFromClaims(
      c,
      claims,
      true,
      defaults,
      silentLogger(),
    );
    assert.equal(u.user_id, 'alice@abstract.it');
    assert.equal(c.calls.createUser.length, 0);
  });

  test('404 when missing and provisioning disabled', async () => {
    const c = mockClient({ userInfo: null });
    await assert.rejects(
      () =>
        getOrProvisionUserFromClaims(
          c,
          claims,
          false,
          defaults,
          silentLogger(),
        ),
      (err: unknown) =>
        err instanceof ProvisioningError && err.status === 404,
    );
    assert.equal(c.calls.createUser.length, 0);
  });

  test('provisions from claims when enabled and user is missing', async () => {
    // getUserInfo: first call (existence check) → null, second call (after
    // create) → the created user.
    const c = mockClient({
      userInfo: [
        null,
        { user_id: 'alice@abstract.it', user_email: 'alice@abstract.it' },
      ],
    });
    const u = await getOrProvisionUserFromClaims(
      c,
      claims,
      true,
      defaults,
      silentLogger(),
    );
    assert.equal(u.user_id, 'alice@abstract.it');
    assert.equal(c.calls.createUser.length, 1);
    // The provision payload carries the email from the JWT claims.
    assert.equal(c.calls.createUser[0].user_email, 'alice@abstract.it');
    assert.equal(c.calls.createUser[0].user_id, 'alice@abstract.it');
  });
});

// ---------------------------------------------------------------------------
// bridgeListKeys / bridgeGenerateKey
// ---------------------------------------------------------------------------

describe('bridgeListKeys', () => {
  test('provisions then lists keys for the resolved user', async () => {
    const c = mockClient({
      userInfo: { user_id: 'alice@abstract.it' },
      listKeys: (uid: string) =>
        Promise.resolve([
          { key: 'sk-...1234', token: 'sk-full', user_id: uid },
        ]),
    });
    const keys = await bridgeListKeys(
      c,
      { sub: 's1', email: 'alice@abstract.it', azp: 'abby-cli' },
      true,
      defaults,
      silentLogger(),
    );
    assert.equal(keys.length, 1);
    assert.equal(keys[0].user_id, 'alice@abstract.it');
  });
});

describe('bridgeGenerateKey', () => {
  test('provisions then mints a key stamped with ownership metadata', async () => {
    let captured: any;
    const c = mockClient({
      userInfo: { user_id: 'alice@abstract.it' },
      generateKey: (r: any) => {
        captured = r;
        return Promise.resolve({ key: 'sk-new' });
      },
    });
    const res = await bridgeGenerateKey(
      c,
      { sub: 's1', email: 'alice@abstract.it', azp: 'abby-cli' },
      true,
      defaults,
      silentLogger(),
      { alias: 'abby-laptop', models: ['glm-5.2:cloud'] },
    );
    assert.equal(res.key, 'sk-new');
    // The bridge owns: resolving user_id, passing alias through (the real
    // LiteLLMClient renames alias -> key_alias), and stamping ownership
    // metadata. Verify all three.
    assert.equal(captured.user_id, 'alice@abstract.it');
    assert.equal(captured.alias, 'abby-laptop');
    assert.deepEqual(captured.models, ['glm-5.2:cloud']);
    assert.equal(captured.metadata.created_via, 'abby-cli');
    assert.equal(captured.metadata.created_by, 'alice@abstract.it');
  });
});

// ---------------------------------------------------------------------------
// KeycloakJWTVerifier — integration test with a local JWKS server
// ---------------------------------------------------------------------------

describe('KeycloakJWTVerifier', () => {
  let server: http.Server;
  let issuer: string;
  let privateKey: any;
  let kid: string;

  async function sign(overrides: Record<string, unknown> = {}, azp = 'abby-cli') {
    const payload = {
      sub: 's1',
      email: 'alice@abstract.it',
      preferred_username: 'alice@abstract.it',
      azp,
      ...overrides,
    };
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(privateKey);
  }

  test('verifies a valid token, rejects bad azp / issuer / signature / expired', async () => {
    // Generate an RSA keypair and serve its public key as a JWKS.
    const { publicKey, privateKey: pk } = await generateKeyPair('RS256');
    privateKey = pk;
    kid = 'test-kid-1';
    const jwk = { ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'RS256' };

    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.url === '/protocol/openid-connect/certs') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as any).port;
    issuer = `http://127.0.0.1:${port}`;
    const verifier = new KeycloakJWTVerifier({
      issuer,
      clientId: 'abby-cli',
    });

    // valid
    const claims = await verifier.verify(await sign());
    assert.equal(claims.email, 'alice@abstract.it');
    assert.equal(claims.azp, 'abby-cli');

    // wrong azp
    await assert.rejects(
      async () => verifier.verify(await sign({}, 'other-client')),
      (e: unknown) => e instanceof BridgeAuthError,
    );

    // wrong issuer
    await assert.rejects(
      async () =>
        verifier.verify(
          await new SignJWT({ sub: 's1', azp: 'abby-cli' })
            .setProtectedHeader({ alg: 'RS256', kid })
            .setIssuer('https://evil/realm/x')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey),
        ),
      (e: unknown) => e instanceof BridgeAuthError,
    );

    // tampered signature
    const good = await sign();
    const tampered = good.slice(0, -4) + 'aaaa';
    await assert.rejects(
      () => verifier.verify(tampered),
      (e: unknown) => e instanceof BridgeAuthError,
    );

    // expired
    const expired = await new SignJWT({
      sub: 's1',
      azp: 'abby-cli',
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime('-10s')
      .sign(privateKey);
    await assert.rejects(
      () => verifier.verify(expired),
      (e: unknown) => e instanceof BridgeAuthError,
    );

    await new Promise<void>(r => server.close(() => r()));
  });
});