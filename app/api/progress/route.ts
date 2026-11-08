import { role } from '@/lib/auth';
import { list } from '@/lib/store';
import { unavailable } from '@/lib/http';
export async function GET() {
  // Both roles may look back at results; the family shares one record.
  if (!(await role())) return new Response(null, { status: 401 });
  try {
    return Response.json(await list('attempts'));
  } catch {
    return unavailable();
  }
}
