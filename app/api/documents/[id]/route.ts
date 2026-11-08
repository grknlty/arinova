import { z } from 'zod';
import { role } from '@/lib/auth';
import { documentType } from '@/lib/model';
import { materialDocument } from '@/lib/store';
import { unavailable } from '@/lib/http';

// Serves a set's material document: a PDF opens in the browser, a Word file
// downloads. Linked documents are opened at their own address instead.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await role())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  let doc;
  try {
    doc = await materialDocument(id);
  } catch {
    return unavailable();
  }
  const kind = doc && documentType(doc.url);
  if (!doc || !kind?.extension) return new Response(null, { status: 404 });
  const name = doc.fileName ?? `material.${kind.extension}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const disposition = kind.extension === 'pdf' ? 'inline' : 'attachment';
  return new Response(Buffer.from(doc.url.split(',')[1], 'base64'), {
    headers: {
      'Content-Type': kind.type,
      'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
