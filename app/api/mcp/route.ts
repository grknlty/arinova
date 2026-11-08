import { hasImportToken, importRefusal } from '@/lib/auth';
import { createMcpHandler } from '@/lib/mcp';
import { GET as format, POST as check } from '../format/route';
import { POST as add } from '../sets/route';

export const runtime = 'nodejs';
export const POST = createMcpHandler({
  authorized: hasImportToken,
  refusal: importRefusal,
  format,
  check,
  add,
});

// No server-initiated events or persistent sessions are needed.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
