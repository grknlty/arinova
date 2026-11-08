import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from '../lib/database';
import { addAttempt, addSets, image, list, setDeleted } from '../lib/store';
import { tables } from '../lib/records';
import { allowLogin } from '../lib/rate-limit';
import { grade } from '../lib/model';
import { sample } from '../lib/sample';

test(
  'PostgreSQL storage, throttling and anonymous-role isolation',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    // This suite creates tables and a test role; use a disposable local database only.
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(
      ['localhost', '127.0.0.1'].includes(url.hostname),
      'Integration tests require a local disposable PostgreSQL database',
    );
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;
    const db = await database();
    assert.ok(db);
    try {
      await t.test(
        'creates owner-accessible tables with RLS enabled',
        async () => {
          const result = await db.query(
            "SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)",
            [['arinova_records', 'arinova_login_limits', ...tables]],
          );
          assert.equal(result.rows.length, tables.length + 2);
          assert.ok(result.rows.every((row) => row.relrowsecurity));
        },
      );
      await t.test(
        'persists imported content and scored attempts via POSTGRES_URL',
        async () => {
          const { sample: _, ...content } = sample;
          void _;
          const set = {
            ...content,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            title: 'PostgreSQL integration fixture',
          };
          await addSets([set]);
          const stored = (await list('sets')).find((s) => s.id === set.id);
          assert.deepEqual(stored, set);
          const attempt = grade(set, [
            { option: 2, confidence: 'best_guess' },
            { option: 0, confidence: 'sure' },
            { option: null, confidence: 'not_understood' },
          ]);
          await addAttempt(attempt, 'learner');
          assert.deepEqual(
            (await list('attempts')).find((a) => a.id === attempt.id),
            attempt,
          );
          // Each answer is a row pointing at its question and chosen option.
          const rows = await db.query(
            `SELECT u.role, q.position, o.option_text, x.is_correct, x.confidence
             FROM public.arinova_user_question_answers x
             JOIN public.arinova_users u ON u.id = x.user_id
             JOIN public.arinova_questions q ON q.id = x.question_id
             LEFT JOIN public.arinova_options o ON o.id = x.options_id
             WHERE x.attempt_id = $1 ORDER BY q.position`,
            [attempt.id],
          );
          assert.deepEqual(
            rows.rows.map((r) => [
              r.role,
              r.position,
              r.is_correct,
              r.confidence,
            ]),
            [
              ['learner', 0, true, 'best_guess'],
              ['learner', 1, false, 'sure'],
              ['learner', 2, false, 'not_understood'],
            ],
          );
          assert.equal(rows.rows[2].option_text, null);
          assert.ok(!(await list('sets')).some((s) => s.id === sample.id));
        },
      );
      await t.test(
        'records where material came from; deleting keeps attempts',
        async () => {
          const { sample: _, ...content } = sample;
          void _;
          const set = {
            ...content,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            source: 'word' as const,
            fileName: 'Toets.docx',
            lesson: 'Les 3 tot en met 5',
            group: 'Groep 6',
            testType: 'single-choice' as const,
            difficulty: 'easy' as const,
            addedDate: '2026-11-07',
          };
          await addSets([set]);
          const attempt = grade(
            set,
            set.questions.map(() => ({
              option: 0,
              confidence: 'sure' as const,
            })),
          );
          await addAttempt(attempt, 'learner');
          const find = async () =>
            (await list('sets')).find((s) => s.id === set.id)!;
          assert.equal((await find()).source, 'word');
          assert.equal((await find()).fileName, 'Toets.docx');
          assert.equal((await find()).lesson, 'Les 3 tot en met 5');
          assert.equal((await find()).group, 'Groep 6');
          assert.equal((await find()).testType, 'single-choice');
          assert.equal((await find()).difficulty, 'easy');
          assert.equal((await find()).addedDate, '2026-11-07');
          assert.equal(await setDeleted(set.id, true), true);
          assert.ok((await find()).deletedAt);
          assert.ok((await list('attempts')).some((a) => a.id === attempt.id));
          assert.equal(await setDeleted(set.id, false), true);
          assert.equal('deletedAt' in (await find()), false);
          assert.equal(await setDeleted(crypto.randomUUID(), true), false);
        },
      );
      await t.test('stores pictures and lists them as URLs', async () => {
        const png = 'data:image/png;base64,iVBORw0KGgo=';
        const { sample: _, ...content } = sample;
        void _;
        const set = {
          ...content,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          questions: content.questions.map((q, i) =>
            i === 0
              ? {
                  ...q,
                  image: png,
                  optionImages: q.options.map((_, j) => (j === 1 ? png : null)),
                }
              : q,
          ),
        };
        await addSets([set]);
        const stored = (await list('sets')).find((s) => s.id === set.id)!;
        assert.equal(stored.questions[0].image, `/api/images/${set.id}/0`);
        assert.deepEqual(stored.questions[0].optionImages, [
          null,
          `/api/images/${set.id}/0/1`,
          null,
          null,
        ]);
        assert.equal('image' in stored.questions[1], false);
        assert.equal(await image(set.id, 0), png);
        assert.equal(await image(set.id, 0, 1), png);
        assert.equal(await image(set.id, 0, 0), null);
      });
      await t.test(
        'login limiting persists and enforces its limit in PostgreSQL',
        async () => {
          const req = new Request('http://localhost/api/auth');
          const role = `test-${crypto.randomUUID()}`;
          for (let i = 0; i < 20; i++)
            assert.equal(await allowLogin(req, role), true);
          assert.equal(await allowLogin(req, role), false);
          assert.ok(
            (
              await db.query(
                'SELECT count FROM public.arinova_login_limits WHERE count=21',
              )
            ).rowCount,
          );
        },
      );
      await t.test(
        'RLS blocks reads and writes even with Supabase-style table grants',
        async () => {
          await db.query('CREATE ROLE arinova_test_anon NOLOGIN');
          await db.query('GRANT USAGE ON SCHEMA public TO arinova_test_anon');
          await db.query(
            `GRANT ALL ON ${['arinova_records', 'arinova_login_limits', ...tables].map((t) => `public.${t}`).join(', ')} TO arinova_test_anon`,
          );
          const client = await db.connect();
          try {
            await client.query('SET ROLE arinova_test_anon');
            for (const table of [
              'arinova_records',
              'arinova_login_limits',
              ...tables.toReversed(),
            ]) {
              assert.equal(
                (await client.query(`SELECT * FROM public.${table}`)).rowCount,
                0,
              );
              assert.equal(
                (await client.query(`DELETE FROM public.${table}`)).rowCount,
                0,
              );
            }
            await assert.rejects(
              client.query(
                "INSERT INTO public.arinova_records (id,kind,payload) VALUES (gen_random_uuid(),'sets','{}')",
              ),
              { code: '42501' },
            );
            await assert.rejects(
              client.query(
                "INSERT INTO public.arinova_login_limits (key,count,expires) VALUES ('anonymous',1,0)",
              ),
              { code: '42501' },
            );
          } finally {
            await client.query('RESET ROLE');
            client.release();
            await db.query('DROP OWNED BY arinova_test_anon');
            await db.query('DROP ROLE arinova_test_anon');
          }
        },
      );
    } finally {
      await db.end();
    }
  },
);
