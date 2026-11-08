import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('groups, subjects in a group, and questions added one by one', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'arinova-catalog-'));
  process.env.ARINOVA_DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.LEARNER_GROUP;
  try {
    const store = await import('../lib/store');
    assert.deepEqual(await store.catalog(), {
      groups: ['Groep 7–8'],
      subjects: [],
    });
    assert.equal(await store.addGroup('Groep 5'), true);
    assert.equal(await store.addGroup('Groep 5'), false);
    assert.equal(await store.addGroup('groep 5'), false);
    assert.deepEqual(await store.addSubject('Engels', 'Groep 5'), {
      created: true,
    });
    assert.deepEqual(await store.addSubject('engels', 'Groep 7–8'), {
      created: false,
      group: 'Groep 5',
    });
    const question = {
      prompt: 'Dog?',
      options: ['Hond', 'Kat'],
      correctIndex: 0,
      explanation: '',
    };
    const set = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: 'Dieren',
      subject: 'Engels',
      language: 'en' as const,
      description: '',
      material: '',
      group: 'Groep 5',
      questions: [question],
    };
    await store.addSets([set]);
    assert.equal(
      await store.addQuestion(set.id, { ...question, prompt: 'Cat?' }),
      true,
    );
    assert.equal(await store.addQuestion(crypto.randomUUID(), question), false);
    const stored = (await store.list('sets')).find((s) => s.id === set.id);
    assert.deepEqual(
      stored?.questions.map((q) => q.prompt),
      ['Dog?', 'Cat?'],
    );
    assert.deepEqual((await store.catalog()).subjects, [
      { name: 'Engels', group: 'Groep 5' },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
