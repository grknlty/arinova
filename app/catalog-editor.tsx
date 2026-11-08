'use client';
import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { words, Language } from '@/lib/i18n';
import type { Catalog } from '@/lib/records';
import type { PublicSet, StudySet } from '@/lib/model';
import { subjects as fixedSubjects, subjectLabel } from '@/lib/subjects';

type Words = (typeof words)['nl'];
const newTest = 'new';
const maxOptions = 6;

async function post(url: string, data: unknown) {
  const r = await fetch(url, {
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

// The parent's forms for adding a group, a subject (in a group) and a single
// question (in a group's subject, on an existing or a new test).
export function CatalogEditor({
  catalog,
  sets,
  t,
  lang,
  onChanged,
}: {
  catalog: Catalog;
  sets: (StudySet | PublicSet)[];
  t: Words;
  lang: Language;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupStatus, setGroupStatus] = useState({ message: '', ok: true });
  const [subjectGroup, setSubjectGroup] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectStatus, setSubjectStatus] = useState({ message: '', ok: true });
  const [group, setGroup] = useState('');
  const [subject, setSubject] = useState('');
  const [test, setTest] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Language>(lang);
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [questionStatus, setQuestionStatus] = useState({
    message: '',
    ok: true,
  });

  const groupSubjects = catalog.subjects.filter((s) => s.group === group);
  // Tests of the chosen subject that are still in the library.
  const tests = sets.filter(
    (s) =>
      !s.deletedAt && s.subject === subject && (!s.group || s.group === group),
  );
  const filled = options.filter((o) => o.trim());
  const canSave =
    !!group &&
    !!subject &&
    !!test &&
    (test !== newTest || !!title.trim()) &&
    !!prompt.trim() &&
    filled.length >= 2 &&
    !!options[correct]?.trim();

  async function run(
    work: () => Promise<{ ok: boolean; payload: unknown }>,
    done: string,
    show: (s: { message: string; ok: boolean }) => void,
  ) {
    setBusy(true);
    show({ message: '', ok: true });
    try {
      const { ok, payload } = await work();
      if (!ok) {
        show({ message: refusal(t, payload as never), ok: false });
        return false;
      }
      await onChanged();
      show({ message: done, ok: true });
      return payload;
    } catch {
      show({ message: t.error, ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="catalog">
      <div className="catalog-row">
        <form
          className="paper catalog-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(
                () => post('/api/catalog', { kind: 'group', name: groupName }),
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
          <button
            className="button primary"
            disabled={busy || !groupName.trim()}
          >
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
              await run(
                () =>
                  post('/api/catalog', {
                    kind: 'subject',
                    name: subjectName,
                    group: subjectGroup,
                  }),
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
      <form
        className="paper catalog-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSave) {
            setQuestionStatus({ message: t.fillQuestion, ok: false });
            return;
          }
          // Empty answer boxes are left out; the correct one moves with them.
          const kept = options
            .map((text, i) => ({ text, i }))
            .filter((o) => o.text.trim());
          const payload = await run(
            () =>
              post('/api/questions', {
                group,
                subject,
                ...(test === newTest ? { title, language } : { setId: test }),
                question: {
                  prompt,
                  options: kept.map((o) => o.text),
                  correctIndex: kept.findIndex((o) => o.i === correct),
                  explanation,
                },
              }),
            t.questionAdded,
            setQuestionStatus,
          );
          if (!payload) return;
          // The next question goes to the same test.
          setTest((payload as { id: string }).id);
          setTitle('');
          setPrompt('');
          setOptions(['', '']);
          setCorrect(0);
          setExplanation('');
        }}
      >
        <h2>{t.addQuestion}</h2>
        <p className="page-intro">{t.addQuestionText}</p>
        <div className="catalog-row">
          <label className="field">
            {t.factGroup}
            <select
              required
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setSubject('');
                setTest('');
              }}
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
            {t.factSubject}
            <select
              required
              disabled={!group || !groupSubjects.length}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTest('');
              }}
            >
              <option value="" disabled>
                {t.chooseSubject}
              </option>
              {groupSubjects.map((s) => (
                <option key={s.name} value={s.name}>
                  {subjectLabel(s.name, lang)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {group && !groupSubjects.length && (
          <p className="form-error">{t.noSubjectsInGroup}</p>
        )}
        {subject && (
          <div className="catalog-row">
            <label className="field">
              {t.testLabel}
              <select
                required
                value={test}
                onChange={(e) => setTest(e.target.value)}
              >
                <option value="" disabled>
                  {t.chooseTest}
                </option>
                <option value={newTest}>{t.newTest}</option>
                {tests.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.questions.length} {t.questions})
                  </option>
                ))}
              </select>
            </label>
            {test === newTest && (
              <>
                <label className="field">
                  {t.testTitle}
                  <input
                    required
                    value={title}
                    maxLength={150}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t.testLanguage}
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                  >
                    {(['nl', 'tr', 'en'] as const).map((l) => (
                      <option key={l} value={l}>
                        {t[l]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        )}
        {test && (
          <>
            <label className="field">
              {t.question}
              <textarea
                required
                rows={3}
                maxLength={3000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <fieldset className="option-list">
              <legend>{t.answersLabel}</legend>
              {options.map((text, i) => (
                <div className="option-row" key={i}>
                  <input
                    type="radio"
                    name="correct-option"
                    aria-label={`${t.correctAnswerLabel} ${i + 1}`}
                    checked={correct === i}
                    onChange={() => setCorrect(i)}
                  />
                  <input
                    aria-label={`${t.answerLabel} ${i + 1}`}
                    placeholder={`${t.answerLabel} ${i + 1}`}
                    value={text}
                    maxLength={1000}
                    onChange={(e) =>
                      setOptions((o) =>
                        o.map((v, j) => (j === i ? e.target.value : v)),
                      )
                    }
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t.removeOption}
                      title={t.removeOption}
                      onClick={() => {
                        setOptions((o) => o.filter((_, j) => j !== i));
                        setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
                      }}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < maxOptions && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setOptions((o) => [...o, ''])}
                >
                  <Plus size={16} aria-hidden="true" />
                  {t.addOption}
                </button>
              )}
            </fieldset>
            <label className="field">
              {t.explanationLabel}
              <textarea
                rows={2}
                maxLength={5000}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              <Plus size={18} aria-hidden="true" />
              {t.addQuestion}
            </button>
          </>
        )}
        <Status {...questionStatus} />
      </form>
    </div>
  );
}
