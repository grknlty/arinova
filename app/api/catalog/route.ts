import { z } from 'zod';
import { role, sameOrigin } from '@/lib/auth';
import { canonicalSubject } from '@/lib/subjects';
import { addGroup, addSubject, catalog } from '@/lib/store';
import { body, unavailable } from '@/lib/http';

const name = (max: number) => z.string().trim().min(1).max(max);
const input = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('group'), name: name(60) }),
  z.object({
    kind: z.literal('subject'),
    name: name(80).transform(canonicalSubject),
    group: name(60),
  }),
]);

export async function GET() {
  if (!(await role())) return new Response(null, { status: 401 });
  try {
    return Response.json(await catalog());
  } catch {
    return unavailable();
  }
}

// Parent only: adds a group, or a subject filed under an existing group.
export async function POST(req: Request) {
  if (!sameOrigin(req) || (await role()) !== 'parent')
    return new Response(null, { status: 403 });
  let data;
  try {
    data = input.parse(await body(req));
  } catch {
    return Response.json(
      {
        code: 'INVALID',
        error:
          'Send { "kind": "group", "name" } or { "kind": "subject", "name", "group" }',
      },
      { status: 400 },
    );
  }
  try {
    if (data.kind === 'group')
      return (await addGroup(data.name))
        ? Response.json({ name: data.name }, { status: 201 })
        : Response.json({ code: 'EXISTS' }, { status: 409 });
    if (!(await catalog()).groups.includes(data.group))
      return Response.json({ code: 'NO_GROUP' }, { status: 400 });
    const result = await addSubject(data.name, data.group);
    return result.created
      ? Response.json({ name: data.name }, { status: 201 })
      : Response.json({ code: 'EXISTS', group: result.group }, { status: 409 });
  } catch {
    return unavailable();
  }
}
