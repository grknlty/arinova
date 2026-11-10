'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { words } from '@/lib/i18n';
import { canonicalSubject } from '@/lib/subjects';
import { groupIn, lessonIn } from '@/lib/school';
import { factKeys, type FactKey } from '@/lib/facts';
import { Dropdown, SuggestInput } from './dropdown';
import {
  testStyles,
  type PublicSet,
  type SetDetails,
  type StudySet,
  type TestStyle,
} from '@/lib/model';

type Words = (typeof words)['nl'];
type AnySet = StudySet | PublicSet;
// The optional groupings inside a subject that the learner can filter by,
// and on the page with all subjects, the subject itself.
export type Grouping = {
  subjectName?: string;
  group?: string;
  theme?: string;
  lesson?: string;
  testStyle?: string;
  status?: string;
};
const keys = [
  'subjectName',
  'group',
  'theme',
  'lesson',
  'testStyle',
  'status',
] as const;
type Key = (typeof keys)[number];
// How far the learner is with a set: practised to the end, started and not
// finished, or not started. Only the page knows, from results and progress.
export const setStatuses = ['done', 'started', 'new'] as const;
export type SetStatus = (typeof setStatuses)[number];
type StatusOf = (set: AnySet) => SetStatus;
const statusLabels: Record<SetStatus, (t: Words) => string> = {
  done: (t) => t.statusDone,
  started: (t) => t.statusStarted,
  new: (t) => t.statusNew,
};
// Older sets have no group or lesson fields; like their cards, these are
// then read from the title and description.
const valueOf = (set: AnySet, key: Key, statusOf?: StatusOf) => {
  const text = `${set.title} ${set.description}`;
  if (key === 'status') return statusOf?.(set);
  if (key === 'subjectName') return canonicalSubject(set.subject);
  if (key === 'group') return set.group ?? groupIn(text);
  if (key === 'lesson') return set.lesson ?? lessonIn(text);
  return set[key];
};

export const styleLabels: Record<TestStyle, (t: Words) => string> = {
  knowledge: (t) => t.styleKnowledge,
  cito: (t) => t.styleCito,
};

// Lessons and themes in natural order, so "Les 10" comes after "Les 9".
const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

function values(sets: AnySet[], key: Key) {
  if (key === 'status') return [...setStatuses];
  if (key === 'testStyle')
    return testStyles.filter((s) => sets.some((x) => x.testStyle === s));
  return [
    ...new Set(
      sets.map((s) => valueOf(s, key)).filter((v): v is string => !!v),
    ),
  ].sort(byName);
}

// The filter choice for sets that have no value for a grouping, such as
// the sets without a lesson.
const noValue = '\u0000';
const fits = (
  set: AnySet,
  key: Key,
  value: string | undefined,
  statusOf?: StatusOf,
) =>
  !value ||
  (value === noValue
    ? !valueOf(set, key)
    : valueOf(set, key, statusOf) === value);

export function matchesGrouping(
  set: AnySet,
  grouping: Grouping,
  statusOf?: StatusOf,
) {
  return keys.every((k) => fits(set, k, grouping[k], statusOf));
}

// A dropdown for each grouping that at least one set in the subject has, all
// on one line, in the order of the subject's card details; a subject without
// any shows nothing. With subjectLabel (on the page with all subjects) the
// subject comes first. With statusOf the learner's progress comes last.
export function GroupingFilters({
  sets,
  grouping,
  t,
  subjectLabel,
  statusOf,
  order = [...factKeys],
  onChange,
}: {
  sets: AnySet[];
  grouping: Grouping;
  t: Words;
  subjectLabel?: (name: string) => string;
  statusOf?: StatusOf;
  order?: FactKey[];
  onChange: (grouping: Grouping) => void;
}) {
  const label = {
    subjectName: t.factSubject,
    group: t.factGroup,
    theme: t.factTheme,
    lesson: t.factLesson,
    testStyle: t.factStyle,
    status: t.factStatus,
  };
  // Themes, lessons and styles are those of the chosen subject.
  const inSubject = sets.filter((s) =>
    matchesGrouping(s, { subjectName: grouping.subjectName }),
  );
  const position = (key: Key) =>
    key === 'subjectName' ? -1 : key === 'status' ? 99 : order.indexOf(key);
  const groups = [...keys]
    .sort((a, b) => position(a) - position(b))
    .filter((key) => key !== 'subjectName' || subjectLabel)
    .filter((key) => key !== 'status' || statusOf)
    .map((key) => {
      const among = key === 'subjectName' ? sets : inSubject;
      const options = values(among, key);
      return {
        key,
        options:
          key !== 'status' &&
          options.length &&
          among.some((s) => !valueOf(s, key))
            ? [...options, noValue]
            : options,
      };
    })
    .filter((g) => g.options.length);
  if (!groups.length) return null;
  return (
    <div className="grouping-filters" aria-label={t.filtersLabel} role="group">
      {groups.map(({ key, options }) => (
        <Dropdown
          key={key}
          label={label[key]}
          value={grouping[key] ?? ''}
          // Another subject starts again from all of its sets, keeping the
          // progress filter.
          onChange={(value) =>
            onChange(
              key === 'subjectName'
                ? { subjectName: value || undefined, status: grouping.status }
                : { ...grouping, [key]: value || undefined },
            )
          }
          options={['', ...options].map((value) => ({
            value,
            label: `${
              !value
                ? t.filterAll
                : value === noValue
                  ? t.detailNone
                  : key === 'testStyle'
                    ? styleLabels[value as TestStyle](t)
                    : key === 'status'
                      ? statusLabels[value as SetStatus](t)
                      : key === 'subjectName'
                        ? subjectLabel!(value)
                        : value
            } (${
              sets.filter(
                (s) =>
                  fits(s, key, value, statusOf) &&
                  matchesGrouping(
                    s,
                    { ...grouping, [key]: undefined },
                    statusOf,
                  ),
              ).length
            })`,
          }))}
        />
      ))}
    </div>
  );
}

// The parent's form for a saved set's name, description and grouping. An
// empty group, theme or lesson, or no test style, clears it. Inline, it
// shows the form alone, without the fold that opens it.
export function DetailsEditor({
  set,
  sets,
  groups,
  t,
  onSaved,
  inline = false,
}: {
  set: StudySet;
  // The other sets in the subject, whose themes and lessons are suggested.
  sets: AnySet[];
  // The school groups to suggest.
  groups: string[];
  t: Words;
  onSaved: () => Promise<void> | void;
  inline?: boolean;
}) {
  const [form, setForm] = useState({
    title: set.title,
    description: set.description,
    group: set.group ?? '',
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
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setForm({ ...form, [key]: e.target.value });
      setStatus({ ok: true, message: '' });
    },
  });
  const suggest = (key: 'group' | 'theme' | 'lesson') => ({
    value: form[key],
    onChange: (value: string) => {
      setForm((f) => ({ ...f, [key]: value }));
      setStatus({ ok: true, message: '' });
    },
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const details: SetDetails = {
      title: form.title.trim(),
      description: form.description.trim(),
      group: form.group.trim() || null,
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
  const body = (
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
        <SuggestInput
          label={t.factGroup}
          maxLength={60}
          placeholder={t.detailNone}
          suggestions={[...new Set([...groups, ...values(sets, 'group')])]}
          {...suggest('group')}
        />
        <SuggestInput
          label={t.factTheme}
          maxLength={100}
          placeholder={t.detailNone}
          suggestions={values(sets, 'theme')}
          {...suggest('theme')}
        />
        <SuggestInput
          label={t.factLesson}
          maxLength={100}
          placeholder={t.detailNone}
          suggestions={values(sets, 'lesson')}
          {...suggest('lesson')}
        />
        <Dropdown
          label={t.factStyle}
          value={form.testStyle}
          options={[
            { value: '', label: t.detailNone },
            ...testStyles.map((s) => ({
              value: s,
              label: styleLabels[s](t),
            })),
          ]}
          onChange={(testStyle) => {
            setForm({ ...form, testStyle });
            setStatus({ ok: true, message: '' });
          }}
        />
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
  );
  return inline ? (
    body
  ) : (
    <details className="details-editor">
      <summary>{t.editDetails}</summary>
      {body}
    </details>
  );
}
