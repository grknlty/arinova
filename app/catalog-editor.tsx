'use client';
import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { words } from '@/lib/i18n';
import type { Catalog } from '@/lib/records';
import { subjects as fixedSubjects } from '@/lib/subjects';

type Words = (typeof words)['nl'];

async function post(data: unknown) {
  const r = await fetch('/api/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { ok: r.ok, payload: await r.json().catch(() => null) };
}

// Reasons the server gives for refusing an addition, in the page's language.
function refusal(t: Words, payload: { code?: string; group?: string } | null) {
  if (payload?.code === 'EXISTS')
    return payload.group
      ? t.subjectInGroup.replace('{group}', payload.group)
      : t.alreadyExists;
  return t.error;
}

function Status({ message, ok }: { message: string; ok: boolean }) {
  if (!message) return null;
  return ok ? (
    <p role="status" className="success">
      <Check size={18} aria-hidden="true" />
      {message}
    </p>
  ) : (
    <p role="alert" className="form-error">
      {message}
    </p>
  );
}

// The parent's forms for adding a group, and a subject in a group. Tests
// are then added for a chosen group and subject.
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
  const [groupStatus, setGroupStatus] = useState({ message: '', ok: true });
  const [subjectGroup, setSubjectGroup] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectStatus, setSubjectStatus] = useState({ message: '', ok: true });

  async function add(
    data: unknown,
    done: string,
    show: (s: { message: string; ok: boolean }) => void,
  ) {
    setBusy(true);
    show({ message: '', ok: true });
    try {
      const { ok, payload } = await post(data);
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
    <div className="catalog-row catalog">
      <form
        className="paper catalog-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await add(
              { kind: 'group', name: groupName },
              t.groupAdded,
              setGroupStatus,
            )
          )
            setGroupName('');
        }}
      >
        <h2>{t.addGroup}</h2>
        <label className="field">
          {t.groupName}
          <input
            value={groupName}
            maxLength={60}
            placeholder="Groep 7–8"
            onChange={(e) => {
              setGroupName(e.target.value);
              setGroupStatus({ message: '', ok: true });
            }}
          />
        </label>
        <button className="button primary" disabled={busy || !groupName.trim()}>
          <Plus size={18} aria-hidden="true" />
          {t.addGroup}
        </button>
        <Status {...groupStatus} />
      </form>
      <form
        className="paper catalog-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await add(
              { kind: 'subject', name: subjectName, group: subjectGroup },
              t.subjectAdded,
              setSubjectStatus,
            )
          )
            setSubjectName('');
        }}
      >
        <h2>{t.addSubject}</h2>
        <label className="field">
          {t.factGroup}
          <select
            required
            value={subjectGroup}
            onChange={(e) => setSubjectGroup(e.target.value)}
          >
            <option value="" disabled>
              {t.chooseGroup}
            </option>
            {catalog.groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          {t.subjectName}
          <input
            value={subjectName}
            maxLength={80}
            list="known-subjects"
            onChange={(e) => {
              setSubjectName(e.target.value);
              setSubjectStatus({ message: '', ok: true });
            }}
          />
          <datalist id="known-subjects">
            {fixedSubjects.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </label>
        <button
          className="button primary"
          disabled={busy || !subjectGroup || !subjectName.trim()}
        >
          <Plus size={18} aria-hidden="true" />
          {t.addSubject}
        </button>
        <Status {...subjectStatus} />
      </form>
    </div>
  );
}
