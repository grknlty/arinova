import { canImport, importRefusal } from '@/lib/auth';
import { z } from 'zod';
import { setSchema, importProblems } from '@/lib/model';
import { normalizeSets } from '@/lib/formats';
import { body } from '@/lib/http';
import { setJsonSchema, exampleSet, writingRules } from '@/lib/format';
import { subjects } from '@/lib/subjects';

// The study set format, for whoever writes sets (a GPT, a skill, a person):
// the JSON Schema, a set that imports as it is, and the writing rules.
export function GET() {
  const { StudySet, Question } = setJsonSchema('#/$defs/Question');
  return Response.json({
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      ...StudySet,
      $defs: { Question },
    },
    subjects: subjects.map((s) => s.name),
    example: exampleSet,
    rules: writingRules,
  });
}

// Checks a set (or a list of sets) without saving it. Answers with the set
// as Arinova would store it, or with what to fix.
export async function POST(req: Request) {
  if (!(await canImport(req))) return importRefusal(req);
  try {
    const data = normalizeSets(await body(req, 4000000));
    const sets = Array.isArray(data)
      ? z.array(setSchema).min(1).max(50).parse(data)
      : [setSchema.parse(data)];
    return Response.json({
      valid: true,
      questionCounts: sets.map((s) => s.questions.length),
      ...(Array.isArray(data) ? { sets } : { set: sets[0] }),
    });
  } catch (e) {
    return Response.json(
      {
        valid: false,
        error:
          e instanceof z.ZodError
            ? importProblems(e)
            : 'Not JSON, or larger than 4 MB.',
      },
      { status: 400 },
    );
  }
}
