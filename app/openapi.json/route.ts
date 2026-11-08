import { setJsonSchema } from '@/lib/format';

// The public address the request came in on (Vercel sets these headers).
function origin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto =
    req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return host ? `${proto}://${host}` : url.origin;
}

const json = (ref: string) => ({
  'application/json': { schema: { $ref: `#/components/schemas/${ref}` } },
});

// OpenAPI description of the import and format endpoints, for a ChatGPT custom GPT
// action ("Import from URL"). It describes the API only; no data or keys.
// ChatGPT's editor requires the object schemas under components.schemas.
export function GET(req: Request) {
  return Response.json({
    openapi: '3.1.0',
    info: {
      title: 'Nova',
      version: '1.0.0',
      description:
        'Adds practice tests with multiple-choice questions to Nova, a family learning space.',
    },
    servers: [{ url: origin(req) }],
    paths: {
      '/api/sets': {
        post: {
          operationId: 'addStudySet',
          summary: 'Add one practice test (study set) with its questions.',
          security: [{ importKey: [] }],
          requestBody: { required: true, content: json('StudySet') },
          responses: {
            '201': { description: 'Saved.', content: json('Saved') },
            '400': {
              description: 'The test is invalid; the error names the problem.',
              content: json('Error'),
            },
            '403': {
              description: 'Missing or wrong import key; the error says which.',
              content: json('Error'),
            },
          },
        },
      },
      '/api/format': {
        get: {
          operationId: 'getStudySetFormat',
          summary:
            'Get the study set format: JSON Schema, a valid example and the writing rules. Call it before writing a test.',
          responses: {
            '200': { description: 'The format.', content: json('Format') },
          },
        },
        post: {
          operationId: 'checkStudySet',
          summary:
            'Check a study set without saving it; returns it as Nova would store it, or what to fix.',
          security: [{ importKey: [] }],
          requestBody: { required: true, content: json('StudySet') },
          responses: {
            '200': { description: 'Valid.', content: json('Checked') },
            '400': {
              description: 'Invalid; the error names the problem.',
              content: json('Error'),
            },
            '403': {
              description: 'Missing or wrong import key; the error says which.',
              content: json('Error'),
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ...setJsonSchema('#/components/schemas/Question'),
        Saved: { type: 'object', properties: { id: { type: 'string' } } },
        Format: {
          type: 'object',
          properties: {
            schema: { type: 'object', description: 'JSON Schema of a set.' },
            subjects: { type: 'array', items: { type: 'string' } },
            example: { $ref: '#/components/schemas/StudySet' },
            rules: { type: 'array', items: { type: 'string' } },
          },
        },
        Checked: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            questionCounts: { type: 'array', items: { type: 'integer' } },
            set: { $ref: '#/components/schemas/StudySet' },
          },
        },
        Error: { type: 'object', properties: { error: { type: 'string' } } },
      },
      securitySchemes: { importKey: { type: 'http', scheme: 'bearer' } },
    },
  });
}
