import { z } from 'zod';
import { role, sameOrigin } from '@/lib/auth';
import { questionSchema, setSchema } from '@/lib/model';
import { addQuestion, addSets, catalog, list } from '@/lib/store';
import { body, unavailable } from '@/lib/http';

// One question, added to a test of the chosen subject, or to a new test made
// from the title and language given.
const input = z
  .object({
    group: z.string().trim().min(1).max(60),
    subject: z.string().trim().min(1).max(80),
    setId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(150).optional(),
    language: z.enum(['nl', 'tr', 'en']).optional(),
    question: questionSchema,
  })
  .refine((d) => d.setId || (d.title && d.language), {
    message: 'Choose a test, or give a title and language for a new one',
  });

// Parent only.
export async function POST(req: Request) {
  if (!sameOrigin(req) || (await role()) !== 'parent')
    return new Response(null, { status: 403 });
  let data;
  try {
    data = input.parse(await body(req));
  } catch (e) {
    return Response.json(
      {
        code: 'INVALID',
        error: e instanceof z.ZodError ? e.issues[0]?.message : 'Not JSON',
      },
      { status: 400 },
    );
  }
  try {
    const { subjects } = await catalog();
    if (
      !subjects.some((s) => s.name === data.subject && s.group === data.group)
    )
      return Response.json({ code: 'NO_SUBJECT' }, { status: 400 });
    if (data.setId) {
      const set = (await list('sets')).find((s) => s.id === data.setId);
      if (!set || set.subject !== data.subject)
        return Response.json({ code: 'NO_TEST' }, { status: 400 });
      await addQuestion(set.id, data.question);
      return Response.json({ id: set.id }, { status: 201 });
    }
    const set = {
      ...setSchema.parse({
        title: data.title,
        subject: data.subject,
        language: data.language,
        group: data.group,
        source: 'manual',
        questions: [data.question],
      }),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await addSets([set]);
    return Response.json({ id: set.id }, { status: 201 });
  } catch {
    return unavailable();
  }
}
