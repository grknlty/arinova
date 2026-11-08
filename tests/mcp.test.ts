import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHandler } from '../lib/mcp';

const key = 'Bearer test-only-token-not-a-real-credential';
function setup() {
  const calls: Request[] = [];
  const handler = createMcpHandler({
    authorized: (r) => r.headers.get('authorization') === key,
    refusal: () =>
      Response.json({ error: 'Import key required' }, { status: 403 }),
    format: () =>
      Response.json({
        schema: {
          type: 'object',
          properties: { questions: { items: { $ref: '#/$defs/Question' } } },
          $defs: { Question: { type: 'object' } },
        },
        rules: [],
      }),
    check: async (r) => {
      calls.push(r);
      return Response.json({ valid: true });
    },
    add: async (r) => {
      calls.push(r);
      return Response.json({ id: 'saved-set-id' }, { status: 201 });
    },
  });
  const send = (message: unknown, headers: Record<string, string> = {}) =>
    handler(
      new Request('https://arinova.example/api/mcp', {
        method: 'POST',
        headers: {
          Authorization: key,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: JSON.stringify(message),
      }),
    );
  return { calls, handler, send };
}
const rpc = (method: string, params = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  params,
});

test('MCP requires token and rejects foreign browser origins before any operation', async () => {
  const { send, calls } = setup();
  assert.equal(
    (await send(rpc('tools/list'), { Authorization: '' })).status,
    401,
  );
  assert.equal(
    (await send(rpc('tools/list'), { Origin: 'https://untrusted.example' }))
      .status,
    403,
  );
  assert.equal(calls.length, 0);
});
test('MCP initialization, discovery and annotations', async () => {
  const { send } = setup();
  const init = await (
    await send(
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      }),
    )
  ).json();
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const list = await (await send(rpc('tools/list'))).json();
  assert.deepEqual(
    list.result.tools.map((t: { name: string }) => t.name),
    ['getQuestionSetFormat', 'checkQuestionSet', 'addQuestionSet'],
  );
  assert.equal(list.result.tools[2].annotations.readOnlyHint, false);
  assert.equal(list.result.tools[2].annotations.idempotentHint, false);
  assert.deepEqual(list.result.tools[2].inputSchema.$defs.Question, {
    type: 'object',
  });
});
test('check and add preserve the one-set body and returned ID', async () => {
  const { send, calls } = setup();
  const studySet = {
    title: 'A test',
    questions: [{ prompt: 'Q', correctIndex: 2 }],
  };
  for (const name of ['checkQuestionSet', 'addQuestionSet']) {
    const response = await (
      await send(rpc('tools/call', { name, arguments: { studySet } }))
    ).json();
    assert.equal(response.result.isError, false);
  }
  assert.equal(new URL(calls[0].url).pathname, '/api/format');
  assert.equal(new URL(calls[1].url).pathname, '/api/sets');
  assert.equal(calls[1].headers.get('authorization'), key);
  assert.deepEqual(await calls[1].json(), studySet);
  assert.equal(calls.length, 2);
});
test('notifications never write, and invalid tool calls never reach storage', async () => {
  const { send, calls } = setup();
  assert.equal(
    (
      await send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'addQuestionSet',
          arguments: { studySet: {} },
        },
      })
    ).status,
    202,
  );
  for (const args of [{}, { studySet: [] }, { studySet: {}, extra: true }]) {
    const output = await (
      await send(rpc('tools/call', { name: 'addQuestionSet', arguments: args }))
    ).json();
    assert.equal(output.error.code, -32602);
  }
  assert.equal(calls.length, 0);
});
test('protocol errors and existing API failures are not reported as saved', async () => {
  const { send } = setup();
  assert.equal(
    (await send(rpc('ping'), { 'MCP-Protocol-Version': 'unknown' })).status,
    400,
  );
  assert.equal(
    (await send(rpc('ping'), { Accept: 'application/json' })).status,
    406,
  );
  assert.equal((await send([])).status, 400);
  const handler = createMcpHandler({
    authorized: () => true,
    refusal: () => new Response(),
    format: () => Response.json({}),
    check: () => Response.json({ error: 'Invalid set' }, { status: 400 }),
    add: () => Response.json({ error: 'Storage unavailable' }, { status: 503 }),
  });
  const response = await handler(
    new Request('https://arinova.example/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(
        rpc('tools/call', {
          name: 'addQuestionSet',
          arguments: { studySet: {} },
        }),
      ),
    }),
  );
  const output = await response.json();
  assert.equal(output.result.isError, true);
  assert.match(output.result.content[0].text, /Storage unavailable/);
});
