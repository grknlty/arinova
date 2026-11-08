import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSets } from '../lib/formats';
import { imageUrls, importProblems, publicSet, setSchema } from '../lib/model';

const png = 'iVBORw0KGgo=';
const toets = {
  subject: 'Verkeer',
  toetsname: 'Les 3 set1',
  title: 'Verkeer met afbeeldingen',
  language: 'nl',
  lessons: [3, 4, 5],
  questions: [
    {
      id: 1,
      question: 'Wat betekent dit bord?',
      image: { mimeType: 'image/png', encoding: 'base64', data: png },
      options: [
        { option1: 'Verboden', isExpectedAnswer: 'no', image: null },
        {
          option2: 'Verplicht fietspad',
          isExpectedAnswer: 'yes',
          explanationIfExpected: 'Rond en blauw: verplicht.',
          image: { mimeType: 'image/png', data: png },
        },
      ],
    },
  ],
};

test('converts the toets layout, including pictures', () => {
  const set = setSchema.parse(normalizeSets(toets));
  assert.equal(set.title, 'Verkeer met afbeeldingen – Les 3 set1');
  assert.equal(set.description, '');
  assert.equal(set.lesson, 'Les 3, 4 en 5');
  assert.deepEqual(set.questions[0], {
    prompt: 'Wat betekent dit bord?',
    options: ['Verboden', 'Verplicht fietspad'],
    correctIndex: 1,
    explanation: 'Rond en blauw: verplicht.',
    image: `data:image/png;base64,${png}`,
    optionImages: [null, `data:image/png;base64,${png}`],
  });
  const several = normalizeSets({ tests: [toets, toets] });
  assert.ok(Array.isArray(several) && several.length === 2);
});

test('leaves the app format alone and rejects unclear answers', () => {
  const own = { title: 'x', questions: [{ prompt: 'p' }] };
  assert.equal(normalizeSets(own), own);
  const twice = structuredClone(toets);
  twice.questions[0].options[0].isExpectedAnswer = 'yes';
  const result = setSchema.safeParse(normalizeSets(twice));
  assert.equal(result.success, false);
  assert.equal(
    importProblems(result.error!),
    'Question 1: needs exactly one correct answer',
  );
});

test('reads null pictures as no picture', () => {
  const set = setSchema.parse({
    title: 'Planten',
    subject: 'Natuur',
    language: 'nl',
    questions: [
      {
        prompt: 'Welke groep?',
        image: null,
        options: ['Wieren', 'Mossen'],
        optionImages: [null, null],
        correctIndex: 0,
      },
      {
        prompt: 'Welke plant?',
        options: ['Varen', 'Mos'],
        optionImages: null,
        correctIndex: 1,
      },
    ],
  });
  for (const q of set.questions) {
    assert.equal('image' in q, false);
    assert.equal('optionImages' in q, false);
  }
});

test('rejects pictures that are not plain image data', () => {
  for (const image of [
    'data:image/svg+xml;base64,PHN2Zz4=',
    'https://example.com/a.png',
  ]) {
    const set = structuredClone(toets) as { questions: { image: unknown }[] };
    set.questions[0].image = image;
    assert.equal(setSchema.safeParse(normalizeSets(set)).success, false);
  }
});

test('lists pictures as URLs, also for learners', () => {
  const set = {
    ...setSchema.parse(normalizeSets(toets)),
    id: '5e0c8a52-6f3f-4f43-9a45-2b8f1a0c1d11',
    createdAt: new Date().toISOString(),
  };
  const listed = publicSet(imageUrls(set)).questions[0];
  assert.equal(listed.image, `/api/images/${set.id}/0`);
  assert.deepEqual(listed.optionImages, [null, `/api/images/${set.id}/0/1`]);
  assert.equal('correctIndex' in listed, false);
});
