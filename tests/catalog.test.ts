import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { subjects as fixedSubjects } from '../lib/subjects';

test('groups and subjects get ids, match names in any case and rename in place', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arinova-catalog-'));
  process.env.ARINOVA_DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.LEARNER_GROUP;
  try {
    // A file from before ids: groups as names, a subject without an id.
    await writeFile(
      path.join(dir, 'store.json'),
      JSON.stringify({
        sets: [],
        attempts: [],
        groups: ['Groep 7–8'],
        subjects: [{ name: 'Taal', group: 'Groep 7–8' }],
      }),
    );
    const store = await import('../lib/store');
    const first = await store.catalog();
    assert.deepEqual(
      first.groups.map((g) => g.name),
      ['Groep 7–8'],
    );
    assert.ok(first.groups[0].id && first.subjects[0].id);
    // Ids are kept from one read to the next.
    assert.deepEqual(await store.catalog(), first);

    assert.equal(await store.addGroup('Groep 5'), true);
    assert.equal(await store.addGroup('groep 5'), false);
    const groep5 = (await store.catalog()).groups.find(
      (g) => g.name === 'Groep 5',
    )!;
    assert.deepEqual(await store.addSubject('Engels', groep5.id), {
      created: true,
    });
    assert.deepEqual(await store.addSubject('engels', first.groups[0].id), {
      created: false,
      group: 'Groep 5',
    });

    const set = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: 'Dieren',
      subject: 'Engels',
      language: 'en' as const,
      description: '',
      material: '',
      group: 'Groep 5',
      questions: [
        {
          prompt: 'Dog?',
          options: ['Hond', 'Kat'],
          correctIndex: 0,
          explanation: '',
        },
      ],
    };
    await store.addSets([set]);
    const engels = (await store.catalog()).subjects.find(
      (s) => s.name === 'Engels',
    )!;
    assert.equal(
      await store.renameEntry('group', groep5.id, 'Groep 6'),
      'renamed',
    );
    assert.equal(
      await store.renameEntry('subject', engels.id, 'taal'),
      'exists',
    );
    assert.equal(
      await store.renameEntry('subject', engels.id, 'English'),
      'renamed',
    );
    assert.equal(
      await store.renameEntry('group', crypto.randomUUID(), 'X'),
      'missing',
    );
    const after = await store.catalog();
    assert.deepEqual(
      after.groups.map((g) => [g.id, g.name]).sort(),
      [
        [first.groups[0].id, 'Groep 7–8'],
        [groep5.id, 'Groep 6'],
      ].sort(),
    );
    assert.deepEqual(
      after.subjects.find((s) => s.id === engels.id),
      { id: engels.id, name: 'English', group: 'Groep 6' },
    );
    // Sets keep names in a local file, so they follow the rename.
    const saved = JSON.parse(
      await readFile(path.join(dir, 'store.json'), 'utf8'),
    );
    assert.equal(saved.sets[0].subject, 'English');
    assert.equal(saved.sets[0].group, 'Groep 6');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('one subject under different spellings becomes one subject', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arinova-catalog-'));
  process.env.ARINOVA_DATA_DIR = dir;
  try {
    const set = (subject: string) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: subject,
      subject,
      language: 'nl',
      description: '',
      material: '',
      questions: [
        { prompt: '?', options: ['a', 'b'], correctIndex: 0, explanation: '' },
      ],
    });
    await writeFile(
      path.join(dir, 'store.json'),
      JSON.stringify({
        sets: [
          set('Natuur en Techniek'),
          set('Natuur & Techniek'),
          set('engels'),
          set('Engels'),
        ],
        attempts: [],
      }),
    );
    // The store module keeps its data folder from the first import.
    const store = await import(`../lib/store.ts?merge=${Date.now()}`);
    const { subjects } = await store.catalog();
    // The fixed school subjects are added too, once.
    assert.deepEqual(
      subjects.map((s: { name: string }) => s.name),
      [...fixedSubjects.map((s) => s.name), 'engels'].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
    const verkeer = subjects.find(
      (s: { name: string }) => s.name === 'Verkeer',
    );
    await store.renameEntry('subject', verkeer.id, 'Verkeersles');
    const names = (await store.catalog()).subjects.map(
      (s: { name: string }) => s.name,
    );
    assert.ok(names.includes('Verkeersles') && !names.includes('Verkeer'));
    assert.deepEqual(
      (await store.list('sets')).map((s: { subject: string }) => s.subject),
      ['Natuur en Techniek', 'Natuur en Techniek', 'engels', 'engels'],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an exported set has everything the import needs, pictures included', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arinova-export-'));
  process.env.ARINOVA_DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  try {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const { setSchema } = await import('../lib/model');
    const set = setSchema.parse({
      title: 'Les 1 – Levende doden',
      subject: 'Natuur & Techniek',
      language: 'nl',
      material: 'Lesstof',
      group: 'Groep 7',
      theme: 'Thema 7.1',
      lesson: 'Les 1',
      testStyle: 'cito',
      questions: [
        {
          prompt: 'Wat leeft?',
          options: ['Steen', 'Plant'],
          correctIndex: 1,
          explanation: 'Een plant groeit.',
          image: png,
          optionImages: [null, png],
        },
      ],
    });
    const id = '11111111-2222-4333-8444-555555555555';
    await writeFile(
      path.join(dir, 'store.json'),
      JSON.stringify({
        sets: [
          {
            ...set,
            id,
            createdAt: '2026-11-08T09:00:00.000Z',
            deletedAt: '2026-11-08T10:00:00.000Z',
          },
        ],
        attempts: [],
      }),
    );
    const store = await import(`../lib/store.ts?export=${Date.now()}`);
    const exported = await store.exportSet(id);
    assert.ok(exported);
    assert.equal('id' in exported, false);
    assert.equal('deletedAt' in exported, false);
    // Imported again, it is the same set.
    assert.deepEqual(setSchema.parse(exported), set);
    assert.equal(
      await store.exportSet('11111111-2222-4333-8444-000000000000'),
      null,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
