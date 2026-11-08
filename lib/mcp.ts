// Stateless Streamable HTTP MCP adapter. Existing API handlers own validation,
// authentication and storage; this transport never handles or stores a secret.
type Operation = (request: Request) => Response | Promise<Response>;
type Dependencies = {
  authorized: (request: Request) => boolean;
  refusal: Operation;
  format: () => Response;
  check: Operation;
  add: Operation;
};
const versions = ['2025-11-25', '2025-06-18', '2025-03-26'];
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function createMcpHandler(api: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    if (!api.authorized(request)) {
      const refusal = await api.refusal(request);
      return new Response(refusal.body, {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }
    const origin = request.headers.get('origin');
    const allowed = [
      new URL(request.url).origin,
      'https://chatgpt.com',
      'https://chat.openai.com',
      ...(process.env.ARINOVA_MCP_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim()),
    ];
    if (origin && !allowed.includes(origin)) {
      return new Response('Origin not allowed', { status: 403 });
    }
    const json = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { 'Cache-Control': 'no-store' },
      });
    const error = (id: unknown, code: number, message: string, status = 200) =>
      json({ jsonrpc: '2.0', id, error: { code, message } }, status);
    const protocol = request.headers.get('mcp-protocol-version');
    if (protocol && !versions.includes(protocol)) {
      return error(null, -32600, 'Unsupported MCP protocol version', 400);
    }
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return error(null, -32600, 'Use application/json', 415);
    }
    const accept = request.headers.get('accept') ?? '';
    if (
      !accept.includes('application/json') ||
      !accept.includes('text/event-stream')
    ) {
      return error(
        null,
        -32600,
        'Accept application/json and text/event-stream',
        406,
      );
    }
    let message: unknown;
    try {
      // Bound the entire RPC envelope, including embedded images/documents.
      const reader = request.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4_100_000) {
          await reader.cancel();
          return error(null, -32600, 'Request exceeds 4.1 MB', 413);
        }
        chunks.push(value);
      }
      message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return error(null, -32700, 'Invalid JSON', 400);
    }
    if (
      !isObject(message) ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string'
    ) {
      return error(null, -32600, 'Expected one JSON-RPC 2.0 request', 400);
    }
    const id = message.id;
    if (id === undefined) {
      // A notification must never perform a write or receive an RPC response.
      return new Response(null, { status: 202 });
    }
    if (typeof id !== 'string' && typeof id !== 'number') {
      return error(null, -32600, 'Request id must be a string or number', 400);
    }
    const result = (value: unknown) =>
      json({ jsonrpc: '2.0', id, result: value });
    const params = message.params ?? {};
    if (!isObject(params)) return error(id, -32602, 'params must be an object');
    switch (message.method) {
      case 'initialize':
        if (
          typeof params.protocolVersion !== 'string' ||
          !isObject(params.capabilities) ||
          !isObject(params.clientInfo)
        ) {
          return error(id, -32602, 'Missing initialization parameters');
        }
        return result({
          protocolVersion: versions.includes(params.protocolVersion)
            ? params.protocolVersion
            : versions[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'arinova', version: '1.0.0' },
        });
      case 'ping':
        return result({});
      case 'tools/list': {
        const format = await api.format().json();
        // API refs are rooted at #/$defs; keep them at the MCP input root.
        const { $defs, ...studySetSchema } = format.schema;
        const inputSchema = {
          type: 'object',
          required: ['studySet'],
          additionalProperties: false,
          properties: { studySet: studySetSchema },
          ...($defs ? { $defs } : {}),
        };
        const annotations = (readOnlyHint: boolean) => ({
          readOnlyHint,
          destructiveHint: false,
          idempotentHint: readOnlyHint,
          openWorldHint: false,
        });
        return result({
          tools: [
            {
              name: 'getQuestionSetFormat',
              description:
                'Read the current Arinova JSON format and writing rules.',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
              annotations: annotations(true),
            },
            {
              name: 'checkQuestionSet',
              description: 'Validate one study set without saving it.',
              inputSchema,
              annotations: annotations(true),
            },
            {
              name: 'addQuestionSet',
              description:
                'Save one study set to Arinova. Requires an explicit upload request. Do not retry an uncertain result: duplicate sets may be created.',
              inputSchema,
              annotations: annotations(false),
            },
          ],
        });
      }
      case 'tools/call': {
        const args = params.arguments ?? {};
        if (!isObject(args))
          return error(id, -32602, 'arguments must be an object');
        let response: Response;
        if (params.name === 'getQuestionSetFormat') {
          if (Object.keys(args).length)
            return error(id, -32602, 'This tool takes no arguments');
          response = api.format();
        } else if (
          params.name === 'checkQuestionSet' ||
          params.name === 'addQuestionSet'
        ) {
          if (Object.keys(args).length !== 1 || !isObject(args.studySet)) {
            return error(id, -32602, 'Provide exactly one studySet object');
          }
          const target =
            params.name === 'addQuestionSet' ? '/api/sets' : '/api/format';
          // In-process calls preserve existing import-token auth, schema checks,
          // image handling, storage and returned IDs; no external HTTP request.
          const inner = new Request(new URL(target, request.url), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: request.headers.get('authorization') ?? '',
            },
            body: JSON.stringify(args.studySet),
          });
          try {
            response = await (params.name === 'addQuestionSet'
              ? api.add(inner)
              : api.check(inner));
          } catch {
            // Do not expose stack traces, environment values, or the request.
            return result({
              content: [
                {
                  type: 'text',
                  text: 'Operation did not complete normally. Upload status may be unknown; check Arinova before retrying.',
                },
              ],
              isError: true,
            });
          }
        } else {
          return error(id, -32602, 'Unknown tool');
        }
        const text = await response.text();
        return result({
          content: [{ type: 'text', text }],
          isError: !response.ok,
        });
      }
      default:
        return error(id, -32601, 'Method not found');
    }
  };
}
