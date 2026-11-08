import type { Pool, PoolClient } from 'pg';
import { database } from './database';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StudySet, Attempt, SetDetails } from './model';
import type { Role } from './auth';
import { canonicalSubject, subjects as fixedSubjects } from './subjects';
import type { ButtonKey, CardLayout, FactKey } from './facts';
import {
  insertAttempt,
  insertGroup,
  insertSet,
  insertSubject,
  learnerGroup,
  readAttempts,
  readCatalog,
  renameRecord,
  updateCardLayout,
  markDeleted,
  updateDetails,
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
  subjects?: {
    id?: string;
    name: string;
    group: string;
    factOrder?: FactKey[];
    factCount?: number;
    buttonOrder?: ButtonKey[];
    buttonsPerRow?: number;
  }[];
  // Set once the fixed school subjects were added, as in the database.
  subjectsSeeded?: boolean;
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
// One set as the JSON the import takes back: all its details, questions and
// options, with its pictures as data. Its id and dates of saving and deleting
// are left out. Every question names its picture and one per option, null
// where there is none, so the file shows where pictures can go. Null if
// there is no such set.
export async function exportSet(setId: string) {
  const set = (await list('sets')).find((s) => s.id === setId);
  if (!set) return null;
  const { id, createdAt, deletedAt, sample, ...details } = set;
  void [id, createdAt, deletedAt, sample];
  const questions = await Promise.all(
    set.questions.map(async (q, i) => ({
      prompt: q.prompt,
      image: q.image ? await image(setId, i) : null,
      options: q.options,
      optionImages: await Promise.all(
        q.options.map((_, j) =>
          q.optionImages?.[j] ? image(setId, i, j) : null,
        ),
      ),
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    })),
  );
  return { ...details, questions };
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
// One subject under different spellings is kept as one, and sets and
// results use its name.
function withIds(data: Data) {
  const snapshot = () =>
    JSON.stringify([
      data.groups,
      data.subjects,
      data.sets.map((s) => s.subject),
      data.attempts.map((a) => a.subject),
      data.subjectsSeeded,
    ]);
  const before = snapshot();
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
  const key = (name: string) => canonicalSubject(name).toLocaleLowerCase();
  const subjects: {
    id: string;
    name: string;
    group: string;
    factOrder?: FactKey[];
    factCount?: number;
    buttonOrder?: ButtonKey[];
    buttonsPerRow?: number;
  }[] = [];
  for (const s of data.subjects ?? [])
    if (!subjects.some((x) => key(x.name) === key(s.name)))
      subjects.push({ ...s, id: s.id ?? crypto.randomUUID() });
  const subjectOf = (name: string) => {
    let subject = subjects.find((s) => key(s.name) === key(name));
    if (!subject) {
      subject = { id: crypto.randomUUID(), name, group: groups[0].name };
      subjects.push(subject);
    }
    return subject.name;
  };
  for (const set of data.sets) set.subject = subjectOf(set.subject);
  for (const a of data.attempts) a.subject = subjectOf(a.subject);
  if (!data.subjectsSeeded) for (const s of fixedSubjects) subjectOf(s.name);
  data.subjectsSeeded = true;
  data.groups = groups;
  data.subjects = subjects;
  return snapshot() !== before;
}
async function localCatalog() {
  // Ids are saved first and read back, so callers see the stored ones.
  if (withIds(await local())) await writeLocal(withIds);
  const data = await local();
  withIds(data);
  return data as Data & {
    groups: { id: string; name: string }[];
    subjects: {
      id: string;
      name: string;
      group: string;
      factOrder?: FactKey[];
      factCount?: number;
      buttonOrder?: ButtonKey[];
      buttonsPerRow?: number;
    }[];
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
// Renames a set or changes its grouping; false if it does not exist.
export async function setDetails(setId: string, details: SetDetails) {
  const db = await database();
  if (db) return updateDetails(db, setId, details);
  let found = false;
  await writeLocal((data) => {
    const set = data.sets.find((s) => s.id === setId);
    if (!set) return;
    found = true;
    for (const [key, value] of Object.entries(details) as [
      keyof SetDetails,
      string | null,
    ][])
      if (value === null) delete set[key];
      else Object.assign(set, { [key]: value });
  });
  return found;
}
// Replaces a subject's card layout; what it leaves out goes back to the
// default. False if the subject does not exist.
export async function setCardLayout(id: string, layout: CardLayout) {
  const db = await database();
  if (db) return updateCardLayout(db, id, layout);
  let found = false;
  await writeLocal((data) => {
    withIds(data);
    const subject = data.subjects!.find((s) => s.id === id);
    if (!subject) return;
    found = true;
    delete subject.factOrder;
    delete subject.factCount;
    delete subject.buttonOrder;
    delete subject.buttonsPerRow;
    if (layout.factOrder?.length) subject.factOrder = layout.factOrder;
    if (layout.factCount) subject.factCount = layout.factCount;
    if (layout.buttonOrder?.length) subject.buttonOrder = layout.buttonOrder;
    if (layout.buttonsPerRow) subject.buttonsPerRow = layout.buttonsPerRow;
  });
  return found;
}
