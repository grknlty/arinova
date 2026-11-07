import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, publicSet, setSchema, attemptSchema } from '../lib/model';
import { sample } from '../lib/sample';
test('grading separates correctness, confidence, guesses and skipped questions', () => {
  const a = grade(sample, [
    { option: 2, confidence: 'best_guess' },
    { option: 0, confidence: 'sure' },
    { option: null, confidence: 'not_understood' },
  ]);
  assert.equal(a.correct, 1);
  assert.equal(a.total, 3);
  assert.equal(a.answers[0].confidence, 'best_guess');
  assert.equal(a.answers[0].correct, true);
  assert.equal(a.answers[1].correct, false);
  assert.equal(a.answers[2].selected, null);
  assert.equal(a.answers[2].correctAnswer, 'Bijen helpen planten.');
});
test('reject incomplete, invalid and unmarked skipped answers', () => {
  assert.throws(() => grade(sample, []));
  assert.throws(() =>
    grade(
      sample,
      sample.questions.map(() => ({ option: 10, confidence: 'sure' })),
    ),
  );
  assert.throws(() =>
    grade(
      sample,
      sample.questions.map(() => ({ option: null, confidence: 'sure' })),
    ),
  );
  assert.equal(
    attemptSchema.safeParse({
      setId: sample.id,
      answers: [{ option: 1, confidence: 'made-up' }],
    }).success,
    false,
  );
});
test('learner payload never includes answer keys or explanations', () => {
  const q = publicSet(sample).questions[0];
  assert.equal('correctIndex' in q, false);
  assert.equal('explanation' in q, false);
});
test('import validates correct indices, sizes and supported content languages', () => {
  assert.equal(setSchema.safeParse(sample).success, true);
  assert.equal(
    setSchema.safeParse({ ...sample, language: 'de' }).success,
    false,
  );
  assert.equal(
    setSchema.safeParse({
      ...sample,
      questions: [{ prompt: 'Q', options: ['A', 'B'], correctIndex: 2 }],
    }).success,
    false,
  );
});

test('import maps subject shorthands to the fixed school subjects', () => {
  const subjectOf = (subject: string) =>
    setSchema.parse({ ...sample, subject }).subject;
  assert.equal(subjectOf('topo'), 'Topografie');
  assert.equal(subjectOf(' REKENEN '), 'Rekenen');
  assert.equal(subjectOf('ardkunde'), 'Aardrijkskunde');
  assert.equal(subjectOf('Huiswerk'), 'Huiswerk');
  assert.equal(subjectOf('History'), 'Geschiedenis');
  assert.equal(subjectOf('tarih'), 'Geschiedenis');
  assert.equal(subjectOf('Natuur & Techniek'), 'Natuur en Techniek');
  assert.equal(subjectOf('science'), 'Natuur en Techniek');
  assert.equal(subjectOf('Muziek'), 'Muziek');
});
