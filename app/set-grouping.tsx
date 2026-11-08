'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { words } from '@/lib/i18n';
import {
  testStyles,
  type PublicSet,
  type SetDetails,
  type StudySet,
  type TestStyle,
} from '@/lib/model';

type Words = (typeof words)['nl'];
type AnySet = StudySet | PublicSet;
// The optional groupings inside a subject that the learner can filter by.
export type Grouping = { theme?: string; lesson?: string; testStyle?: string };
const keys = ['theme', 'lesson', 'testStyle'] as const;

export const styleLabels: Record<TestStyle, (t: Words) => string> = {
  knowledge: (t) => t.styleKnowledge,
  cito: (t) => t.styleCito,
};

// Lessons and themes in natural order, so "Les 10" comes after "Les 9".
const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

function values(sets: AnySet[], key: (typeof keys)[number]) {
  if (key === 'testStyle')
    return testStyles.filter((s) => sets.some((x) => x.testStyle === s));
  return [
    ...new Set(sets.map((s) => s[key]).filter((v): v is string => !!v)),
  ].sort(byName);
}

export function matchesGrouping(set: AnySet, grouping: Grouping) {
  return keys.every((k) => !grouping[k] || set[k] === grouping[k]);
}

// A dropdown for each grouping that at least one set in the subject has, all
// on one line; a subject without any shows nothing.
export function GroupingFilters({
  sets,
  grouping,
  t,
  onChange,
}: {
  sets: AnySet[];
  grouping: Grouping;
  t: Words;
  onChange: (grouping: Grouping) => void;
}) {
  const label = {
    theme: t.factTheme,
    lesson: t.factLesson,
    testStyle: t.factStyle,
  };
  const groups = keys
    .map((key) => ({ key, options: values(sets, key) }))
    .filter((g) => g.options.length);
  if (!groups.length) return null;
  return (
    <div className="grouping-filters" aria-label={t.filtersLabel} role="group">
      {groups.map(({ key, options }) => (
        <label className="field" key={key}>
          {label[key]}
          <select
            value={grouping[key] ?? ''}
            onChange={(e) =>
              onChange({ ...grouping, [key]: e.target.value || undefined })
            }
          >
            {['', ...options].map((value) => (
              <option key={value} value={value}>
                {`${
                  !value
                    ? t.filterAll
                    : key === 'testStyle'
                      ? styleLabels[value as TestStyle](t)
                      : value
                } (${
                  sets.filter(
                    (s) =>
                      (!value || s[key] === value) &&
                      matchesGrouping(s, { ...grouping, [key]: undefined }),
                  ).length
                })`}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

// The parent's form for a saved set's name, description and grouping. An
// empty theme or lesson, or no test style, clears it.
export function DetailsEditor({
  set,
  sets,
  t,
  onSaved,
}: {
  set: StudySet;
  // The other sets in the subject, whose themes and lessons are suggested.
  sets: AnySet[];
  t: Words;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    title: set.title,
    description: set.description,
    theme: set.theme ?? '',
    lesson: set.lesson ?? '',
    testStyle: set.testStyle ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string }>({
    ok: true,
    message: '',
  });
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm({ ...form, [key]: e.target.value });
      setStatus({ ok: true, message: '' });
    },
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const details: SetDetails = {
      title: form.title.trim(),
      description: form.description.trim(),
      theme: form.theme.trim() || null,
      lesson: form.lesson.trim() || null,
      testStyle: (form.testStyle || null) as TestStyle | null,
    };
    setBusy(true);
    try {
      const r = await fetch(`/api/sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      if (!r.ok) throw new Error();
      await onSaved();
      setStatus({ ok: true, message: t.detailsSaved });
    } catch {
      setStatus({ ok: false, message: t.error });
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="details-editor">
      <summary>{t.editDetails}</summary>
      <form onSubmit={save}>
        <label className="field">
          {t.detailTitle}
          <input required maxLength={150} {...field('title')} />
        </label>
        <label className="field">
          {t.detailDescription}
          <textarea rows={3} maxLength={1000} {...field('description')} />
        </label>
        <div className="catalog-row">
          <label className="field">
            {t.factTheme}
            <input
              maxLength={100}
              list={`themes-${set.id}`}
              placeholder={t.detailNone}
              {...field('theme')}
            />
            <datalist id={`themes-${set.id}`}>
              {values(sets, 'theme').map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label className="field">
            {t.factLesson}
            <input
              maxLength={100}
              list={`lessons-${set.id}`}
              placeholder={t.detailNone}
              {...field('lesson')}
            />
            <datalist id={`lessons-${set.id}`}>
              {values(sets, 'lesson').map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label className="field">
            {t.factStyle}
            <select {...field('testStyle')}>
              <option value="">{t.detailNone}</option>
              {testStyles.map((s) => (
                <option key={s} value={s}>
                  {styleLabels[s](t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="details-actions">
          <button
            className="button primary"
            disabled={busy || !form.title.trim()}
          >
            {t.saveDetails}
          </button>
          {status.message &&
            (status.ok ? (
              <p role="status" className="success">
                <Check size={16} aria-hidden="true" />
                {status.message}
              </p>
            ) : (
              <p role="alert" className="form-error">
                {status.message}
              </p>
            ))}
        </div>
      </form>
    </details>
  );
}
