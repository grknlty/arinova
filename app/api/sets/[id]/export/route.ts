import { z } from 'zod';
import { role } from '@/lib/auth';
import { exportSet } from '@/lib/store';
import { unavailable } from '@/lib/http';

// Parent only: downloads a set as a JSON file in the import format, with
// every question, option, answer, explanation and picture.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await role()) !== 'parent') return new Response(null, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  let set;
  try {
    set = await exportSet(id);
  } catch {
    return unavailable();
  }
  if (!set) return new Response(null, { status: 404 });
  // The title names the file; plain ASCII for browsers without UTF-8 names.
  const name = `${set.title.replace(/[\\/:*?"<>|]+/g, '-').trim()}.json`;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return new Response(JSON.stringify(set, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
