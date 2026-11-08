import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sameOrigin,
  equal,
  token,
  demo,
  canImport,
  importRefusal,
} from '../lib/auth';
import { GET as openapi } from '../app/openapi.json/route';
test('origin protection tolerates normalized URLs but rejects other sites', () => {
  assert.equal(
    sameOrigin(
      new Request('http://localhost:3000/api/auth', {
        headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
      }),
    ),
    true,
  );
  assert.equal(
    sameOrigin(
      new Request('https://arinova.example/api/auth', {
        headers: { host: 'arinova.example', origin: 'https://other.example' },
      }),
    ),
    false,
  );
  assert.equal(
    sameOrigin(
      new Request('https://arinova.example/api/auth', {
        headers: { host: 'arinova.example', origin: 'null' },
      }),
    ),
    false,
  );
});
test('token creation requires a strong session secret', () => {
  const previous = process.env.SESSION_SECRET;
  try {
    delete process.env.SESSION_SECRET;
    assert.throws(() => token('parent'));
    process.env.SESSION_SECRET = 'short';
    assert.throws(() => token('parent'));
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
  assert.equal(equal('a', 'a'), true);
  assert.equal(equal('a', 'ab'), false);
  assert.equal(equal('a', 'b'), false);
});
test('Vercel never enables the local demo', () => {
  const previous = process.env.VERCEL;
  try {
    process.env.VERCEL = '1';
    assert.equal(demo(), false);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
test('the import token works from another origin; cookies need the same origin', async () => {
  const saved = process.env.IMPORT_API_TOKEN;
  process.env.IMPORT_API_TOKEN = 'test-import-token-that-is-long-enough-123';
  const request = (authorization?: string) =>
    new Request('https://arinova.example/api/sets', {
      method: 'POST',
      headers: {
        host: 'arinova.example',
        origin: 'https://chatgpt.com',
        ...(authorization ? { authorization } : {}),
      },
    });
  try {
    assert.equal(
      await canImport(
        request('Bearer test-import-token-that-is-long-enough-123'),
      ),
      true,
    );
    assert.equal(await canImport(request('Bearer wrong')), false);
    assert.equal(await canImport(request()), false);
  } finally {
    if (saved === undefined) delete process.env.IMPORT_API_TOKEN;
    else process.env.IMPORT_API_TOKEN = saved;
  }
});
test('refused imports say what to fix, never the key', async () => {
  const saved = process.env.IMPORT_API_TOKEN;
  const reason = async (authorization?: string) =>
    (
      await importRefusal(
        new Request('https://arinova.example/api/sets', {
          headers: authorization ? { authorization } : {},
        }),
      ).json()
    ).error as string;
  try {
    delete process.env.IMPORT_API_TOKEN;
    assert.match(await reason('Bearer abc'), /imports are off/);
    process.env.IMPORT_API_TOKEN = 'test-import-token-that-is-long-enough-123';
    assert.match(await reason(), /Authorization: Bearer/);
    assert.match(await reason('Basic abc'), /type Bearer/);
    assert.equal(await reason('Bearer abc'), 'The import key is not correct.');
    assert.doesNotMatch(await reason('Bearer abc'), /long-enough/);
  } finally {
    if (saved === undefined) delete process.env.IMPORT_API_TOKEN;
    else process.env.IMPORT_API_TOKEN = saved;
  }
});
test('the OpenAPI description points at the public address', async () => {
  const doc = await openapi(
    new Request('http://0.0.0.0:3000/openapi.json', {
      headers: {
        'x-forwarded-host': 'arinova.example',
        'x-forwarded-proto': 'https',
      },
    }),
  ).json();
  assert.deepEqual(doc.servers, [{ url: 'https://arinova.example' }]);
  assert.equal(doc.paths['/api/sets'].post.operationId, 'addQuestionSet');
  assert.equal(doc.components.securitySchemes.importKey.scheme, 'bearer');
});
