'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Check,
  CircleHelp,
  BarChart3,
  Plus,
  LogOut,
  Upload,
  Sun,
  Sparkles,
  Printer,
  Eye,
  EyeOff,
  CloudSun,
  Shuffle,
  RotateCw,
  Download,
  Calculator,
  NotebookPen,
  MapPinned,
  Earth,
  Sparkle,
  Star,
  Rocket,
  Telescope,
  TrafficCone,
  Landmark,
  Microscope,
  Trash2,
  RotateCcw,
  X,
} from 'lucide-react';
import { words, type Language } from '@/lib/i18n';
import { sample } from '@/lib/sample';
import {
  subjects,
  findSubject,
  canonicalSubject,
  subjectLabel,
} from '@/lib/subjects';
import type {
  StudySet,
  PublicSet,
  Answer,
  Attempt,
  TestType,
  Difficulty,
} from '@/lib/model';
import { normalizeSets } from '@/lib/formats';
import { groupIn, lessonIn } from '@/lib/school';
import {
  ArinAstronaut,
  GalaxyCanvas,
  MiaShip,
  NecoAstronaut,
  PisoShip,
  SkyEffects,
} from './space-art';
import { FaceEditor } from './face-editor';
import type { Faces } from '@/lib/faces';
type Progress = {
  answers: Answer[];
  doubts: Record<number, { unsure?: boolean; notUnderstood?: boolean }>;
  index: number;
};
// Which answers the result page lists; "unsure" includes the older
// "best guess" answers.
type ResultFilter = 'all' | 'wrong' | 'correct' | 'unsure' | 'not_understood';
const resultFilters: Record<
  ResultFilter,
  (a: Attempt['answers'][number]) => boolean
> = {
  all: () => true,
  wrong: (a) => a.option !== null && !a.correct,
  correct: (a) => a.correct,
  unsure: (a) => a.confidence === 'unsure' || a.confidence === 'best_guess',
  not_understood: (a) => a.confidence === 'not_understood',
};
type View =
  'library' | 'subject' | 'progress' | 'manage' | 'study' | 'quiz' | 'result';
const feelings = ['sure', 'unsure', 'best_guess', 'not_understood'] as const;
const feelingIcons = [Sun, CloudSun, Shuffle, CircleHelp];
// Where each subject planet sits around the supernova: orbit radius (px)
// and angle (degrees, clockwise from the right). All planets turn together,
// so these gaps never change; the angles were chosen by sweeping a full turn
// so no planet or label overlaps another at phone, tablet or desktop size.
// Angles between 0 and 180 are nearer to us and drawn larger.
const orbits = {
  taal: [149, 316],
  rekenen: [169, 4],
  huiswerk: [85, 55],
  topografie: [178, 101],
  aardrijkskunde: [187, 149],
  verkeer: [76, 191],
  geschiedenis: [196, 216],
  natuur: [160, 262],
} as const;
const subjectIcons = {
  taal: BookOpen,
  rekenen: Calculator,
  huiswerk: NotebookPen,
  topografie: MapPinned,
  aardrijkskunde: Earth,
  verkeer: TrafficCone,
  geschiedenis: Landmark,
  natuur: Microscope,
};
type Draft = {
  title?: string;
  subject?: string;
  language?: Language;
  questionCount?: number;
  questions?: unknown[];
};
const partSizes = [5, 10, 20];
const pictures = (d: Draft) =>
  (d.questions ?? []).filter((q) => (q as { image?: string })?.image).length;
// Splits a set into parts of about `size` questions, sized evenly
// (42 by 10 gives 9+9+8+8+8), each titled "… (deel 2/5)".
function split<T extends Draft>(set: T, size: number): T[] {
  const questions = set.questions ?? [];
  if (!size || questions.length <= size) return [set];
  const count = Math.ceil(questions.length / size);
  const word = { nl: 'deel', tr: 'bölüm', en: 'part' }[set.language ?? 'nl'];
  let at = 0;
  return Array.from({ length: count }, (_, i) => {
    const length =
      Math.floor(questions.length / count) +
      (i < questions.length % count ? 1 : 0);
    const part = questions.slice(at, (at += length));
    return {
      ...set,
      title: `${set.title} (${word} ${i + 1}/${count})`,
      // A count that was right is kept right per part; a wrong one is left
      // for the server to refuse, so missing questions are not hidden.
      ...(set.questionCount === questions.length
        ? { questionCount: part.length }
        : {}),
      questions: part,
    };
  });
}
class ApiError extends Error {
  constructor(
    public code: string,
    public diagnostic?: string,
  ) {
    super(code);
  }
}
async function api(url: string, data?: unknown) {
  const r = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  if (!r.ok) {
    const payload = await r.json().catch(() => null);
    throw new ApiError(
      typeof payload?.code === 'string' ? payload.code : 'REQUEST_FAILED',
      typeof payload?.diagnostic === 'string' ? payload.diagnostic : undefined,
    );
  }
  return r.status === 204 ? null : r.json();
}
export default function Home() {
  const [lang, setLang] = useState<Language>('nl');
  const t = words[lang];
  const [session, setSession] = useState<{
    role: 'parent' | 'learner' | null;
    demo: boolean;
  } | null>(null);
  const [view, setView] = useState<View>('library');
  const [sets, setSets] = useState<(StudySet | PublicSet)[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [faces, setFaces] = useState<Faces>({});
  const [selected, setSelected] = useState<StudySet | PublicSet | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Attempt | null>(null);
  const [subject, setSubject] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginRole, setLoginRole] = useState('learner');
  const [json, setJson] = useState('');
  const [partSize, setPartSize] = useState(0);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  // The set opened from the history, shown in a window with its answers.
  const [viewing, setViewing] = useState<StudySet | null>(null);
  // Where the material in the box came from, kept with the saved sets.
  const [origin, setOrigin] = useState<{
    source: 'word' | 'json';
    fileName?: string;
  }>({ source: 'json' });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const l = localStorage.getItem('arinova-language');
    if (l === 'nl' || l === 'en' || l === 'tr') setLang(l);
    api('/api/session')
      .then(setSession)
      .catch(() => setError(words.nl.error));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('arinova-language', lang);
  }, [lang]);
  async function load() {
    setLoading(true);
    try {
      setSets(await api('/api/sets'));
      if (session?.role === 'parent') setAttempts(await api('/api/progress'));
      // Faces are a nice extra: the drawings stay if they cannot be loaded.
      setFaces(await api('/api/faces').catch(() => ({})));
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (session?.role) void load();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  function navigate(v: View) {
    setView(v);
    setError('');
    setSaved(false);
    window.scrollTo(0, 0);
  }
  function pickSubject(s: string) {
    setSubject(s);
    navigate('subject');
  }
  // A practice in progress is kept in this browser, so leaving it (or closing
  // the tab) and starting it again continues at the same question.
  const progressKey = (id: string) => `arinova-progress:${session?.role}:${id}`;
  function savedProgress(s: StudySet | PublicSet): Progress | null {
    try {
      const p = JSON.parse(localStorage.getItem(progressKey(s.id)) ?? 'null');
      return p?.answers?.length === s.questions.length ? p : null;
    } catch {
      return null;
    }
  }
  function clearProgress(id: string) {
    try {
      localStorage.removeItem(progressKey(id));
    } catch {}
  }
  function start(s: StudySet | PublicSet, resume = true) {
    const kept = resume ? savedProgress(s) : null;
    if (!resume) clearProgress(s.id);
    setSelected(s);
    setAnswers(
      kept?.answers ??
        s.questions.map(() => ({ option: null, confidence: 'sure' })),
    );
    setDoubts(kept?.doubts ?? {});
    setIndex(kept?.index ?? 0);
    setResultFilter('all');
    navigate('quiz');
  }
  // Optional checkboxes per question. Not understanding the question is the
  // stronger signal, so it wins when both are ticked.
  const [doubts, setDoubts] = useState<
    Record<number, { unsure?: boolean; notUnderstood?: boolean }>
  >({});
  function toggleDoubt(key: 'unsure' | 'notUnderstood', value: boolean) {
    const next = { ...doubts[index], [key]: value };
    setDoubts((d) => ({ ...d, [index]: next }));
    updateAnswer({
      confidence: next.notUnderstood
        ? 'not_understood'
        : next.unsure
          ? 'unsure'
          : 'sure',
    });
  }
  useEffect(() => {
    if (view !== 'quiz' || !selected) return;
    try {
      localStorage.setItem(
        progressKey(selected.id),
        JSON.stringify({ answers, doubts, index }),
      );
    } catch {}
  }, [view, selected, answers, doubts, index]); // eslint-disable-line react-hooks/exhaustive-deps
  function updateAnswer(patch: Partial<Answer>) {
    setAnswers((a) => a.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
  // Deleting keeps Arin's earlier answers; the set only leaves her library.
  async function setDeleted(s: StudySet | PublicSet, deleted: boolean) {
    if (deleted && !window.confirm(t.confirmDelete.replace('{title}', s.title)))
      return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/sets/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted }),
      });
      if (!r.ok) throw new Error();
      await load();
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/attempts', { setId: selected!.id, answers });
      clearProgress(selected!.id);
      setResult(r);
      navigate('result');
      await load();
    } catch {
      setError(t.notSaved);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth', { role: loginRole, password });
      setPassword('');
      setShowPassword(false);
      setSession(await api('/api/session'));
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'REQUEST_FAILED';
      const messages: Record<string, string> = {
        AUTH_INVALID_CREDENTIALS: t.loginError,
        AUTH_PASSWORD_NOT_CONFIGURED: t.loginPasswordSetupError,
        AUTH_SESSION_NOT_CONFIGURED: t.loginSessionSetupError,
        AUTH_DATABASE_UNAVAILABLE: t.loginDatabaseError,
        AUTH_RATE_LIMITED: t.loginRateError,
        AUTH_ORIGIN_REJECTED: t.loginRefreshError,
      };
      const diagnostics = [
        'database_credentials',
        'database_permissions',
        'database_name',
        'database_network',
        'database_certificate',
        'database_connection',
      ];
      const detail =
        error instanceof ApiError &&
        error.diagnostic &&
        diagnostics.includes(error.diagnostic)
          ? ` (${error.diagnostic})`
          : '';
      setError((messages[code] ?? t.loginUnavailableError) + detail);
    } finally {
      setBusy(false);
    }
  }
  const languagePicker = (
    <label className="language">
      <span className="sr-only">{t.language}</span>
      <select
        aria-label={t.language}
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
      >
        <option value="nl">NL · Nederlands</option>
        <option value="tr">TR · Türkçe</option>
        <option value="en">EN · English</option>
      </select>
    </label>
  );
  if (!session?.role)
    return (
      <main className="login-page">
        <div className="login-language">{languagePicker}</div>
        <form className="login-card" onSubmit={login}>
          <div className="brand">
            <span className="brand-icon">
              <Sparkle fill="currentColor" />
            </span>
            arinova<span className="brand-dot">.</span>
          </div>
          <h1>{t.login}</h1>
          <p>{t.loginText}</p>
          {session ? (
            <>
              <div className="role-switch">
                {(['learner', 'parent'] as const).map((r) => (
                  <button
                    type="button"
                    className={loginRole === r ? 'active' : ''}
                    key={r}
                    onClick={() => setLoginRole(r)}
                  >
                    {t[r]}
                  </button>
                ))}
              </div>
              <label htmlFor="login-password" className="password-label">
                {t.password}
              </label>
              <div className="password-field">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? t.hidePassword : t.showPassword}
                  aria-pressed={showPassword}
                  aria-controls="login-password"
                  title={showPassword ? t.hidePassword : t.showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? (
                    <EyeOff size={20} aria-hidden="true" />
                  ) : (
                    <Eye size={20} aria-hidden="true" />
                  )}
                </button>
              </div>
              <button className="button primary" disabled={busy}>
                {t.signin}
                <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <div className="loading">
              <Sparkle aria-hidden="true" />
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  // From a practice, go back to the subject it was opened from.
  const back = (
    <button className="back" onClick={() => navigate('subject')}>
      <ArrowLeft size={16} />
      {subject === 'all' ? t.all : subjectLabel(subject, lang)}
    </button>
  );
  const subjectInfo = findSubject(subject);
  const SubjectIcon = subjectInfo ? subjectIcons[subjectInfo.id] : Sparkle;
  const visibleSets = sets.filter(
    (s) =>
      !s.deletedAt &&
      (subject === 'all' || canonicalSubject(s.subject) === subject),
  );
  const allAnswers = attempts.flatMap((a) => a.answers);
  // Questions answered wrong at least once, most often wrong first.
  const imageOf = (setId: string, question: number) =>
    sets.find((s) => s.id === setId)?.questions[question]?.image;
  const missed = Object.values(
    [...attempts]
      .reverse()
      .flatMap((a) =>
        a.answers.map((x, i) => ({
          ...x,
          key: `${a.setId}:${i}`,
          title: a.title,
          image: imageOf(a.setId, i),
        })),
      )
      .reduce<
        Record<
          string,
          {
            prompt: string;
            title: string;
            image?: string;
            correctAnswer: string;
            wrong: number;
            total: number;
            last: string | null;
          }
        >
      >((all, x) => {
        const m = (all[x.key] ??= {
          prompt: x.prompt,
          title: x.title,
          image: x.image,
          correctAnswer: x.correctAnswer,
          wrong: 0,
          total: 0,
          last: null,
        });
        m.total++;
        if (!x.correct) {
          m.wrong++;
          m.last = x.selected;
        }
        return all;
      }, {}),
  )
    .filter((m) => m.wrong)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.total - a.wrong / a.total)
    .slice(0, 15);
  const drafts: Draft[] = (() => {
    try {
      return [normalizeSets(JSON.parse(json))]
        .flat()
        .filter((p): p is Draft => !!(p as Draft)?.title);
    } catch {
      return [];
    }
  })();
  const preview = drafts.flatMap((d) => split(d, partSize));
  const longest = Math.max(0, ...drafts.map((d) => d.questions?.length ?? 0));
  const total = allAnswers.length;
  const correct = allAnswers.filter((a) => a.correct).length;
  const wrong = allAnswers.filter(
    (a) => !a.correct && a.option !== null,
  ).length;
  const uncertain = allAnswers.filter(
    (a) => a.confidence !== 'sure' || !a.correct,
  ).length;
  return (
    <div className="app">
      <header className="header">
        <button
          className="brand"
          onClick={() => navigate('library')}
          aria-label="Arinova"
        >
          <span className="brand-icon">
            <Sparkle fill="currentColor" />
          </span>
          arinova<span className="brand-dot">.</span>
        </button>
        <nav aria-label={t.library}>
          <button
            className={
              ['library', 'subject', 'study', 'quiz', 'result'].includes(view)
                ? 'active'
                : ''
            }
            onClick={() => navigate('library')}
          >
            <BookOpen size={18} />
            {t.library}
          </button>
          {session.role === 'parent' && (
            <>
              <button
                className={view === 'progress' ? 'active' : ''}
                onClick={() => navigate('progress')}
              >
                <BarChart3 size={18} />
                {t.progress}
              </button>
              <button
                className={view === 'manage' ? 'active' : ''}
                onClick={() => navigate('manage')}
              >
                <Plus size={18} />
                {t.manage}
              </button>
            </>
          )}
        </nav>
        <div className="header-right">
          {languagePicker}
          <span className="avatar">A</span>
          {!session.demo && (
            <button
              className="icon-button"
              aria-label={t.logout}
              title={t.logout}
              onClick={async () => {
                await fetch('/api/auth', { method: 'DELETE' });
                setSession({ role: null, demo: false });
                setLoginRole('learner');
                setShowPassword(false);
                setAttempts([]);
                setFaces({});
                setSets([]);
                navigate('library');
              }}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      {session.demo && <div className="demo-banner">{t.demo}</div>}
      <main className={view === 'library' ? 'main main-home' : 'main'}>
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              aria-label={t.reload}
              title={t.reload}
              onClick={() => {
                setError('');
                void load();
              }}
            >
              <RotateCw size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {view === 'library' && (
          <>
            <section className="space-home">
              <h1 className="sr-only">{t.welcome}</h1>
              <GalaxyCanvas />
              <SkyEffects />
              <MiaShip photo={faces.mia} />
              <ArinAstronaut photo={faces.arin} />
              <NecoAstronaut photo={faces.neco} />
              <PisoShip photo={faces.piso} />
              <div className="system" role="group" aria-label={t.all}>
                {Object.values(orbits).map(([r]) => (
                  <span
                    key={r}
                    className="orbit"
                    style={{ '--r': `${r}px` } as React.CSSProperties}
                    aria-hidden="true"
                  />
                ))}
                {[58, 66, 97, 109, 121, 133, 141, 205, 214].map((r) => (
                  <span
                    key={r}
                    className="orbit fine"
                    style={{ '--r': `${r}px` } as React.CSSProperties}
                    aria-hidden="true"
                  />
                ))}
                <span className="nova-ring" aria-hidden="true" />
                <button
                  className={`nova ${subject === 'all' ? 'selected' : ''}`}
                  aria-pressed={subject === 'all'}
                  aria-label={t.all}
                  onClick={() => pickSubject('all')}
                >
                  <span className="nova-rays" aria-hidden="true" />
                  <span className="nova-glow" aria-hidden="true" />
                  <span className="nova-core" aria-hidden="true" />
                </button>
                {subjects.map((s, i) => {
                  const Icon = subjectIcons[s.id];
                  const [r, a] = orbits[s.id];
                  return (
                    <button
                      key={s.id}
                      className={`orbit-planet art-${s.id} ${subject === s.name ? 'selected' : ''}`}
                      style={
                        {
                          '--r': `${r}px`,
                          '--a0': `${a}deg`,
                          '--n': i,
                        } as React.CSSProperties
                      }
                      aria-pressed={subject === s.name}
                      aria-label={subjectLabel(s.name, lang)}
                      onClick={() => pickSubject(s.name)}
                    >
                      <span className="planet" aria-hidden="true">
                        <Icon size={22} strokeWidth={2} />
                      </span>
                      <span className="planet-name">
                        {subjectLabel(s.name, lang)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {view === 'subject' && (
          <>
            <button className="back" onClick={() => navigate('library')}>
              <ArrowLeft size={16} />
              {t.back}
            </button>
            <div
              className={`subject-heading art-${subject === 'all' ? 'all' : (subjectInfo?.id ?? 'other')}`}
            >
              <span className="planet" aria-hidden="true">
                <SubjectIcon size={30} strokeWidth={2} />
              </span>
              <h1>{subject === 'all' ? t.all : subjectLabel(subject, lang)}</h1>
              <span className="count">{visibleSets.length}</span>
            </div>
            <div className="cards">
              {visibleSets.map((s) => {
                const known = findSubject(s.subject);
                const Icon = known ? subjectIcons[known.id] : BookOpen;
                const progress = savedProgress(s);
                const mark =
                  known?.id === 'rekenen'
                    ? '123'
                    : !known || known.id === 'taal'
                      ? { nl: 'Aa', tr: 'Çç', en: 'Ab' }[s.language]
                      : null;
                return (
                  <article className="study-card" key={s.id}>
                    <div className={`card-art art-${known?.id ?? 'other'}`}>
                      <span className="subject-label">
                        {subjectLabel(s.subject, lang)}
                      </span>
                      <span className="planet" aria-hidden="true">
                        <Icon size={40} strokeWidth={1.75} />
                      </span>
                      {mark && (
                        <span className="card-art-letter" aria-hidden="true">
                          {mark}
                        </span>
                      )}
                      <Sparkles className="art-spark" aria-hidden="true" />
                    </div>
                    <div className="card-body">
                      <div className="card-meta">
                        <span>{t[s.language]}</span>
                      </div>
                      <h3>{s.title}</h3>
                      {s.description && <p>{s.description}</p>}
                      <SetFacts set={s} lang={lang} />
                      {s.sample && (
                        <span className="sample-label">{t.sample}</span>
                      )}
                      <div className="card-actions">
                        {s.material.trim() && (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelected(s);
                              navigate('study');
                            }}
                          >
                            {t.study}
                          </button>
                        )}
                        {progress && (
                          <button
                            className="button secondary"
                            onClick={() => start(s, false)}
                          >
                            {t.startOver}
                          </button>
                        )}
                        <button
                          className="button primary"
                          onClick={() => start(s)}
                        >
                          {progress
                            ? `${t.resume} · ${progress.index + 1}/${s.questions.length}`
                            : t.practice}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!loading && !visibleSets.length && (
                <p className="empty">{t.empty}</p>
              )}
            </div>
            <p className="content-note">{t.contentNote}</p>
          </>
        )}
        {view === 'study' && selected && (
          <>
            {back}
            <section className="paper">
              <span className="eyebrow">
                {subjectLabel(selected.subject, lang)} · {t[selected.language]}
              </span>
              <h1>{selected.title}</h1>
              <span className="pill">
                <BookOpen size={16} />
                {t.material}
              </span>
              <div className="material">
                {selected.material || t.noMaterial}
              </div>
              <div className="paper-actions">
                <button
                  className="button secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  {t.print}
                </button>
                <button
                  className="button primary"
                  onClick={() => start(selected)}
                >
                  {t.practice}
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
          </>
        )}
        {view === 'quiz' && selected && (
          <>
            <button className="back" onClick={() => navigate('subject')}>
              <ArrowLeft size={16} />
              {t.exitQuiz}
            </button>
            <div className="quiz-top">
              <span>{selected.title}</span>
              <strong>
                {t.question} {index + 1} {t.of} {selected.questions.length}
              </strong>
            </div>
            <div className="progress">
              <div className="progress-track">
                <span
                  style={{
                    width: `${((index + 1) / selected.questions.length) * 100}%`,
                  }}
                />
              </div>
              <Rocket
                className="progress-rocket"
                aria-hidden="true"
                style={{
                  left: `${((index + 1) / selected.questions.length) * 100}%`,
                }}
              />
            </div>
            <section className="paper quiz" key={index}>
              <span className="eyebrow">
                {subjectLabel(selected.subject, lang)}
              </span>
              <h1>{selected.questions[index].prompt}</h1>
              {selected.questions[index].image && (
                <img
                  className="question-image"
                  src={selected.questions[index].image}
                  alt={t.questionImage}
                />
              )}
              <div className="options">
                {selected.questions[index].options.map((o, i) => (
                  <button
                    aria-pressed={answers[index].option === i}
                    className={answers[index].option === i ? 'chosen' : ''}
                    key={i}
                    onClick={() => updateAnswer({ option: i })}
                  >
                    <span className="option-letter">{'ABCDEF'[i]}</span>
                    {selected.questions[index].optionImages?.[i] && (
                      <img
                        className="option-image"
                        src={selected.questions[index].optionImages![i]!}
                        alt=""
                      />
                    )}
                    {o}
                    {answers[index].option === i && <Check size={20} />}
                  </button>
                ))}
              </div>
              <fieldset className="doubts">
                <legend>{t.how}</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={!!doubts[index]?.notUnderstood}
                    onChange={(e) =>
                      toggleDoubt('notUnderstood', e.target.checked)
                    }
                  />
                  <span className="feeling-icon not_understood">
                    <CircleHelp size={22} aria-hidden="true" />
                  </span>
                  {t.not_understood}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!!doubts[index]?.unsure}
                    onChange={(e) => toggleDoubt('unsure', e.target.checked)}
                  />
                  <span className="feeling-icon unsure">
                    <CloudSun size={22} aria-hidden="true" />
                  </span>
                  {t.unsureAnswer}
                </label>
              </fieldset>
              <div className="quiz-bottom">
                <button
                  className="button secondary"
                  disabled={!index || busy}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  {t.previous}
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    (answers[index].option === null &&
                      answers[index].confidence !== 'not_understood')
                  }
                  onClick={() =>
                    index < selected.questions.length - 1
                      ? setIndex((i) => i + 1)
                      : void finish()
                  }
                >
                  {busy
                    ? t.submitting
                    : index === selected.questions.length - 1
                      ? t.finish
                      : t.next}
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
          </>
        )}
        {view === 'result' && result && (
          <>
            {back}
            <section className="result-hero">
              <div className="burst" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} style={{ '--i': i } as React.CSSProperties} />
                ))}
              </div>
              <span className="result-icon">
                <Star size={44} fill="currentColor" aria-hidden="true" />
              </span>
              <h1>{t.result}</h1>
              <p>{t.resultText}</p>
              <div className="score">
                {result.correct}
                <span> / {result.total}</span>
              </div>
              <p>{t.correct}</p>
              <button
                className="button primary"
                onClick={() => selected && start(selected)}
              >
                {t.retry}
                <ArrowRight size={18} />
              </button>
            </section>
            <ResultSummary
              attempt={result}
              lang={lang}
              filter={resultFilter}
              onFilter={setResultFilter}
            />
            <Review
              attempt={result}
              lang={lang}
              images={selected?.questions.map((q) => q.image)}
              show={resultFilters[resultFilter]}
            />
          </>
        )}
        {view === 'progress' && (
          <>
            <span className="eyebrow muted">{t.overview}</span>
            <h1>{t.dashboard}</h1>
            <p className="page-intro">{t.dashboardText}</p>
            <div className="stat-grid">
              <div>
                <span>{t.attempts}</span>
                <strong>{attempts.length}</strong>
                <BookOpen />
              </div>
              <div>
                <span>{t.accuracy}</span>
                <strong>
                  {total ? Math.round((correct / total) * 100) : 0}
                  <small>%</small>
                </strong>
                <Check />
              </div>
              <div>
                <span>{t.help}</span>
                <strong>{uncertain}</strong>
                <CircleHelp />
              </div>
            </div>
            <div className="breakdown">
              <span className="good">
                {correct} {t.correct}
              </span>
              <span className="bad">
                {wrong} {t.wrong}
              </span>
              <span>
                {total - correct - wrong} {t.unanswered}
              </span>
            </div>
            <p className="content-note">{t.progressNote}</p>
            <h2>{t.confidence}</h2>
            <div className="confidence-grid">
              {feelings.map((feeling, i) => {
                const Icon = feelingIcons[i];
                const group = allAnswers.filter(
                  (a) => a.confidence === feeling,
                );
                // No longer offered in practice; shown only for older answers.
                if (feeling === 'best_guess' && !group.length) return null;
                return (
                  <div key={feeling}>
                    <span className={`feeling-icon ${feeling}`}>
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <span>{t[feeling]}</span>
                    <strong>{group.length}</strong>
                    <small>
                      {group.filter((a) => a.correct).length}{' '}
                      {t.correct.toLowerCase()}
                    </small>
                  </div>
                );
              })}
            </div>
            <h2>{t.missed}</h2>
            {missed.length ? (
              <div className="missed">
                {missed.map((m, i) => (
                  <article className="review-card" key={i}>
                    <div className="review-heading">
                      <span className="pill bad">
                        {m.wrong}/{m.total} {t.wrong.toLowerCase()}
                      </span>
                      <span className="confidence-label">{m.title}</span>
                    </div>
                    <h3>{m.prompt}</h3>
                    {m.image && (
                      <img
                        className="question-image"
                        src={m.image}
                        alt={t.questionImage}
                      />
                    )}
                    <p>
                      {t.lastWrong}: <strong>{m.last ?? t.skipped}</strong>
                    </p>
                    <p>
                      {t.rightAnswer}: <strong>{m.correctAnswer}</strong>
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="content-note">{t.noMissed}</p>
            )}
            <h2>{t.recent}</h2>
            {attempts.length ? (
              attempts.map((a) => (
                <details className="attempt" key={a.id}>
                  <summary>
                    <span className="attempt-icon">
                      <BookOpen size={20} />
                    </span>
                    <span>
                      <strong>{a.title}</strong>
                      <small>
                        {new Date(a.createdAt).toLocaleString(lang, {
                          timeZone: 'Europe/Amsterdam',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </small>
                    </span>
                    <span className="attempt-score">
                      {a.correct}/{a.total}
                    </span>
                  </summary>
                  <Review
                    attempt={a}
                    lang={lang}
                    images={a.answers.map((_, i) => imageOf(a.setId, i))}
                  />
                </details>
              ))
            ) : (
              <div className="empty">
                <Telescope size={40} aria-hidden="true" />
                <h3>{t.noAttempts}</h3>
                <p>{t.noAttemptsText}</p>
              </div>
            )}
          </>
        )}
        {view === 'manage' && (
          <>
            <span className="eyebrow muted">{t.manage}</span>
            <h1>{t.importTitle}</h1>
            <p className="page-intro">
              {t.importText} {t.subjectsHint}{' '}
              {subjects.map((s) => s.name).join(', ')}.
            </p>
            <section className="paper import">
              <div className="import-actions">
                <label className="button secondary">
                  <Upload size={18} />
                  {t.upload}
                  <input
                    type="file"
                    accept="application/json,.json,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setError('');
                      setSaved(false);
                      if (!/\.docx$/i.test(file.name)) {
                        if (file.size > 4000000) setError(t.importError);
                        else {
                          setJson(await file.text());
                          setOrigin({ source: 'json', fileName: file.name });
                        }
                        return;
                      }
                      // Word files are read on the server into draft sets
                      // that show up below for checking before saving.
                      setBusy(true);
                      try {
                        const r = await fetch('/api/import', {
                          method: 'POST',
                          body: file,
                        });
                        const payload = await r.json().catch(() => null);
                        if (!r.ok)
                          setError(`${t.docxError} ${payload?.error ?? ''}`);
                        else {
                          setJson(JSON.stringify(payload, null, 2));
                          setOrigin({ source: 'word', fileName: file.name });
                        }
                      } catch {
                        setError(t.docxError);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    const { id, createdAt, sample: example, ...s } = sample;
                    void id;
                    void createdAt;
                    void example;
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(s, null, 2)], {
                        type: 'application/json',
                      }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'arinova-example.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={16} aria-hidden="true" />
                  {t.format}
                </button>
              </div>
              {preview.length > 0 && (
                <div className="import-preview">
                  {longest > partSizes[0] && (
                    <label className="split">
                      {t.splitLabel}
                      <select
                        value={partSize}
                        onChange={(e) => setPartSize(Number(e.target.value))}
                      >
                        <option value={0}>{t.noSplit}</option>
                        {partSizes
                          .filter((n) => n < longest)
                          .map((n) => (
                            <option key={n} value={n}>
                              {n} {t.perPart}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <p>{t.checkImport}</p>
                  <ul>
                    {preview.map((p, i) => (
                      <li key={i}>
                        <strong>{p.title}</strong>
                        <span
                          className={findSubject(p.subject ?? '') ? '' : 'bad'}
                        >
                          {findSubject(p.subject ?? '')
                            ? subjectLabel(p.subject!, lang)
                            : t.noSubject}
                        </span>
                        <span>
                          {p.questions?.length ?? 0} {t.questions}
                        </span>
                        {pictures(p) > 0 && (
                          <span>
                            {pictures(p)} {t.pictures}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="json-label">
                JSON
                <textarea
                  spellCheck={false}
                  value={json}
                  onChange={(e) => {
                    setJson(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={
                    '{\n  "title": "…",\n  "subject": "Taal",\n  "language": "nl",\n  "material": "…",\n  "questions": […]\n}'
                  }
                />
              </label>
              <button
                disabled={busy || !json.trim()}
                className="button primary"
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  setSaved(false);
                  const upload = preview.map((p) => ({ ...p, ...origin }));
                  try {
                    const r = await fetch('/api/sets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(
                        upload.length === 1 ? upload[0] : upload,
                      ),
                    });
                    // The server names what is wrong, e.g. which question.
                    const payload = await r.json().catch(() => null);
                    if (!r.ok) {
                      setError(
                        [t.importError, payload?.error]
                          .filter(Boolean)
                          .join(' '),
                      );
                      return;
                    }
                    setJson('');
                    setOrigin({ source: 'json' });
                    await load();
                    setSaved(true);
                  } catch {
                    setError(t.importError);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Plus size={18} />
                {busy ? t.submitting : t.save}
              </button>
              {saved && (
                <p role="status" className="success">
                  <Check size={18} />
                  {t.saved}
                </p>
              )}
            </section>
            <section className="paper history">
              <h2>{t.history}</h2>
              <p>{t.historyText}</p>
              <ul className="history-list">
                {sets.map((s) => {
                  const practised = attempts.filter(
                    (a) => a.setId === s.id,
                  ).length;
                  const when = (iso: string) =>
                    new Date(iso).toLocaleString(lang, {
                      timeZone: 'Europe/Amsterdam',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    });
                  const source = s.sample
                    ? t.sourceSample
                    : s.source === 'word'
                      ? t.sourceWord
                      : s.source === 'api'
                        ? t.sourceApi
                        : s.source === 'json'
                          ? t.sourceJson
                          : t.sourceUnknown;
                  return (
                    <li key={s.id} className={s.deletedAt ? 'deleted' : ''}>
                      <button
                        type="button"
                        className="history-open"
                        aria-haspopup="dialog"
                        onClick={() => setViewing(s as StudySet)}
                      >
                        <strong>{s.title}</strong>
                        <span>
                          {subjectLabel(s.subject, lang)} · {s.questions.length}{' '}
                          {t.questions} · {practised}× {t.practised}
                        </span>
                        <span>
                          {when(s.createdAt)} · {source}
                          {s.fileName && ` · ${s.fileName}`}
                        </span>
                        {s.deletedAt && (
                          <span className="pill bad">
                            {t.deletedOn} {when(s.deletedAt)}
                          </span>
                        )}
                        <span className="history-view">
                          <Eye size={16} aria-hidden="true" />
                          {t.view}
                        </span>
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setDeleted(s, !s.deletedAt)}
                      >
                        {s.deletedAt ? (
                          <RotateCcw size={16} aria-hidden="true" />
                        ) : (
                          <Trash2 size={16} aria-hidden="true" />
                        )}
                        {s.deletedAt ? t.restore : t.delete}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            {viewing && (
              <SetViewer
                set={viewing}
                attempts={attempts.filter((a) => a.setId === viewing.id)}
                lang={lang}
                onClose={() => setViewing(null)}
              />
            )}
            <FaceEditor
              faces={faces}
              t={t}
              onSave={async (name, image) => {
                setError('');
                try {
                  await api('/api/faces', { name, image });
                  setFaces((f) => {
                    const next = { ...f };
                    if (image) next[name] = image;
                    else delete next[name];
                    return next;
                  });
                } catch {
                  setError(t.error);
                }
              }}
            />
          </>
        )}
      </main>
      <footer hidden={view === 'library'}>
        <div className="brand small">
          <Sparkle size={20} fill="currentColor" aria-hidden="true" /> arinova.
        </div>
        <span>{t.tagline}</span>
        <span>NL · TR · EN</span>
      </footer>
    </div>
  );
}
// The parent's look at a whole set: every question with the right answer
// marked, and how often Arin answered it wrong. Esc or the backdrop closes it.
function SetViewer({
  set,
  attempts,
  lang,
  onClose,
}: {
  set: StudySet;
  attempts: Attempt[];
  lang: Language;
  onClose: () => void;
}) {
  const t = words[lang];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="set-viewer"
      aria-labelledby="set-viewer-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <div className="set-viewer-inner">
        <header>
          <div>
            <span className="eyebrow">{subjectLabel(set.subject, lang)}</span>
            <h2 id="set-viewer-title">{set.title}</h2>
          </div>
          <button
            type="button"
            className="close-button"
            aria-label={t.close}
            onClick={() => dialog.current?.close()}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        {set.description && <p>{set.description}</p>}
        <SetFacts set={set} lang={lang} />
        {set.material.trim() && (
          <details className="set-viewer-material">
            <summary>{t.material}</summary>
            <div className="material">{set.material}</div>
          </details>
        )}
        <ol className="set-viewer-questions">
          {set.questions.map((q, i) => {
            const answers = attempts.map((a) => a.answers[i]).filter(Boolean);
            const wrong = answers.filter((a) => !a.correct).length;
            return (
              <li key={i}>
                <div className="review-heading">
                  <strong>
                    {t.question} {i + 1}
                  </strong>
                  {answers.length > 0 && (
                    <span className={`pill ${wrong ? 'bad' : 'good'}`}>
                      {wrong}/{answers.length} {t.wrong.toLowerCase()}
                    </span>
                  )}
                </div>
                <h3>{q.prompt}</h3>
                {q.image && (
                  <img
                    className="question-image"
                    src={q.image}
                    alt={t.questionImage}
                  />
                )}
                <ul className="set-viewer-options">
                  {q.options.map((o, j) => (
                    <li key={j} className={j === q.correctIndex ? 'right' : ''}>
                      <span className="option-letter">{'ABCDEF'[j]}</span>
                      {q.optionImages?.[j] && (
                        <img
                          className="option-image"
                          src={q.optionImages[j]!}
                          alt=""
                        />
                      )}
                      <span>{o}</span>
                      {j === q.correctIndex && (
                        <Check size={18} aria-label={t.rightAnswer} />
                      )}
                    </li>
                  ))}
                </ul>
                {q.explanation && (
                  <p className="explanation">{q.explanation}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </dialog>
  );
}
type Words = (typeof words)[Language];
const typeLabels: Record<TestType, (t: Words) => string> = {
  'single-choice': (t) => t.typeSingleChoice,
  'true-false': (t) => t.typeTrueFalse,
  'multiple-choice': (t) => t.typeMultipleChoice,
  'type-answer': (t) => t.typeTypeAnswer,
};
const difficultyLabels: Record<Difficulty, (t: Words) => string> = {
  easy: (t) => t.difficultyEasy,
  medium: (t) => t.difficultyMedium,
  hard: (t) => t.difficultyHard,
};
// Facts about a set for its card. Older sets have no lesson or group
// fields, so those are looked for in the title and description.
function SetFacts({
  set,
  lang,
}: {
  set: StudySet | PublicSet;
  lang: Language;
}) {
  const t = words[lang];
  const counts = set.questions.map((q) => q.options.length);
  const [low, high] = [Math.min(...counts), Math.max(...counts)];
  const text = `${set.title} ${set.description}`;
  const facts: [string, string | number][] = [
    [t.factQuestions, set.questions.length],
    [t.factOptions, low === high ? low : `${low}–${high}`],
    [t.factSubject, subjectLabel(set.subject, lang)],
    [t.factLesson, set.lesson ?? lessonIn(text) ?? '—'],
    [t.factGroup, set.group ?? groupIn(text) ?? '—'],
    // Sets from before test types existed all have one correct answer.
    [t.factType, typeLabels[set.testType ?? 'single-choice'](t)],
    [
      t.factDifficulty,
      set.difficulty ? difficultyLabels[set.difficulty](t) : '—',
    ],
    [
      t.factAdded,
      // The author's date is a calendar day; the import time is a moment.
      set.addedDate
        ? new Date(`${set.addedDate}T12:00:00Z`).toLocaleDateString(lang, {
            timeZone: 'UTC',
            dateStyle: 'medium',
          })
        : new Date(set.createdAt).toLocaleDateString(lang, {
            timeZone: 'Europe/Amsterdam',
            dateStyle: 'medium',
          }),
    ],
  ];
  return (
    <dl className="set-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
// Donut of the score (correct, wrong, not answered) and radio filters for
// the answer list. Colours were checked for colour-blind separation; the
// legend names every segment with its count, so colour never stands alone.
const donutColours = {
  correct: '#1f6f43',
  wrong: '#f2766a',
  skipped: '#8f8aa8',
};
function ResultSummary({
  attempt,
  lang,
  filter,
  onFilter,
}: {
  attempt: Attempt;
  lang: Language;
  filter: ResultFilter;
  onFilter: (f: ResultFilter) => void;
}) {
  const t = words[lang];
  const total = attempt.answers.length;
  const parts = [
    {
      key: 'correct',
      label: t.correct,
      n: attempt.answers.filter((a) => a.correct).length,
    },
    {
      key: 'wrong',
      label: t.wrong,
      n: attempt.answers.filter(resultFilters.wrong).length,
    },
    {
      key: 'skipped',
      label: t.unanswered,
      n: attempt.answers.filter((a) => a.option === null).length,
    },
  ] as const;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const shown = parts.filter((p) => p.n);
  // A 2px gap between segments, none when one segment fills the ring.
  const gap = shown.length > 1 ? 2 : 0;
  let at = 0;
  const pct = (n: number) => Math.round((n / total) * 100);
  const options: [ResultFilter, string][] = [
    ['all', t.filterAll],
    ['wrong', t.wrong],
    ['correct', t.correct],
    ['unsure', t.filterUnsure],
    ['not_understood', t.filterNotUnderstood],
  ];
  return (
    <section className="result-summary paper">
      <div className="result-chart">
        <svg
          viewBox="0 0 140 140"
          role="img"
          aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(', ')}
        >
          {shown.map((p) => {
            const length = (p.n / total) * circumference;
            const segment = (
              <circle
                key={p.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={donutColours[p.key]}
                strokeWidth="20"
                strokeDasharray={`${Math.max(length - gap, 0.1)} ${circumference}`}
                strokeDashoffset={-at}
                transform="rotate(-90 70 70)"
              >
                <title>{`${p.label}: ${p.n} (${pct(p.n)}%)`}</title>
              </circle>
            );
            at += length;
            return segment;
          })}
          <text x="70" y="68" textAnchor="middle" className="donut-value">
            {pct(parts[0].n)}%
          </text>
          <text x="70" y="88" textAnchor="middle" className="donut-label">
            {t.correct.toLowerCase()}
          </text>
        </svg>
        <ul className="result-legend">
          {parts.map((p) => (
            <li key={p.key}>
              <span
                className="swatch"
                style={{ background: donutColours[p.key] }}
                aria-hidden="true"
              />
              <span>{p.label}</span>
              <strong>{p.n}</strong>
              <small>{pct(p.n)}%</small>
            </li>
          ))}
        </ul>
      </div>
      <fieldset className="result-filters">
        <legend>{t.showAnswers}</legend>
        {options.map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="result-filter"
              value={value}
              checked={filter === value}
              onChange={() => onFilter(value)}
            />
            {label}
            <span className="count">
              {attempt.answers.filter(resultFilters[value]).length}
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
function Review({
  attempt,
  lang,
  images = [],
  show = () => true,
}: {
  attempt: Attempt;
  lang: Language;
  images?: (string | undefined)[];
  show?: (a: Attempt['answers'][number]) => boolean;
}) {
  const t = words[lang];
  const visible = attempt.answers.filter(show).length;
  return (
    <div className="review">
      {!visible && <p className="empty">{t.noneInFilter}</p>}
      {attempt.answers.map((a, i) =>
        !show(a) ? null : (
          <article className="review-card" key={i}>
            <div className="review-heading">
              <span
                className={`pill ${a.correct ? 'good' : a.option === null ? '' : 'bad'}`}
              >
                {a.correct
                  ? t.correct
                  : a.option === null
                    ? t.unanswered
                    : t.wrong}
              </span>
              {a.confidence !== 'sure' && (
                <span className="confidence-label">{t[a.confidence]}</span>
              )}
            </div>
            <h3>
              {i + 1}. {a.prompt}
            </h3>
            {images[i] && (
              <img
                className="question-image"
                src={images[i]}
                alt={t.questionImage}
              />
            )}
            <p>
              {t.yourAnswer}: <strong>{a.selected ?? t.skipped}</strong>
            </p>
            {!a.correct && (
              <p>
                {t.rightAnswer}: <strong>{a.correctAnswer}</strong>
              </p>
            )}
            {a.explanation && <p className="explanation">{a.explanation}</p>}
            {a.correct && a.confidence !== 'sure' && (
              <span className="review-note">{t.guessedCorrect}</span>
            )}
          </article>
        ),
      )}
    </div>
  );
}
