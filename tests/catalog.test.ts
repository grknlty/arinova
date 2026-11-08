import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('groups, and subjects in a group, match names in any case', async () => {
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
    assert.deepEqual((await store.catalog()).subjects, [
      { name: 'Engels', group: 'Groep 5' },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
