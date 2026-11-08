'use client';
import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import type { words } from '@/lib/i18n';
import type { Catalog } from '@/lib/records';
import { subjects as fixedSubjects } from '@/lib/subjects';
import { Dropdown } from './dropdown';

type Words = (typeof words)['nl'];
type Status = { message: string; ok: boolean };
const quiet: Status = { message: '', ok: true };

async function send(method: 'POST' | 'PATCH', data: unknown) {
  const r = await fetch('/api/catalog', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { ok: r.ok, payload: await r.json().catch(() => null) };
}

// Reasons the server gives for refusing a change, in the page's language.
function refusal(t: Words, payload: { code?: string; group?: string } | null) {
  if (payload?.code === 'EXISTS')
    return payload.group
      ? t.subjectInGroup.replace('{group}', payload.group)
      : t.alreadyExists;
  return t.error;
}

function Message({ message, ok }: Status) {
  if (!message) return null;
  return ok ? (
    <p role="status" className="success">
      <Check size={16} aria-hidden="true" />
      {message}
    </p>
  ) : (
    <p role="alert" className="form-error">
      {message}
    </p>
  );
}

// One name in a list, renamed in place; saving keeps the item's id.
function NameRow({
  name,
  detail,
  t,
  onRename,
}: {
  name: string;
  detail?: string | null;
  t: Words;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  if (!editing)
    return (
      <li>
        <span className="name">{name}</span>
        {detail && <span className="detail">{detail}</span>}
        <button
          type="button"
          className="small-icon"
          aria-label={`${t.rename}: ${name}`}
          title={t.rename}
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
      </li>
    );
  const save = async () => {
    if (!value.trim() || value.trim() === name) return setEditing(false);
    setBusy(true);
    try {
      if (await onRename(value.trim())) setEditing(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
      <input
        autoFocus
        onFocus={(e) => e.target.select()}
        aria-label={t.rename}
        value={value}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button
        type="button"
        className="small-icon"
        aria-label={t.saveName}
        title={t.saveName}
        disabled={busy}
        onClick={save}
      >
        <Check size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="small-icon"
        aria-label={t.cancel}
        title={t.cancel}
        onClick={() => setEditing(false)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

// The parent's groups and subjects: add them, or rename them in place.
// Tests are then added for a chosen group and subject.
export function CatalogEditor({
  catalog,
  t,
  onChanged,
}: {
  catalog: Catalog;
  t: Words;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupStatus, setGroupStatus] = useState(quiet);
  const [subjectGroup, setSubjectGroup] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectStatus, setSubjectStatus] = useState(quiet);

  async function change(
    method: 'POST' | 'PATCH',
    data: unknown,
    done: string,
    show: (s: Status) => void,
  ) {
    setBusy(true);
    show(quiet);
    try {
      const { ok, payload } = await send(method, data);
      if (!ok) {
        show({ message: refusal(t, payload), ok: false });
        return false;
      }
      await onChanged();
      show({ message: done, ok: true });
      return true;
    } catch {
      show({ message: t.error, ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="paper catalog">
      <div>
        <h2>{t.groupsTitle}</h2>
        <ul className="name-list">
          {catalog.groups.map((g) => (
            <NameRow
              key={g.id}
              name={g.name}
              t={t}
              onRename={(name) =>
                change(
                  'PATCH',
                  { kind: 'group', id: g.id, name },
                  t.renamed,
                  setGroupStatus,
                )
              }
            />
          ))}
        </ul>
        <form
          className="add-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await change(
                'POST',
                { kind: 'group', name: groupName },
                t.groupAdded,
                setGroupStatus,
              )
            )
              setGroupName('');
          }}
        >
          <input
            aria-label={t.groupName}
            placeholder={t.newGroup}
            value={groupName}
            maxLength={60}
            onChange={(e) => {
              setGroupName(e.target.value);
              setGroupStatus(quiet);
            }}
          />
          <button
            className="button primary"
            disabled={busy || !groupName.trim()}
          >
            <Plus size={16} aria-hidden="true" />
            {t.addGroup}
          </button>
        </form>
        <Message {...groupStatus} />
      </div>
      <div>
        <h2>{t.subjectsTitle}</h2>
        <ul className="name-list">
          {catalog.subjects.map((s) => (
            <NameRow
              key={s.id}
              name={s.name}
              detail={s.group}
              t={t}
              onRename={(name) =>
                change(
                  'PATCH',
                  { kind: 'subject', id: s.id, name },
                  t.renamed,
                  setSubjectStatus,
                )
              }
            />
          ))}
        </ul>
        <form
          className="add-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await change(
                'POST',
                { kind: 'subject', name: subjectName, groupId: subjectGroup },
                t.subjectAdded,
                setSubjectStatus,
              )
            )
              setSubjectName('');
          }}
        >
          <Dropdown
            label={t.factGroup}
            hideLabel
            placeholder={t.chooseGroup}
            value={subjectGroup}
            options={catalog.groups.map((g) => ({
              value: g.id,
              label: g.name,
            }))}
            onChange={setSubjectGroup}
          />
          <input
            aria-label={t.subjectName}
            placeholder={t.newSubject}
            value={subjectName}
            maxLength={80}
            list="known-subjects"
            onChange={(e) => {
              setSubjectName(e.target.value);
              setSubjectStatus(quiet);
            }}
          />
          <datalist id="known-subjects">
            {fixedSubjects.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <button
            className="button primary"
            disabled={busy || !subjectGroup || !subjectName.trim()}
          >
            <Plus size={16} aria-hidden="true" />
            {t.addSubject}
          </button>
        </form>
        <Message {...subjectStatus} />
      </div>
    </section>
  );
}
