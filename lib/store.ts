import type { Pool, PoolClient } from 'pg';
import { database } from './database';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StudySet, Attempt } from './model';
import type { Role } from './auth';
import {
  insertAttempt,
  insertGroup,
  insertSet,
  insertSubject,
  learnerGroup,
  readAttempts,
  readCatalog,
  markDeleted,
  readImage,
  readSets,
  type Catalog,
} from './records';
type Data = {
  sets: StudySet[];
  attempts: Attempt[];
  // Added by the parent; older files have neither.
  groups?: string[];
  subjects?: { name: string; group: string }[];
};
const globalStore = globalThis as unknown as {
  arinovaQueue?: Promise<unknown>;
};
export const directory =
  process.env.ARINOVA_DATA_DIR ?? path.join(process.cwd(), '.data');
async function local(): Promise<Data> {
  try {
    return JSON.parse(
      await readFile(path.join(directory, 'store.json'), 'utf8'),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return { sets: [], attempts: [] };
    throw e;
  }
}
export async function list<T extends 'sets' | 'attempts'>(
  kind: T,
): Promise<Data[T]> {
  const db = await database();
  if (db)
    return (
      kind === 'sets' ? await readSets(db) : await readAttempts(db)
    ) as Data[T];
  return (await local())[kind];
}
async function transaction(
  db: Pool,
  work: (client: PoolClient) => Promise<void>,
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await work(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function addSets(sets: StudySet[]) {
  const db = await database();
  if (db)
    return transaction(db, async (client) => {
      for (const set of sets) await insertSet(client, set);
    });
  await writeLocal((data) => data.sets.unshift(...sets));
}
export async function addAttempt(attempt: Attempt, role: Role) {
  const db = await database();
  if (db)
    return transaction(db, (client) => insertAttempt(client, attempt, role));
  await writeLocal((data) => data.attempts.unshift(attempt));
}
async function writeLocal(change: (data: Data) => void) {
  const write = async () => {
    const data = await local();
    change(data);
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `${crypto.randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await rename(temporary, path.join(directory, 'store.json'));
  };
  const pending = (globalStore.arinovaQueue ?? Promise.resolve()).then(write);
  globalStore.arinovaQueue = pending.catch(() => {});
  await pending;
}
// A picture's data URL, by set, question and (for option pictures) option.
export async function image(setId: string, question: number, option?: number) {
  const db = await database();
  if (db) return readImage(db, setId, question, option);
  const q = (await local()).sets.find((s) => s.id === setId)?.questions[
    question
  ];
  return (option === undefined ? q?.image : q?.optionImages?.[option]) ?? null;
}
// Deletes (or with deleted false, restores) a set; false if it does not exist.
export async function setDeleted(setId: string, deleted: boolean) {
  const db = await database();
  if (db) return markDeleted(db, setId, deleted);
  let found = false;
  await writeLocal((data) => {
    const at = deleted ? new Date().toISOString() : undefined;
    const set = data.sets.find((s) => s.id === setId);
    if (!set) return;
    found = true;
    if (at) set.deletedAt = at;
    else delete set.deletedAt;
  });
  return found;
}
// Groups and subjects, as the database keeps them: the learner's group always
// exists, and subjects of imported sets are filed under it.
export async function catalog(): Promise<Catalog> {
  const db = await database();
  if (db) return readCatalog(db);
  const data = await local();
  const subjects = [...(data.subjects ?? [])];
  for (const set of data.sets)
    if (!subjects.some((s) => s.name === set.subject))
      subjects.push({ name: set.subject, group: learnerGroup() });
  const groups = new Set([
    learnerGroup(),
    ...(data.groups ?? []),
    ...data.sets.flatMap((s) => (s.group ? [s.group] : [])),
  ]);
  return {
    groups: [...groups].sort(),
    subjects: subjects.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
// False when the group already exists.
export async function addGroup(name: string) {
  const db = await database();
  if (db) return insertGroup(db, name);
  const key = name.toLocaleLowerCase();
  if ((await catalog()).groups.some((g) => g.toLocaleLowerCase() === key))
    return false;
  await writeLocal((data) => (data.groups = [...(data.groups ?? []), name]));
  return true;
}
// The group must exist. When the subject exists already (in any case), says
// which group it belongs to.
export async function addSubject(name: string, group: string) {
  const db = await database();
  if (db) return insertSubject(db, name, group);
  const key = name.toLocaleLowerCase();
  const existing = (await catalog()).subjects.find(
    (s) => s.name.toLocaleLowerCase() === key,
  );
  if (existing) return { created: false as const, group: existing.group };
  await writeLocal(
    (data) => (data.subjects = [...(data.subjects ?? []), { name, group }]),
  );
  return { created: true as const };
}
