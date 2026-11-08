import { z } from 'zod';
import { role, sameOrigin } from '@/lib/auth';
import { canonicalSubject } from '@/lib/subjects';
import {
  addGroup,
  addSubject,
  catalog,
  renameEntry,
  setCardLayout,
} from '@/lib/store';
import { buttonKeys, factKeys } from '@/lib/facts';
import { body, unavailable } from '@/lib/http';

const groupName = z.string().trim().min(1).max(60);
const subjectName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform(canonicalSubject);
const added = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('group'), name: groupName }),
  z.object({
    kind: z.literal('subject'),
    name: subjectName,
    groupId: z.string().uuid(),
  }),
]);
const renamed = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('group'),
    id: z.string().uuid(),
    name: groupName,
  }),
  z.object({
    kind: z.literal('subject'),
    id: z.string().uuid(),
    name: subjectName,
  }),
]);

// A subject's card layout: the order of its details and buttons ([] for the
// default), how many details show before "more" and how many buttons stand
// side by side (null for the default).
const layout = z.object({
  kind: z.literal('subject'),
  id: z.string().uuid(),
  factOrder: z.array(z.enum(factKeys)).max(factKeys.length).default([]),
  factCount: z
    .number()
    .int()
    .min(1)
    .max(factKeys.length)
    .nullable()
    .default(null),
  buttonOrder: z.array(z.enum(buttonKeys)).max(buttonKeys.length).default([]),
  buttonsPerRow: z
    .number()
    .int()
    .min(1)
    .max(buttonKeys.length)
    .nullable()
    .default(null),
  layout: z.literal(true),
});

const parent = async (req: Request) =>
  sameOrigin(req) && (await role()) === 'parent';
const invalid = (error: string) =>
  Response.json({ code: 'INVALID', error }, { status: 400 });

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
  if (!(await parent(req))) return new Response(null, { status: 403 });
  let data;
  try {
    data = added.parse(await body(req));
  } catch {
    return invalid(
      'Send { "kind": "group", "name" } or { "kind": "subject", "name", "groupId" }',
    );
  }
  try {
    if (data.kind === 'group')
      return (await addGroup(data.name))
        ? Response.json({ name: data.name }, { status: 201 })
        : Response.json({ code: 'EXISTS' }, { status: 409 });
    if (!(await catalog()).groups.some((g) => g.id === data.groupId))
      return Response.json({ code: 'NO_GROUP' }, { status: 400 });
    const result = await addSubject(data.name, data.groupId);
    return result.created
      ? Response.json({ name: data.name }, { status: 201 })
      : Response.json({ code: 'EXISTS', group: result.group }, { status: 409 });
  } catch {
    return unavailable();
  }
}

// Parent only: renames a group or subject; its id, and everything that
// points at it, stays the same. With "layout": true instead of a name, sets
// the subject's card layout (see above).
export async function PATCH(req: Request) {
  if (!(await parent(req))) return new Response(null, { status: 403 });
  let data;
  try {
    data = z.union([layout, renamed]).parse(await body(req));
  } catch {
    return invalid(
      'Send { "kind": "group" or "subject", "id", "name" }, or { "kind": "subject", "id", "layout": true, "factOrder", "factCount", "buttonOrder", "buttonsPerRow" }',
    );
  }
  try {
    if ('layout' in data) {
      const saved = {
        factOrder: [...new Set(data.factOrder)],
        factCount: data.factCount ?? undefined,
        buttonOrder: [...new Set(data.buttonOrder)],
        buttonsPerRow: data.buttonsPerRow ?? undefined,
      };
      return (await setCardLayout(data.id, saved))
        ? Response.json(saved)
        : Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    }
    const result = await renameEntry(data.kind, data.id, data.name);
    return result === 'renamed'
      ? Response.json({ name: data.name })
      : Response.json(
          { code: result === 'exists' ? 'EXISTS' : 'NOT_FOUND' },
          { status: result === 'exists' ? 409 : 404 },
        );
  } catch {
    return unavailable();
  }
}
