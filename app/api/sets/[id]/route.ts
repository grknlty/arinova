import { z } from 'zod';
import { role, sameOrigin } from '@/lib/auth';
import { setDeleted, setDetails } from '@/lib/store';
import { setDetailsSchema } from '@/lib/model';
import { body, unavailable } from '@/lib/http';

// Parent only: { deleted: true } removes a set from the learning space,
// { deleted: false } puts it back. Attempts on it are kept either way.
// Otherwise the body changes the set's details: any of title, description,
// theme, lesson and testStyle, with null clearing the last three.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(req) || (await role()) !== 'parent')
    return new Response(null, { status: 403 });
  const { id } = await params;
  let change;
  try {
    change = z
      .union([z.object({ deleted: z.boolean() }).strict(), setDetailsSchema])
      .parse(await body(req));
  } catch {
    return Response.json(
      {
        error:
          'Send { "deleted": true or false }, or the details to change: title, description, theme, lesson, testStyle',
      },
      {
        status: 400,
      },
    );
  }
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  try {
    return (await ('deleted' in change
      ? setDeleted(id, change.deleted)
      : setDetails(id, change)))
      ? new Response(null, { status: 204 })
      : new Response(null, { status: 404 });
  } catch {
    return unavailable();
  }
}
