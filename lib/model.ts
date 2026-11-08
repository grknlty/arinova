import { z } from 'zod';
import { canonicalSubject } from './subjects';
export const confidence = z.enum([
  'sure',
  'unsure',
  'best_guess',
  'not_understood',
]);
// Pictures arrive as base64 data URLs (no SVG, which can carry scripts) and
// are served to the browser from /api/images, never inlined in set lists.
export const imageData = z
  .string()
  .max(1500000)
  .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/);
// Kinds of tests a set can declare. Only those with one correct option can
// be practised so far; the others are named so they are refused clearly.
export const testTypes = [
  'single-choice',
  'true-false',
  'multiple-choice',
  'type-answer',
] as const;
export const difficulties = ['easy', 'medium', 'hard'] as const;
// What a test is for: checking knowledge of a lesson, or practising in the
// style of the Cito tests.
export const testStyles = ['knowledge', 'cito'] as const;
export type TestStyle = (typeof testStyles)[number];
export type TestType = (typeof testTypes)[number];
export type Difficulty = (typeof difficulties)[number];
export const questionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(3000),
    options: z.array(z.string().trim().min(1).max(1000)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().max(5000).default(''),
    image: imageData.optional(),
    optionImages: z.array(imageData.nullable()).optional(),
  })
  .refine(
    (q) => q.correctIndex < q.options.length,
    'correctIndex must refer to an option',
  )
  .refine(
    (q) => !q.optionImages || q.optionImages.length === q.options.length,
    'optionImages needs one entry (or null) per option',
  );
export const setSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    subject: z.string().trim().min(1).max(80).transform(canonicalSubject),
    language: z.enum(['nl', 'tr', 'en']),
    description: z.string().max(1000).default(''),
    material: z.string().max(50000).default(''),
    // How the material arrived, for the parent's history of added material.
    source: z.enum(['word', 'json', 'api', 'manual']).optional(),
    fileName: z.string().trim().max(200).optional(),
    // School context shown on the card, e.g. "Les 3 tot en met 5", "Groep 7–8".
    lesson: z.string().trim().min(1).max(100).optional(),
    group: z.string().trim().min(1).max(60).optional(),
    // Optional grouping inside a subject; the learner can filter by it.
    theme: z.string().trim().min(1).max(100).optional(),
    testStyle: z.enum(testStyles).optional(),
    testType: z.enum(testTypes).optional(),
    difficulty: z.enum(difficulties).optional(),
    // The day the author made the test; createdAt is when it was imported.
    addedDate: z.iso.date().optional(),
    // Checked against the questions, not stored: the count is always derived.
    questionCount: z.number().int().min(1).optional(),
    questions: z.array(questionSchema).min(1).max(100),
  })
  .superRefine((set, ctx) => {
    if (set.testType === 'multiple-choice' || set.testType === 'type-answer')
      ctx.addIssue({
        code: 'custom',
        path: ['testType'],
        message: `${set.testType} tests cannot be imported yet; use single-choice or true-false`,
      });
    if (set.testType === 'true-false')
      set.questions.forEach((q, i) => {
        if (q.options.length !== 2)
          ctx.addIssue({
            code: 'custom',
            path: ['questions', i, 'options'],
            message: 'a true-false question needs exactly 2 options',
          });
      });
    if (
      set.questionCount !== undefined &&
      set.questionCount !== set.questions.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['questionCount'],
        message: `says ${set.questionCount} but the set has ${set.questions.length} questions`,
      });
  })
  .transform(({ questionCount: _, ...set }) => set);
// What the parent can change on a saved set. null clears an optional field.
export const setDetailsSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(1000),
    group: z.string().trim().min(1).max(60).nullable(),
    theme: z.string().trim().min(1).max(100).nullable(),
    lesson: z.string().trim().min(1).max(100).nullable(),
    testStyle: z.enum(testStyles).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'nothing to change');
export type SetDetails = z.infer<typeof setDetailsSchema>;
export type StudySet = z.infer<typeof setSchema> & {
  id: string;
  createdAt: string;
  sample?: boolean;
  // Deleted sets leave the learning space; their attempts stay in progress.
  deletedAt?: string;
};
export type PublicSet = Omit<StudySet, 'questions'> & {
  questions: {
    prompt: string;
    options: string[];
    image?: string;
    optionImages?: (string | null)[];
  }[];
};
export const answerSchema = z.object({
  option: z.number().int().min(0).nullable(),
  confidence,
});
export const attemptSchema = z.object({
  setId: z.string().uuid(),
  answers: z.array(answerSchema).min(1).max(100),
});
export type Answer = z.infer<typeof answerSchema>;
export type Attempt = {
  id: string;
  setId: string;
  title: string;
  subject: string;
  createdAt: string;
  answers: (Answer & {
    prompt: string;
    selected: string | null;
    correctAnswer: string;
    correct: boolean;
    explanation: string;
  })[];
  correct: number;
  total: number;
};
export function grade(set: StudySet, answers: Answer[]): Attempt {
  if (answers.length !== set.questions.length)
    throw new Error('Answer every question');
  const scored = answers.map((a, i) => {
    const q = set.questions[i];
    if (
      a.option !== null &&
      (a.option < 0 ||
        a.option >= q.options.length ||
        !Number.isInteger(a.option))
    )
      throw new Error('Invalid option');
    if (a.option === null && a.confidence !== 'not_understood')
      throw new Error('Choose an answer or mark not understood');
    return {
      ...a,
      prompt: q.prompt,
      selected: a.option === null ? null : q.options[a.option],
      correctAnswer: q.options[q.correctIndex],
      correct: a.option === q.correctIndex,
      explanation: q.explanation,
    };
  });
  return {
    id: crypto.randomUUID(),
    setId: set.id,
    title: set.title,
    subject: set.subject,
    createdAt: new Date().toISOString(),
    answers: scored,
    correct: scored.filter((a) => a.correct).length,
    total: scored.length,
  };
}
export function publicSet(set: StudySet): PublicSet {
  return {
    ...set,
    questions: set.questions.map((q) => ({
      prompt: q.prompt,
      options: q.options,
      ...(q.image ? { image: q.image } : {}),
      ...(q.optionImages ? { optionImages: q.optionImages } : {}),
    })),
  };
}

// Replaces stored picture data with the URLs that serve it.
export function imageUrls(set: StudySet): StudySet {
  const url = (data: string | null | undefined, path: string) =>
    data?.startsWith('data:') ? `/api/images/${set.id}/${path}` : data;
  return {
    ...set,
    questions: set.questions.map((q, i) => ({
      ...q,
      ...(q.image ? { image: url(q.image, `${i}`)! } : {}),
      ...(q.optionImages
        ? {
            optionImages: q.optionImages.map(
              (o, j) => url(o, `${i}/${j}`) ?? null,
            ),
          }
        : {}),
    })),
  };
}

// Readable reasons for a rejected import, e.g. "Test 2, question 5: …".
export function importProblems(error: z.ZodError) {
  return error.issues
    .slice(0, 6)
    .map(({ path, message }) => {
      const at = path.indexOf('questions');
      const where = [
        typeof path[0] === 'number' ? `Test ${path[0] + 1}` : '',
        at >= 0 && typeof path[at + 1] === 'number'
          ? `question ${(path[at + 1] as number) + 1}`
          : '',
      ]
        .filter(Boolean)
        .join(', ');
      const field = path.at(-1) === undefined ? '' : String(path.at(-1));
      const reason =
        field === 'correctIndex'
          ? 'needs exactly one correct answer'
          : /image|optionImages/.test(path.join('.'))
            ? 'pictures must be PNG, JPEG, WebP or GIF data'
            : `${field || 'file'}: ${message}`;
      const line = where ? `${where}: ${reason}` : reason;
      return line[0].toUpperCase() + line.slice(1);
    })
    .join('; ');
}
