import type { Pool, PoolClient } from 'pg';
import type { Attempt, Question, StudySet } from './model';
import type { Role } from './auth';

type Client = Pool | PoolClient;

// Relational tables for study content and answers. A test (one toets) groups
// its questions; every answer row points at the question and the chosen option,
// so mistakes can be queried per question.
export const schema = `
  CREATE TABLE IF NOT EXISTS public.arinova_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.arinova_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_name text NOT NULL UNIQUE,
    group_id uuid REFERENCES public.arinova_groups(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.arinova_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    user_name text NOT NULL UNIQUE,
    role text NOT NULL UNIQUE CHECK (role IN ('parent', 'learner')),
    group_id uuid REFERENCES public.arinova_groups(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.arinova_tests (
    id uuid PRIMARY KEY,
    subject_id uuid NOT NULL REFERENCES public.arinova_subjects(id),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    material text NOT NULL DEFAULT '',
    language text NOT NULL CHECK (language IN ('nl', 'tr', 'en')),
    is_sample boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.arinova_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id uuid NOT NULL REFERENCES public.arinova_subjects(id),
    test_id uuid NOT NULL REFERENCES public.arinova_tests(id) ON DELETE CASCADE,
    position integer NOT NULL,
    question_text text NOT NULL,
    explanation text NOT NULL DEFAULT '',
    answer_count integer NOT NULL DEFAULT 1,
    UNIQUE (test_id, position)
  );
  CREATE TABLE IF NOT EXISTS public.arinova_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.arinova_questions(id) ON DELETE CASCADE,
    position integer NOT NULL,
    option_text text NOT NULL,
    is_answer boolean NOT NULL DEFAULT false,
    UNIQUE (question_id, position)
  );
  CREATE TABLE IF NOT EXISTS public.arinova_attempts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.arinova_users(id),
    test_id uuid NOT NULL REFERENCES public.arinova_tests(id) ON DELETE CASCADE,
    correct integer NOT NULL,
    total integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.arinova_user_question_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id uuid NOT NULL REFERENCES public.arinova_attempts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.arinova_users(id),
    question_id uuid NOT NULL REFERENCES public.arinova_questions(id) ON DELETE CASCADE,
    options_id uuid REFERENCES public.arinova_options(id),
    is_correct boolean NOT NULL,
    confidence text NOT NULL,
    answered_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, question_id)
  );
  -- Optional pictures as data URLs; added after the first release.
  ALTER TABLE public.arinova_questions ADD COLUMN IF NOT EXISTS image text;
  ALTER TABLE public.arinova_options ADD COLUMN IF NOT EXISTS image text;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS source text;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS file_name text;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS lesson text;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS test_type text;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS difficulty text;
  ALTER TABLE public.arinova_tests ADD COLUMN IF NOT EXISTS added_date date;
  ALTER TABLE public.arinova_tests
    ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.arinova_groups(id);
  CREATE INDEX IF NOT EXISTS arinova_answers_question
    ON public.arinova_user_question_answers (question_id, is_correct);
  CREATE INDEX IF NOT EXISTS arinova_attempts_user
    ON public.arinova_attempts (user_id, created_at DESC);
`;

export const tables = [
  'arinova_groups',
  'arinova_subjects',
  'arinova_users',
  'arinova_tests',
  'arinova_questions',
  'arinova_options',
  'arinova_attempts',
  'arinova_user_question_answers',
];

// The learner's school group, which imported subjects are filed under.
export const learnerGroup = () => process.env.LEARNER_GROUP || 'Groep 7–8';

// Groups and subjects the parent can choose from when adding questions.
export type Catalog = {
  groups: string[];
  subjects: { name: string; group: string | null }[];
};

// One family with one learner: both sign-in roles get a user row.
export async function seedUsers(client: Client) {
  const group = await client.query(
    `INSERT INTO public.arinova_groups (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [learnerGroup()],
  );
  await client.query(
    `INSERT INTO public.arinova_users (name, user_name, role, group_id)
     VALUES ('Ouder', 'parent', 'parent', NULL), ($1, 'learner', 'learner', $2)
     ON CONFLICT (role) DO NOTHING`,
    [process.env.LEARNER_NAME || 'Nova', group.rows[0].id],
  );
}

export async function insertSet(client: Client, set: StudySet) {
  const subject = await client.query(
    `INSERT INTO public.arinova_subjects (subject_name, group_id)
     VALUES ($1, (SELECT group_id FROM public.arinova_users WHERE role = 'learner'))
     ON CONFLICT (subject_name) DO UPDATE SET subject_name = EXCLUDED.subject_name
     RETURNING id`,
    [set.subject],
  );
  const subjectId = subject.rows[0].id;
  const group = set.group
    ? (
        await client.query(
          `INSERT INTO public.arinova_groups (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [set.group],
        )
      ).rows[0].id
    : null;
  const test = await client.query(
    `INSERT INTO public.arinova_tests
       (id, subject_id, title, description, material, language, is_sample, created_at,
        source, file_name, lesson, group_id, test_type, difficulty, added_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO NOTHING`,
    [
      set.id,
      subjectId,
      set.title,
      set.description,
      set.material,
      set.language,
      !!set.sample,
      set.createdAt,
      set.source ?? null,
      set.fileName ?? null,
      set.lesson ?? null,
      group,
      set.testType ?? null,
      set.difficulty ?? null,
      set.addedDate ?? null,
    ],
  );
  if (!test.rowCount) return;
  const questions = await client.query(
    `INSERT INTO public.arinova_questions
       (subject_id, test_id, position, question_text, explanation, answer_count, image)
     SELECT $1, $2, q.position, q.text, q.explanation, 1, q.image
     FROM jsonb_to_recordset($3) AS q(position integer, text text, explanation text, image text)
     RETURNING id, position`,
    [
      subjectId,
      set.id,
      JSON.stringify(
        set.questions.map((q, position) => ({
          position,
          text: q.prompt,
          explanation: q.explanation,
          image: q.image ?? null,
        })),
      ),
    ],
  );
  const ids = new Map(questions.rows.map((r) => [r.position, r.id]));
  await client.query(
    `INSERT INTO public.arinova_options (question_id, position, option_text, is_answer, image)
     SELECT o.question_id, o.position, o.text, o.is_answer, o.image
     FROM jsonb_to_recordset($1) AS o(question_id uuid, position integer, text text, is_answer boolean, image text)`,
    [
      JSON.stringify(
        set.questions.flatMap((q, i) =>
          q.options.map((text, position) => ({
            question_id: ids.get(i),
            position,
            text,
            is_answer: position === q.correctIndex,
            image: q.optionImages?.[position] ?? null,
          })),
        ),
      ),
    ],
  );
}

export async function insertAttempt(
  client: Client,
  attempt: Attempt,
  role: Role,
) {
  const user = await client.query(
    'SELECT id FROM public.arinova_users WHERE role = $1',
    [role],
  );
  const userId = user.rows[0].id;
  const created = await client.query(
    `INSERT INTO public.arinova_attempts (id, user_id, test_id, correct, total, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [
      attempt.id,
      userId,
      attempt.setId,
      attempt.correct,
      attempt.total,
      attempt.createdAt,
    ],
  );
  if (!created.rowCount) return;
  await client.query(
    `INSERT INTO public.arinova_user_question_answers
       (attempt_id, user_id, question_id, options_id, is_correct, confidence, answered_at)
     SELECT $1, $2, q.id, o.id, a.correct, a.confidence, $4
     FROM jsonb_to_recordset($3) AS a(position integer, option integer, correct boolean, confidence text)
     JOIN public.arinova_questions q ON q.test_id = $5 AND q.position = a.position
     LEFT JOIN public.arinova_options o ON o.question_id = q.id AND o.position = a.option`,
    [
      attempt.id,
      userId,
      JSON.stringify(
        attempt.answers.map((a, position) => ({
          position,
          option: a.option,
          correct: a.correct,
          confidence: a.confidence,
        })),
      ),
      attempt.createdAt,
      attempt.setId,
    ],
  );
}

export async function readSets(client: Client): Promise<StudySet[]> {
  const result = await client.query(`
    SELECT t.id, t.title, s.subject_name AS subject, t.language, t.description,
      t.material, t.is_sample, t.created_at, t.source, t.file_name, t.deleted_at,
      t.lesson, g.name AS group_name, t.test_type, t.difficulty,
      to_char(t.added_date, 'YYYY-MM-DD') AS added_date,
      COALESCE((
        -- Pictures are listed as the URLs that serve them, not their data.
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'prompt', q.question_text,
          'explanation', q.explanation,
          'options', (SELECT jsonb_agg(o.option_text ORDER BY o.position)
                      FROM public.arinova_options o WHERE o.question_id = q.id),
          'correctIndex', (SELECT min(o.position)
                           FROM public.arinova_options o
                           WHERE o.question_id = q.id AND o.is_answer),
          'image', CASE WHEN q.image IS NOT NULL
                   THEN '/api/images/' || t.id || '/' || q.position END,
          'optionImages', (
            SELECT CASE WHEN bool_or(o.image IS NOT NULL) THEN jsonb_agg(
              CASE WHEN o.image IS NOT NULL
              THEN '/api/images/' || t.id || '/' || q.position || '/' || o.position
              END ORDER BY o.position) END
            FROM public.arinova_options o WHERE o.question_id = q.id)
        )) ORDER BY q.position)
        FROM public.arinova_questions q WHERE q.test_id = t.id
      ), '[]') AS questions
    FROM public.arinova_tests t
    JOIN public.arinova_subjects s ON s.id = t.subject_id
    LEFT JOIN public.arinova_groups g ON g.id = t.group_id
    ORDER BY t.created_at DESC
  `);
  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    language: r.language,
    description: r.description,
    material: r.material,
    questions: r.questions,
    createdAt: r.created_at.toISOString(),
    ...(r.is_sample ? { sample: true } : {}),
    ...(r.source ? { source: r.source } : {}),
    ...(r.file_name ? { fileName: r.file_name } : {}),
    ...(r.lesson ? { lesson: r.lesson } : {}),
    ...(r.group_name ? { group: r.group_name } : {}),
    ...(r.test_type ? { testType: r.test_type } : {}),
    ...(r.difficulty ? { difficulty: r.difficulty } : {}),
    ...(r.added_date ? { addedDate: r.added_date } : {}),
    ...(r.deleted_at ? { deletedAt: r.deleted_at.toISOString() } : {}),
  }));
}

// Soft delete: the set and its answers stay, but it leaves the library.
export async function markDeleted(
  client: Client,
  setId: string,
  deleted: boolean,
) {
  const result = await client.query(
    `UPDATE public.arinova_tests
     SET deleted_at = CASE WHEN $2 THEN now() ELSE NULL END
     WHERE id = $1`,
    [setId, deleted],
  );
  return !!result.rowCount;
}

export async function readAttempts(client: Client): Promise<Attempt[]> {
  const result = await client.query(`
    SELECT a.id, a.test_id, t.title, s.subject_name AS subject, a.created_at,
      a.correct, a.total,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'option', o.position,
          'confidence', x.confidence,
          'prompt', q.question_text,
          'selected', o.option_text,
          'correctAnswer', (SELECT c.option_text FROM public.arinova_options c
                            WHERE c.question_id = q.id AND c.is_answer
                            ORDER BY c.position LIMIT 1),
          'correct', x.is_correct,
          'explanation', q.explanation
        ) ORDER BY q.position)
        FROM public.arinova_user_question_answers x
        JOIN public.arinova_questions q ON q.id = x.question_id
        LEFT JOIN public.arinova_options o ON o.id = x.options_id
        WHERE x.attempt_id = a.id
      ), '[]') AS answers
    FROM public.arinova_attempts a
    JOIN public.arinova_tests t ON t.id = a.test_id
    JOIN public.arinova_subjects s ON s.id = t.subject_id
    ORDER BY a.created_at DESC
  `);
  return result.rows.map((r) => ({
    id: r.id,
    setId: r.test_id,
    title: r.title,
    subject: r.subject,
    createdAt: r.created_at.toISOString(),
    answers: r.answers,
    correct: r.correct,
    total: r.total,
  }));
}

export async function readImage(
  client: Client,
  setId: string,
  question: number,
  option?: number,
): Promise<string | null> {
  const result =
    option === undefined
      ? await client.query(
          'SELECT image FROM public.arinova_questions WHERE test_id = $1 AND position = $2',
          [setId, question],
        )
      : await client.query(
          `SELECT o.image FROM public.arinova_options o
           JOIN public.arinova_questions q ON q.id = o.question_id
           WHERE q.test_id = $1 AND q.position = $2 AND o.position = $3`,
          [setId, question, option],
        );
  return result.rows[0]?.image ?? null;
}

export async function readCatalog(client: Client): Promise<Catalog> {
  const groups = await client.query(
    'SELECT name FROM public.arinova_groups ORDER BY name',
  );
  const subjects = await client.query(
    `SELECT s.subject_name, g.name AS group_name
     FROM public.arinova_subjects s
     LEFT JOIN public.arinova_groups g ON g.id = s.group_id
     ORDER BY s.subject_name`,
  );
  return {
    groups: groups.rows.map((r) => r.name),
    subjects: subjects.rows.map((r) => ({
      name: r.subject_name,
      group: r.group_name,
    })),
  };
}

// False when a group with this name already exists, in any case.
export async function insertGroup(client: Client, name: string) {
  const result = await client.query(
    `INSERT INTO public.arinova_groups (name)
     SELECT $1 WHERE NOT EXISTS (
       SELECT 1 FROM public.arinova_groups WHERE lower(name) = lower($1))
     ON CONFLICT (name) DO NOTHING`,
    [name],
  );
  return !!result.rowCount;
}

// Subject names are unique (in any case), so a subject belongs to one group.
// One that was imported without a group is filed under the chosen group; one
// that is already in a group is left alone and that group is returned.
export async function insertSubject(
  client: Client,
  name: string,
  group: string,
): Promise<{ created: true } | { created: false; group: string | null }> {
  const existing = await client.query(
    `SELECT s.id, g.name AS group_name FROM public.arinova_subjects s
     LEFT JOIN public.arinova_groups g ON g.id = s.group_id
     WHERE lower(s.subject_name) = lower($1) LIMIT 1`,
    [name],
  );
  const row = existing.rows[0];
  if (row?.group_name) return { created: false, group: row.group_name };
  const groupId = '(SELECT id FROM public.arinova_groups WHERE name = $2)';
  const done = row
    ? await client.query(
        `UPDATE public.arinova_subjects SET group_id = ${groupId} WHERE id = $1`,
        [row.id, group],
      )
    : await client.query(
        `INSERT INTO public.arinova_subjects (subject_name, group_id)
         VALUES ($1, ${groupId}) ON CONFLICT (subject_name) DO NOTHING`,
        [name, group],
      );
  return done.rowCount ? { created: true } : { created: false, group: null };
}

// Adds a question after the last one of a test; false if there is no such test.
export async function insertQuestion(
  client: Client,
  setId: string,
  question: Question,
) {
  // Locking the test keeps two questions added at once from sharing a position.
  const test = await client.query(
    'SELECT subject_id FROM public.arinova_tests WHERE id = $1 FOR UPDATE',
    [setId],
  );
  if (!test.rowCount) return false;
  const inserted = await client.query(
    `INSERT INTO public.arinova_questions
       (subject_id, test_id, position, question_text, explanation, answer_count, image)
     SELECT $1, $2, COALESCE(max(position) + 1, 0), $3, $4, 1, $5
     FROM public.arinova_questions WHERE test_id = $2
     RETURNING id`,
    [
      test.rows[0].subject_id,
      setId,
      question.prompt,
      question.explanation,
      question.image ?? null,
    ],
  );
  await client.query(
    `INSERT INTO public.arinova_options (question_id, position, option_text, is_answer, image)
     SELECT $1, o.position, o.text, o.is_answer, o.image
     FROM jsonb_to_recordset($2) AS o(position integer, text text, is_answer boolean, image text)`,
    [
      inserted.rows[0].id,
      JSON.stringify(
        question.options.map((text, position) => ({
          position,
          text,
          is_answer: position === question.correctIndex,
          image: question.optionImages?.[position] ?? null,
        })),
      ),
    ],
  );
  return true;
}
