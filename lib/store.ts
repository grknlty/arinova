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
  renameRecord,
  markDeleted,
  readImage,
  readSets,
  type Catalog,
  type Renamed,
} from './records';
type Data = {
  sets: StudySet[];
  attempts: Attempt[];
  // Groups and subjects with ids, so they can be renamed; older files have
  // neither, and files from before ids have groups as plain names.
  groups?: { id: string; name: string }[];
  subjects?: { id?: string; name: string; group: string }[];
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
// Gives every group and subject in a local file an id, as the database
// does: groups and subjects of imported sets are added, and the first group
// (the learner's) is made when there is none. True when anything changed.
function withIds(data: Data) {
  const before = JSON.stringify([data.groups, data.subjects]);
  const groups = (
    (data.groups ?? []) as ({ id: string; name: string } | string)[]
  ).map((g) =>
    typeof g === 'string' ? { id: crypto.randomUUID(), name: g } : g,
  );
  const has = (name: string) =>
    groups.some((g) => g.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!groups.length)
    groups.push({ id: crypto.randomUUID(), name: learnerGroup() });
  for (const set of data.sets)
    if (set.group && !has(set.group))
      groups.push({ id: crypto.randomUUID(), name: set.group });
  const subjects = (data.subjects ?? []).map((s) => ({
    ...s,
    id: s.id ?? crypto.randomUUID(),
  }));
  for (const set of data.sets)
    if (!subjects.some((s) => s.name === set.subject))
      subjects.push({
        id: crypto.randomUUID(),
        name: set.subject,
        group: groups[0].name,
      });
  data.groups = groups;
  data.subjects = subjects;
  return JSON.stringify([data.groups, data.subjects]) !== before;
}
async function localCatalog() {
  // Ids are saved first and read back, so callers see the stored ones.
  if (withIds(await local())) await writeLocal(withIds);
  const data = await local();
  withIds(data);
  return data as Data & {
    groups: { id: string; name: string }[];
    subjects: { id: string; name: string; group: string }[];
  };
}
export async function catalog(): Promise<Catalog> {
  const db = await database();
  if (db) return readCatalog(db);
  const data = await localCatalog();
  return {
    groups: [...data.groups].sort((a, b) => a.name.localeCompare(b.name)),
    subjects: [...data.subjects].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
const same = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();
// False when the group already exists.
export async function addGroup(name: string) {
  const db = await database();
  if (db) return insertGroup(db, name);
  if ((await localCatalog()).groups.some((g) => same(g.name, name)))
    return false;
  await writeLocal((data) => {
    withIds(data);
    data.groups!.push({ id: crypto.randomUUID(), name });
  });
  return true;
}
// The group (by id) must exist. When the subject exists already (in any
// case), says which group it belongs to.
export async function addSubject(name: string, groupId: string) {
  const db = await database();
  if (db) return insertSubject(db, name, groupId);
  const data = await localCatalog();
  const existing = data.subjects.find((s) => same(s.name, name));
  if (existing) return { created: false as const, group: existing.group };
  const group = data.groups.find((g) => g.id === groupId)!.name;
  await writeLocal((data) => {
    withIds(data);
    data.subjects!.push({ id: crypto.randomUUID(), name, group });
  });
  return { created: true as const };
}
// Renames a group or subject, keeping its id. In a local file sets and
// results keep names, so they are renamed along with it.
export async function renameEntry(
  kind: 'group' | 'subject',
  id: string,
  name: string,
): Promise<Renamed> {
  const db = await database();
  if (db) return renameRecord(db, kind, id, name);
  let result: Renamed = 'missing';
  await writeLocal((data) => {
    withIds(data);
    const list = (kind === 'group' ? data.groups : data.subjects) as {
      id: string;
      name: string;
    }[];
    const item = list.find((x) => x.id === id);
    if (!item) return;
    if (list.some((x) => x.id !== id && same(x.name, name))) {
      result = 'exists';
      return;
    }
    const old = item.name;
    item.name = name;
    result = 'renamed';
    if (kind === 'group') {
      for (const s of data.subjects!) if (s.group === old) s.group = name;
      for (const s of data.sets) if (s.group === old) s.group = name;
    } else {
      for (const s of data.sets) if (s.subject === old) s.subject = name;
      for (const a of data.attempts) if (a.subject === old) a.subject = name;
    }
  });
  return result;
}
