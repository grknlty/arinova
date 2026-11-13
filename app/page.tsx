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
  Printer,
  Eye,
  EyeOff,
  CloudSun,
  Flag,
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
  History,
  ChevronDown,
  FolderOpen,
  Tags,
  Pencil,
  FileText,
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
  MaterialDoc,
} from '@/lib/model';
import { normalizeSets } from '@/lib/formats';
import { groupIn, lessonIn } from '@/lib/school';
import {
  buttonOrder,
  defaultButtonsPerRow,
  defaultFactCount,
  factOrder,
  type FactKey,
} from '@/lib/facts';
import { CardLayoutEditor, factLabels } from './fact-order';
import { CatalogEditor } from './catalog-editor';
import {
  DetailsEditor,
  GroupingFilters,
  matchesGrouping,
  styleLabels,
  type Grouping,
  type SetStatus,
} from './set-grouping';
import { Dropdown } from './dropdown';
import type { Catalog } from '@/lib/records';
type Doubts = {
  unsure?: boolean;
  notUnderstood?: boolean;
  oddOptions?: boolean;
};
type Progress = {
  answers: Answer[];
  doubts: Record<number, Doubts>;
  index: number;
};
// Which answers the result page lists; "unsure" includes the older
// "best guess" answers.
type ResultFilter =
  | 'all'
  | 'wrong'
  | 'correct'
  | 'unanswered'
  | 'unsure'
  | 'not_understood'
  | 'odd_options';
const resultFilters: Record<
  ResultFilter,
  (a: Attempt['answers'][number]) => boolean
> = {
  all: () => true,
  wrong: (a) => a.option !== null && !a.correct,
  correct: (a) => a.correct,
  unanswered: (a) => a.option === null,
  unsure: (a) => a.confidence === 'unsure' || a.confidence === 'best_guess',
  not_understood: (a) => a.confidence === 'not_understood',
  odd_options: (a) => !!a.oddOptions,
};
type View =
  | 'library'
  | 'subject'
  | 'progress'
  | 'materials'
  | 'manage'
  | 'catalog'
  | 'study'
  | 'quiz'
  | 'result';
type Place = {
  view: View;
  subject: string;
  setId?: string;
  result?: Attempt;
  scrollY: number;
};
// The doubts shown on the progress page; "no doubts" is left out.
const feelings = ['unsure', 'not_understood', 'best_guess'] as const;
const feelingIcons = [CloudSun, CircleHelp, Shuffle];
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
// A subject's planet from the home page, small, for lists of subjects. A
// subject the parent added beyond the fixed ones has no icon of its own.
function SubjectPlanet({ name }: { name: string }) {
  const fixed = findSubject(name);
  const Icon = fixed ? subjectIcons[fixed.id] : Sparkle;
  return (
    <span
      className={`planet-mark art-${name === 'all' ? 'all' : (fixed?.id ?? 'other')}`}
      aria-hidden="true"
    >
      <span className="planet">
        <Icon size={16} strokeWidth={2.2} />
      </span>
    </span>
  );
}
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
  const [catalog, setCatalog] = useState<Catalog>({ groups: [], subjects: [] });
  const [selected, setSelected] = useState<StudySet | PublicSet | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Attempt | null>(null);
  const [subject, setSubject] = useState('all');
  // Filters inside a subject; they apply only to the subject they were set in.
  const [grouping, setGrouping] = useState<Grouping & { subject?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginRole, setLoginRole] = useState('learner');
  const [json, setJson] = useState('');
  const [partSize, setPartSize] = useState(0);
  // Materials page: the chosen subject (id), material and what is shown of it.
  const [materialSubject, setMaterialSubject] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [allMaterials, setAllMaterials] = useState(false);
  const [materialTab, setMaterialTab] = useState<'questions' | 'results'>(
    'questions',
  );
  // The group and subject (ids) that imported tests are added to.
  const [importGroup, setImportGroup] = useState('');
  const [importSubject, setImportSubject] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  // The subject the progress page is narrowed to.
  const [progressSubject, setProgressSubject] = useState('all');
  // Group, theme, lesson and test style chosen on the progress page.
  const [progressGrouping, setProgressGrouping] = useState<Grouping>({});
  // Picking Incorrect or a doubt on the progress page lists only the
  // practice sessions with such answers, opened at them.
  const [sessionFilter, setSessionFilter] = useState<ResultFilter>('all');
  const sessionsHeading = useRef<HTMLHeadingElement>(null);
  // The set opened from the history, shown in a window with its answers.
  const [viewing, setViewing] = useState<StudySet | null>(null);
  // The set whose earlier results are shown in a window.
  const [resultsOf, setResultsOf] = useState<StudySet | PublicSet | null>(null);
  // The card whose details the parent is changing from the learning space.
  const [editing, setEditing] = useState<StudySet | null>(null);
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
      setAttempts(await api('/api/progress'));
      setCatalog(
        await api('/api/catalog').catch(() => ({ groups: [], subjects: [] })),
      );
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (session?.role) void load();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  // The open page is kept for this tab, so a refresh (easily done by
  // accident on a tablet) returns to it at the same scroll position. A
  // practice then continues from its saved progress.
  const placeKey = `arinova-place:${session?.role}`;
  const restored = useRef(false);
  const pendingScroll = useRef<{ view: View; y: number } | null>(null);
  useEffect(() => {
    if (restored.current || loading || !session?.role) return;
    restored.current = true;
    let place: Place | null = null;
    try {
      place = JSON.parse(sessionStorage.getItem(placeKey) ?? 'null');
    } catch {}
    if (!place) return;
    const set = sets.find((s) => s.id === place.setId);
    const parentOnly = ['progress', 'materials', 'manage', 'catalog'].includes(
      place.view,
    );
    if (parentOnly && session.role !== 'parent') return;
    if (['study', 'quiz'].includes(place.view) && !set) return;
    if (place.view === 'result' && !place.result) return;
    setSubject(place.subject);
    if (set) setSelected(set);
    if (place.result) setResult(place.result);
    if (place.view === 'quiz') start(set!);
    else setView(place.view);
    pendingScroll.current = { view: place.view, y: place.scrollY };
  }, [loading, session]); // eslint-disable-line react-hooks/exhaustive-deps
  // Scrolls once the restored page has rendered.
  useEffect(() => {
    if (pendingScroll.current?.view !== view) return;
    window.scrollTo(0, pendingScroll.current.y);
    pendingScroll.current = null;
  }, [view, loading]);
  useEffect(() => {
    if (!restored.current || !session?.role) return;
    const save = () => {
      try {
        sessionStorage.setItem(
          placeKey,
          JSON.stringify({
            view,
            subject,
            setId: selected?.id,
            ...(view === 'result' && result ? { result } : {}),
            scrollY: window.scrollY,
          } satisfies Place),
        );
      } catch {}
    };
    save();
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [view, subject, selected, result, session, loading]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // stronger signal, so it wins when both are ticked. Odd options are noted
  // apart, with either.
  const [doubts, setDoubts] = useState<Record<number, Doubts>>({});
  function toggleDoubt(key: keyof Doubts, value: boolean) {
    const next = { ...doubts[index], [key]: value };
    setDoubts((d) => ({ ...d, [index]: next }));
    updateAnswer({
      confidence: next.notUnderstood
        ? 'not_understood'
        : next.unsure
          ? 'unsure'
          : 'sure',
      oddOptions: next.oddOptions || undefined,
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
  // Deleting keeps Nova's earlier answers; the set only leaves her library.
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
  // Only for deleted material; its results go with it, so it asks first.
  async function removeForever(s: StudySet | PublicSet) {
    if (!window.confirm(t.confirmDeleteForever.replace('{title}', s.title)))
      return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/sets/${s.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      if (materialId === s.id) setMaterialId('');
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
    <Dropdown
      className="language"
      label={t.language}
      hideLabel
      value={lang}
      options={[
        { value: 'nl', label: 'NL · Nederlands' },
        { value: 'tr', label: 'TR · Türkçe' },
        { value: 'en', label: 'EN · English' },
      ]}
      onChange={(value) => setLang(value as Language)}
    />
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
            nova<span className="brand-dot">.</span>
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
  // The order of the details on a subject's cards, and how many show before
  // "more", as the parent set them.
  const layoutOf = (name: string) =>
    catalog.subjects.find(
      (s) => canonicalSubject(s.name) === canonicalSubject(name),
    );
  const orderOf = (name: string) => factOrder(layoutOf(name)?.factOrder);
  const SubjectIcon = subjectInfo ? subjectIcons[subjectInfo.id] : Sparkle;
  const visibleSets = sets.filter(
    (s) =>
      !s.deletedAt &&
      (subject === 'all' || canonicalSubject(s.subject) === subject),
  );
  const activeGrouping = grouping.subject === subject ? grouping : {};
  // A practice in progress counts as started, even when it was done before.
  const statusOf = (s: StudySet | PublicSet): SetStatus =>
    savedProgress(s)
      ? 'started'
      : attempts.some((a) => a.setId === s.id)
        ? 'done'
        : 'new';
  const shownSets = visibleSets.filter((s) =>
    matchesGrouping(s, activeGrouping, statusOf),
  );
  // Subjects that have results, each with its share of correct answers.
  // Fixed subjects come in their usual order, any others after them.
  const order = (name: string) =>
    subjects.findIndex((s) => s.name === name) + 1 || 99;
  // Results of deleted (or no longer existing) material stay in the history
  // but no longer count. The parent's set list includes deleted sets.
  const fromDeleted = (a: Attempt) => {
    const set = sets.find((s) => s.id === a.setId);
    return !set || !!set.deletedAt;
  };
  const countedAttempts = attempts.filter((a) => !fromDeleted(a));
  // A test practised more than once counts with its latest attempt only.
  const newest = new Map<string, Attempt>();
  for (const a of countedAttempts) {
    const seen = newest.get(a.setId);
    if (!seen || a.createdAt > seen.createdAt) newest.set(a.setId, a);
  }
  const latestAttempts = [...newest.values()];
  // Every school subject is listed, with or without results.
  const resultSubjects = [
    ...new Set([
      ...catalog.subjects.map((s) => canonicalSubject(s.name)),
      ...attempts.map((a) => canonicalSubject(a.subject)),
    ]),
  ]
    .sort((a, b) => order(a) - order(b))
    .map((name) => {
      const answers = latestAttempts
        .filter((a) => canonicalSubject(a.subject) === name)
        .flatMap((a) => a.answers);
      return {
        name,
        total: answers.length,
        correct: answers.filter((a) => a.correct).length,
      };
    });
  const inProgressSubject = (a: Attempt) =>
    progressSubject === 'all' ||
    canonicalSubject(a.subject) === progressSubject;
  // The sets with counted results in the chosen subject, to filter by.
  const progressSets = sets.filter((s) =>
    latestAttempts.some((a) => a.setId === s.id && inProgressSubject(a)),
  );
  const filtering = Object.values(progressGrouping).some(Boolean);
  const inProgressGrouping = (a: Attempt) => {
    if (!filtering) return true;
    const set = sets.find((s) => s.id === a.setId);
    return !!set && matchesGrouping(set, progressGrouping);
  };
  const shownAttempts = attempts.filter(
    (a) => inProgressSubject(a) && inProgressGrouping(a),
  );
  const shownCounted = shownAttempts.filter((a) => !fromDeleted(a));
  const shownLatest = latestAttempts.filter(
    (a) => inProgressSubject(a) && inProgressGrouping(a),
  );
  const allAnswers = shownLatest.flatMap((a) => a.answers);
  // Questions answered wrong at least once, most often wrong first.
  const questionOf = (setId: string, question: number) =>
    sets.find((s) => s.id === setId)?.questions[question];
  const missed = Object.values(
    [...shownCounted]
      .reverse()
      .flatMap((a) =>
        a.answers.map((x, i) => ({
          ...x,
          key: `${a.setId}:${i}`,
          title: a.title,
          question: questionOf(a.setId, i),
        })),
      )
      .reduce<
        Record<
          string,
          {
            prompt: string;
            title: string;
            question?: ShownQuestion;
            correctAnswer: string;
            wrong: number;
            total: number;
            last: string | null;
            lastOption: number | null;
          }
        >
      >((all, x) => {
        const m = (all[x.key] ??= {
          prompt: x.prompt,
          title: x.title,
          question: x.question,
          correctAnswer: x.correctAnswer,
          wrong: 0,
          total: 0,
          last: null,
          lastOption: null,
        });
        m.total++;
        if (!x.correct) {
          m.wrong++;
          m.last = x.selected;
          m.lastOption = x.option;
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
  const groupName = catalog.groups.find((g) => g.id === importGroup)?.name;
  const groupSubjects = catalog.subjects.filter((s) => s.group === groupName);
  const subjectName = groupSubjects.find((s) => s.id === importSubject)?.name;
  const longest = Math.max(0, ...drafts.map((d) => d.questions?.length ?? 0));
  const total = allAnswers.length;
  const correct = allAnswers.filter((a) => a.correct).length;
  const wrong = allAnswers.filter(resultFilters.wrong).length;
  const skipped = allAnswers.filter((a) => a.option === null).length;
  const oddOptions = allAnswers.filter(resultFilters.odd_options).length;
  const percent = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  // Each test is listed once, at its latest try, with the earlier tries
  // under it. Filtered, only the counted latest tries have the answers
  // behind the numbers.
  const triesOf = new Map<string, Attempt[]>();
  for (const a of [...shownAttempts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  ))
    triesOf.set(a.setId, [...(triesOf.get(a.setId) ?? []), a]);
  const listedSessions =
    sessionFilter === 'all'
      ? [...triesOf.values()]
      : shownLatest
          .filter((a) => a.answers.some(resultFilters[sessionFilter]))
          .map((a) => [a]);
  function showSessions(filter: ResultFilter) {
    const next = sessionFilter === filter ? 'all' : filter;
    setSessionFilter(next);
    if (next !== 'all')
      requestAnimationFrame(() =>
        sessionsHeading.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      );
  }
  const sessionRow = (a: Attempt) => (
    <details
      className={`attempt ${fromDeleted(a) ? 'deleted' : ''}`}
      key={`${a.id}-${sessionFilter}`}
      open={sessionFilter !== 'all'}
    >
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
          {fromDeleted(a) && (
            <span className="pill bad">{t.deletedResult}</span>
          )}
        </span>
        <span className="attempt-score">
          {a.correct}/{a.total}
        </span>
      </summary>
      <FilteredReview
        attempt={a}
        lang={lang}
        initialFilter={sessionFilter}
        questions={a.answers.map((_, i) => questionOf(a.setId, i))}
      />
    </details>
  );
  const sessionFilterLabel: Record<ResultFilter, string> = {
    all: t.filterAll,
    correct: t.correct,
    wrong: t.wrong,
    unanswered: t.unanswered,
    unsure: t.unsure,
    not_understood: t.not_understood,
    odd_options: t.odd_options,
  };
  // A row beside the chart: a swatch for the chart's parts, an icon for the
  // rest. Rows with a filter list the matching practice sessions below.
  const statRow = (row: {
    key: string;
    label: string;
    value: string;
    count: number;
    swatch?: string;
    Icon?: typeof BookOpen;
    filter?: ResultFilter;
  }) => {
    const content = (
      <>
        {row.swatch ? (
          <span
            className="swatch"
            style={{ background: row.swatch }}
            aria-hidden="true"
          />
        ) : row.Icon ? (
          <row.Icon className="row-icon" size={16} aria-hidden="true" />
        ) : (
          <span />
        )}
        <span>{row.label}</span>
        <span className="row-figures">
          <strong>{row.value}</strong>
          <small>
            {row.count} {t.questions}
          </small>
        </span>
      </>
    );
    return (
      <li key={row.key} className={row.key}>
        {row.filter ? (
          <button
            aria-pressed={sessionFilter === row.filter}
            onClick={() => showSessions(row.filter!)}
          >
            {content}
          </button>
        ) : (
          <div>{content}</div>
        )}
      </li>
    );
  };
  return (
    <div className="app">
      <header className="header">
        <button
          className="brand"
          onClick={() => navigate('library')}
          aria-label="Nova"
        >
          <span className="brand-icon">
            <Sparkle fill="currentColor" />
          </span>
          nova<span className="brand-dot">.</span>
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
                className={
                  ['materials', 'manage', 'catalog'].includes(view)
                    ? 'active'
                    : ''
                }
                onClick={() => navigate('materials')}
              >
                <FolderOpen size={18} />
                {t.materials}
              </button>
            </>
          )}
        </nav>
        <div className="header-right">
          {languagePicker}
          <span className="avatar">N</span>
          {!session.demo && (
            <button
              className="icon-button"
              aria-label={t.logout}
              title={t.logout}
              onClick={async () => {
                await fetch('/api/auth', { method: 'DELETE' });
                try {
                  sessionStorage.removeItem(placeKey);
                } catch {}
                restored.current = false;
                setSession({ role: null, demo: false });
                setLoginRole('learner');
                setShowPassword(false);
                setAttempts([]);
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
      <main className="main">
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
            <h1 className="home-title">{t.welcome}</h1>
            <div className="subject-cards">
              {[
                { id: 'all', name: 'all', label: t.all, Icon: Sparkle },
                // By name, as the page's language shows it, with the
                // subjects the parent added beyond the fixed ones.
                ...[
                  ...subjects.map((s) => ({
                    id: s.id as string,
                    name: s.name as string,
                    label: subjectLabel(s.name, lang),
                    Icon: subjectIcons[s.id],
                  })),
                  ...catalog.subjects
                    .filter((s) => !findSubject(s.name))
                    .map((s, i) => ({
                      id: `custom-${i}`,
                      name: s.name,
                      label: s.name,
                      Icon: Sparkle,
                    })),
                ].sort((a, b) => a.label.localeCompare(b.label, lang)),
              ].map(({ id, name, label, Icon }) => (
                <button
                  key={id}
                  className={`subject-card art-${id}`}
                  aria-label={label}
                  onClick={() => pickSubject(name)}
                >
                  <span className="planet" aria-hidden="true">
                    <Icon size={26} strokeWidth={2} />
                  </span>
                  <span className="subject-card-name">{label}</span>
                  <span className="count" aria-hidden="true">
                    {
                      sets.filter(
                        (x) =>
                          !x.deletedAt &&
                          (name === 'all' ||
                            canonicalSubject(x.subject) === name),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
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
              <span className="count">{shownSets.length}</span>
            </div>
            <GroupingFilters
              sets={visibleSets}
              grouping={activeGrouping}
              t={t}
              subjectLabel={
                subject === 'all'
                  ? (name) => subjectLabel(name, lang)
                  : undefined
              }
              statusOf={statusOf}
              order={orderOf(activeGrouping.subjectName ?? subject)}
              onChange={(g) => setGrouping({ ...g, subject })}
            />
            <div className="cards">
              {shownSets.map((s) => {
                const progress = savedProgress(s);
                return (
                  <article className="study-card" key={s.id}>
                    <div className="card-body">
                      <div className="card-meta">
                        <span>
                          {subjectLabel(s.subject, lang)} · {t[s.language]}
                        </span>
                        {session.role === 'parent' && (
                          <button
                            type="button"
                            className="card-edit"
                            aria-haspopup="dialog"
                            aria-label={`${t.editDetails}: ${s.title}`}
                            title={t.editDetails}
                            onClick={() => setEditing(s as StudySet)}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <h3>{s.title}</h3>
                      {s.description && (
                        <CardDescription text={s.description} lang={lang} />
                      )}
                      <SetFacts
                        set={s}
                        lang={lang}
                        order={orderOf(s.subject)}
                        shown={
                          layoutOf(s.subject)?.factCount ?? defaultFactCount
                        }
                      />
                      {s.sample && (
                        <span className="sample-label">{t.sample}</span>
                      )}
                      {(() => {
                        // In the subject's order; a button shows only when it
                        // applies. The last one fills its row.
                        const layout = layoutOf(s.subject);
                        const perRow =
                          layout?.buttonsPerRow ?? defaultButtonsPerRow;
                        const buttons = {
                          study: (s.material.trim() || s.materialDoc) && (
                            <button
                              className="button secondary tone-study"
                              onClick={() => {
                                setSelected(s);
                                navigate('study');
                              }}
                            >
                              <BookOpen size={16} aria-hidden="true" />
                              {t.study}
                            </button>
                          ),
                          results: attempts.some((a) => a.setId === s.id) && (
                            <button
                              className="button secondary tone-results"
                              onClick={() => setResultsOf(s)}
                            >
                              <History size={16} aria-hidden="true" />
                              {t.previousResults}
                            </button>
                          ),
                          startOver: progress && (
                            <button
                              className="button secondary tone-again"
                              onClick={() => start(s, false)}
                            >
                              <RotateCcw size={16} aria-hidden="true" />
                              {t.startOver}
                            </button>
                          ),
                          practice: (
                            <button
                              className="button primary"
                              onClick={() => start(s)}
                            >
                              {progress
                                ? `${t.resume} · ${progress.index + 1}/${s.questions.length}`
                                : t.practice}
                              <ArrowRight size={16} />
                            </button>
                          ),
                        };
                        const shown = buttonOrder(layout?.buttonOrder).filter(
                          (key) => buttons[key],
                        );
                        const lastSpan = perRow - ((shown.length - 1) % perRow);
                        return (
                          <div
                            className="card-actions"
                            style={
                              { '--per-row': perRow } as React.CSSProperties
                            }
                          >
                            {shown.map((key, i) => (
                              <div
                                key={key}
                                style={
                                  i === shown.length - 1 && lastSpan > 1
                                    ? { gridColumn: `span ${lastSpan}` }
                                    : undefined
                                }
                              >
                                {buttons[key]}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </article>
                );
              })}
              {!loading && !visibleSets.length && (
                <p className="empty">{t.empty}</p>
              )}
              {visibleSets.length > 0 && !shownSets.length && (
                <p className="empty">
                  {t.noFilterMatch}{' '}
                  <button
                    className="text-button"
                    onClick={() => setGrouping({})}
                  >
                    {t.clearFilters}
                  </button>
                </p>
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
              {selected.materialDoc && (
                <MaterialDocLink doc={selected.materialDoc} lang={lang} />
              )}
              {(selected.material || !selected.materialDoc) && (
                <div className="material">
                  {selected.material || t.noMaterial}
                </div>
              )}
              <div className="paper-actions">
                <button
                  className="button secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  {t.print}
                </button>
                {attempts.some((a) => a.setId === selected.id) && (
                  <button
                    className="button secondary"
                    onClick={() => setResultsOf(selected)}
                  >
                    <History size={16} aria-hidden="true" />
                    {t.previousResults}
                  </button>
                )}
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
              <h1 className="prompt">{selected.questions[index].prompt}</h1>
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
                  <span>{t.not_understood}</span>
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
                  <span>{t.unsureAnswer}</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!!doubts[index]?.oddOptions}
                    onChange={(e) =>
                      toggleDoubt('oddOptions', e.target.checked)
                    }
                  />
                  <span className="feeling-icon odd_options">
                    <Flag size={22} aria-hidden="true" />
                  </span>
                  <span>{t.oddOptionsDoubt}</span>
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
                  // Every question needs an answer before moving on.
                  disabled={busy || answers[index].option === null}
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
              questions={selected?.questions}
              show={resultFilters[resultFilter]}
            />
          </>
        )}
        {view === 'progress' && (
          <>
            <div className="progress-layout">
              <nav className="paper subject-list" aria-label={t.bySubject}>
                <h2>{t.bySubject}</h2>
                <ul>
                  {[
                    { name: 'all', label: t.all, score: null },
                    // By name, as the page's language shows it.
                    ...resultSubjects
                      .map((s) => ({
                        name: s.name,
                        label: subjectLabel(s.name, lang),
                        score: s.total
                          ? Math.round((s.correct / s.total) * 100)
                          : null,
                      }))
                      .sort((a, b) => a.label.localeCompare(b.label, lang)),
                  ].map((s) => (
                    <li key={s.name}>
                      <button
                        className="subject-row"
                        aria-current={progressSubject === s.name}
                        onClick={() => {
                          setProgressSubject(s.name);
                          setProgressGrouping({});
                          setSessionFilter('all');
                        }}
                      >
                        <SubjectPlanet name={s.name} />
                        <span>{s.label}</span>
                        {s.score !== null && (
                          <span className="count-small">{s.score}%</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="progress-main">
                <GroupingFilters
                  sets={progressSets}
                  grouping={progressGrouping}
                  t={t}
                  order={
                    progressSubject === 'all'
                      ? undefined
                      : orderOf(progressSubject)
                  }
                  onChange={(g) => {
                    setProgressGrouping(g);
                    setSessionFilter('all');
                  }}
                />
                {total > 0 && (
                  <section className="paper progress-chart">
                    <ScoreChart
                      answers={allAnswers}
                      lang={lang}
                      legend={
                        <div className="progress-legend">
                          <ul>
                            {statRow({
                              key: 'practices',
                              label: t.attempts,
                              value: String(shownLatest.length),
                              count: total,
                              Icon: BookOpen,
                            })}
                            {statRow({
                              key: 'correct',
                              label: t.correct,
                              value: `${percent(correct)}%`,
                              count: correct,
                              swatch: donutColours.correct,
                            })}
                            {statRow({
                              key: 'wrong',
                              label: t.wrong,
                              value: `${percent(wrong)}%`,
                              count: wrong,
                              swatch: donutColours.wrong,
                              filter: 'wrong',
                            })}
                            {skipped > 0 &&
                              statRow({
                                key: 'skipped',
                                label: t.unanswered,
                                value: `${percent(skipped)}%`,
                                count: skipped,
                                swatch: donutColours.skipped,
                                filter: 'unanswered',
                              })}
                          </ul>
                          <ul>
                            {(['unsure', 'not_understood'] as const).map(
                              (feeling) => {
                                const n = allAnswers.filter(
                                  resultFilters[feeling],
                                ).length;
                                return statRow({
                                  key: feeling,
                                  label: t[feeling],
                                  value: `${percent(n)}%`,
                                  count: n,
                                  Icon: feelingIcons[feelings.indexOf(feeling)],
                                  filter: feeling,
                                });
                              },
                            )}
                            {statRow({
                              key: 'odd_options',
                              label: t.odd_options,
                              value: `${percent(oddOptions)}%`,
                              count: oddOptions,
                              Icon: Flag,
                              filter: 'odd_options',
                            })}
                          </ul>
                        </div>
                      }
                    />
                  </section>
                )}
                <p className="content-note">{t.progressNote}</p>
                <details className="missed-section">
                  <summary>
                    <h2>{t.missed}</h2>
                    {missed.length > 0 && (
                      <span className="pill bad">{missed.length}</span>
                    )}
                    <ChevronDown
                      className="chevron"
                      size={24}
                      aria-hidden="true"
                    />
                  </summary>
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
                          <h3 className="prompt">{m.prompt}</h3>
                          <QuestionDetail
                            question={m.question}
                            prompt={m.prompt}
                            chosen={m.lastOption}
                            chosenText={m.last}
                            chosenLabel={t.lastWrong}
                            correctAnswer={m.correctAnswer}
                            lang={lang}
                          />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="content-note">{t.noMissed}</p>
                  )}
                </details>
                <div className="sessions-heading">
                  <h2 ref={sessionsHeading}>{t.recent}</h2>
                  {sessionFilter !== 'all' && (
                    <button
                      className="filter-chip"
                      title={t.showAllSessions}
                      aria-label={`${sessionFilterLabel[sessionFilter]}: ${t.showAllSessions}`}
                      onClick={() => setSessionFilter('all')}
                    >
                      {sessionFilterLabel[sessionFilter]}
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {listedSessions.length ? (
                  listedSessions.map(([latest, ...earlier]) => (
                    <div className="attempt-group" key={latest.id}>
                      {sessionRow(latest)}
                      {earlier.length > 0 && (
                        <div
                          className="earlier-tries"
                          role="group"
                          aria-label={t.earlierTries}
                        >
                          {earlier.map(sessionRow)}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <Telescope size={40} aria-hidden="true" />
                    <h3>{t.noAttempts}</h3>
                    <p>{t.noAttemptsText}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {view === 'materials' &&
          (() => {
            const chosen = catalog.subjects.find(
              (s) => s.id === materialSubject,
            );
            const materials = chosen
              ? sets.filter((s) => s.subject === chosen.name)
              : [];
            const material = materials.find((s) => s.id === materialId) as
              StudySet | undefined;
            const results = attempts.filter((a) => a.setId === materialId);
            // Deleted material is listed apart, below the rest. The newest
            // four show first; the others wait behind a button.
            const active = materials
              .filter((s) => !s.deletedAt)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const listed = allMaterials ? active : active.slice(0, 4);
            const deleted = materials.filter((s) => s.deletedAt);
            const row = (s: (typeof materials)[number]) => {
              const practised = attempts.filter((a) => a.setId === s.id).length;
              return (
                <li key={s.id}>
                  <button
                    className={s.deletedAt ? 'deleted' : ''}
                    onClick={() => {
                      setMaterialId(s.id);
                      setMaterialTab('questions');
                    }}
                  >
                    <strong>{s.title}</strong>
                    <span>
                      {s.questions.length} {t.questions} · {practised}×{' '}
                      {t.practised}
                      {s.group && ` · ${s.group}`}
                    </span>
                    {s.deletedAt && (
                      <span className="pill bad">
                        {t.deletedOn}{' '}
                        {new Date(s.deletedAt).toLocaleDateString(lang)}
                      </span>
                    )}
                  </button>
                  <a
                    className="material-action"
                    href={`/api/sets/${s.id}/export`}
                    download
                    aria-label={`${t.exportJson}: ${s.title}`}
                  >
                    <Download
                      size={16}
                      aria-hidden="true"
                      stroke={`url(#export-${s.id})`}
                    >
                      {/* The icon in the same colours as the text. */}
                      <defs>
                        <linearGradient
                          id={`export-${s.id}`}
                          gradientUnits="userSpaceOnUse"
                          x1="0"
                          y1="0"
                          x2="24"
                          y2="24"
                        >
                          <stop offset="0" stopColor="#0e7490" />
                          <stop offset="1" stopColor="#2563eb" />
                        </linearGradient>
                      </defs>
                    </Download>
                    <span>{t.exportJson}</span>
                  </a>
                  {/* Deleting keeps Nova's results; it can be undone. */}
                  <button
                    className="material-action material-delete"
                    disabled={busy}
                    aria-label={`${s.deletedAt ? t.restore : t.delete}: ${s.title}`}
                    onClick={() => setDeleted(s, !s.deletedAt)}
                  >
                    {s.deletedAt ? (
                      <RotateCcw size={16} aria-hidden="true" />
                    ) : (
                      <Trash2 size={16} aria-hidden="true" />
                    )}
                    {s.deletedAt ? t.restore : t.delete}
                  </button>
                  {s.deletedAt && (
                    <button
                      className="material-action material-remove"
                      disabled={busy}
                      aria-label={`${t.deleteForever}: ${s.title}`}
                      onClick={() => removeForever(s)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {t.deleteForever}
                    </button>
                  )}
                </li>
              );
            };
            return (
              <div className="manage">
                <div className="materials-heading">
                  <h1>{t.materials}</h1>
                  <div className="heading-actions">
                    <button
                      className="button secondary"
                      onClick={() => navigate('catalog')}
                    >
                      <Tags size={18} aria-hidden="true" />
                      {t.catalogTitle}
                    </button>
                    <button
                      className="button primary"
                      onClick={() => navigate('manage')}
                    >
                      <Plus size={18} aria-hidden="true" />
                      {t.manage}
                    </button>
                  </div>
                </div>
                <div className="materials">
                  <nav
                    className="paper subject-list"
                    aria-label={t.subjectsTitle}
                  >
                    <h2>{t.subjectsTitle}</h2>
                    <ul>
                      {catalog.subjects
                        .map((s) => ({
                          ...s,
                          label: subjectLabel(s.name, lang),
                        }))
                        // By name, as the page's language shows it.
                        .sort((a, b) => a.label.localeCompare(b.label, lang))
                        .map((s) => (
                          <li key={s.id}>
                            <button
                              className="subject-row"
                              aria-current={s.id === materialSubject}
                              onClick={() => {
                                setMaterialSubject(s.id);
                                setAllMaterials(false);
                                setMaterialId('');
                              }}
                            >
                              <SubjectPlanet name={s.name} />
                              <span>
                                {s.label}
                                <span className="detail">{s.group}</span>
                              </span>
                              <span className="count-small">
                                {
                                  sets.filter(
                                    (x) => x.subject === s.name && !x.deletedAt,
                                  ).length
                                }
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </nav>
                  <section className="paper material-pane">
                    {!chosen ? (
                      <p className="muted">{t.chooseSubjectFirst}</p>
                    ) : !material ? (
                      <>
                        <h2>{subjectLabel(chosen.name, lang)}</h2>
                        {!active.length && (
                          <p className="muted">{t.noMaterials}</p>
                        )}
                        <ul className="material-list">{listed.map(row)}</ul>
                        {active.length > 4 && (
                          <button
                            className="text-button more-materials"
                            aria-expanded={allMaterials}
                            onClick={() => setAllMaterials(!allMaterials)}
                          >
                            {allMaterials
                              ? t.showFewer
                              : `${t.showAll} (${active.length})`}
                            <ChevronDown
                              className="chevron"
                              size={16}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                        <CardLayoutEditor
                          key={chosen.id}
                          subjectId={chosen.id}
                          saved={chosen}
                          t={t}
                          onSaved={load}
                        />
                        {deleted.length > 0 && (
                          <details className="details-editor deleted-materials">
                            <summary>
                              {t.deletedMaterials}
                              <span className="count-small">
                                {deleted.length}
                              </span>
                            </summary>
                            <ul className="material-list">
                              {deleted.map(row)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="back"
                          onClick={() => setMaterialId('')}
                        >
                          <ArrowLeft size={16} />
                          {subjectLabel(chosen.name, lang)}
                        </button>
                        <h2>{material.title}</h2>
                        <DetailsEditor
                          key={material.id}
                          set={material}
                          sets={materials}
                          groups={catalog.groups.map((g) => g.name)}
                          t={t}
                          onSaved={load}
                        />
                        <div className="tabs" role="tablist">
                          {(
                            [
                              [
                                'questions',
                                t.factQuestions,
                                material.questions.length,
                              ],
                              ['results', t.resultsTab, results.length],
                            ] as const
                          ).map(([tab, label, count]) => (
                            <button
                              key={tab}
                              role="tab"
                              aria-selected={materialTab === tab}
                              onClick={() => setMaterialTab(tab)}
                            >
                              {label}
                              <span className="count-small">{count}</span>
                            </button>
                          ))}
                        </div>
                        {materialTab === 'questions' ? (
                          <SetQuestions
                            set={material}
                            attempts={results}
                            lang={lang}
                            order={orderOf(material.subject)}
                          />
                        ) : results.length ? (
                          <SetResults
                            set={material}
                            attempts={results}
                            lang={lang}
                          />
                        ) : (
                          <p className="muted">{t.noResults}</p>
                        )}
                      </>
                    )}
                  </section>
                </div>
              </div>
            );
          })()}
        {view === 'catalog' && (
          <div className="manage">
            <button className="back" onClick={() => navigate('materials')}>
              <ArrowLeft size={16} />
              {t.materials}
            </button>
            <h1>{t.catalogTitle}</h1>
            <p className="page-intro">{t.catalogText}</p>
            <CatalogEditor catalog={catalog} t={t} onChanged={load} />
          </div>
        )}
        {view === 'manage' && (
          <div className="manage">
            <button className="back" onClick={() => navigate('materials')}>
              <ArrowLeft size={16} />
              {t.materials}
            </button>
            <h1>{t.importTitle}</h1>
            <p className="page-intro">{t.importText}</p>
            <section className="paper import">
              <h2>{t.addTests}</h2>
              <div className="catalog-row">
                <Dropdown
                  label={t.factGroup}
                  placeholder={t.chooseGroup}
                  value={importGroup}
                  options={catalog.groups.map((g) => ({
                    value: g.id,
                    label: g.name,
                  }))}
                  onChange={(value) => {
                    setImportGroup(value);
                    setImportSubject('');
                    setSaved(false);
                  }}
                />
                <Dropdown
                  label={t.factSubject}
                  placeholder={t.chooseSubject}
                  value={importSubject}
                  disabled={!groupSubjects.length}
                  options={groupSubjects.map((s) => ({
                    value: s.id,
                    label: subjectLabel(s.name, lang),
                  }))}
                  onChange={(value) => {
                    setImportSubject(value);
                    setSaved(false);
                  }}
                />
              </div>
              {importGroup && !groupSubjects.length && (
                <p className="form-error">
                  {t.noSubjectsInGroup}{' '}
                  <button
                    className="text-button"
                    onClick={() => navigate('catalog')}
                  >
                    {t.manageCatalog}
                  </button>
                </p>
              )}
              {!subjectName ? (
                <p className="muted">
                  {t.chooseGroupSubject}{' '}
                  <button
                    className="text-button"
                    onClick={() => navigate('catalog')}
                  >
                    {t.manageCatalog}
                  </button>
                </p>
              ) : (
                <>
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
                              setOrigin({
                                source: 'json',
                                fileName: file.name,
                              });
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
                              setError(
                                `${t.docxError} ${payload?.error ?? ''}`,
                              );
                            else {
                              setJson(JSON.stringify(payload, null, 2));
                              setOrigin({
                                source: 'word',
                                fileName: file.name,
                              });
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
                        a.download = 'nova-example.json';
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
                        <Dropdown
                          className="split"
                          label={t.splitLabel}
                          value={String(partSize)}
                          options={[
                            { value: '0', label: t.noSplit },
                            ...partSizes
                              .filter((n) => n < longest)
                              .map((n) => ({
                                value: String(n),
                                label: `${n} ${t.perPart}`,
                              })),
                          ]}
                          onChange={(value) => setPartSize(Number(value))}
                        />
                      )}
                      <p>{t.checkImport}</p>
                      <ul>
                        {preview.map((p, i) => (
                          <li key={i}>
                            <strong>{p.title}</strong>
                            <span>
                              {subjectLabel(subjectName, lang)} · {groupName}
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
                      // The chosen group and subject replace any in the file.
                      const upload = preview.map((p) => ({
                        ...p,
                        ...origin,
                        subject: subjectName,
                        group: groupName,
                      }));
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
                </>
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
                        : s.source === 'manual'
                          ? t.sourceManual
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
          </div>
        )}
      </main>
      {resultsOf && (
        <ResultsViewer
          set={resultsOf}
          attempts={attempts.filter((a) => a.setId === resultsOf.id)}
          lang={lang}
          onClose={() => setResultsOf(null)}
        />
      )}
      {editing && (
        <DetailsDialog
          set={editing}
          sets={sets.filter((x) => x.subject === editing.subject)}
          groups={catalog.groups.map((g) => g.name)}
          lang={lang}
          onSaved={load}
          onClose={() => setEditing(null)}
        />
      )}
      <footer>
        <div className="brand small">
          <Sparkle size={20} fill="currentColor" aria-hidden="true" /> nova.
        </div>
        <span>{t.tagline}</span>
        <span>NL · TR · EN</span>
      </footer>
    </div>
  );
}
// The parent's look at a whole set: every question with the right answer
// marked, and how often Nova answered it wrong. Esc or the backdrop closes it.
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
        <SetQuestions set={set} attempts={attempts} lang={lang} />
      </div>
    </dialog>
  );
}
// Every finished practice of one set, newest first, each opening to its
// answers. Esc or the backdrop closes it.
function ResultsViewer({
  set,
  attempts,
  lang,
  onClose,
}: {
  set: StudySet | PublicSet;
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
      className="set-viewer results-viewer"
      aria-labelledby="results-viewer-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <div className="set-viewer-inner">
        <header>
          <div>
            <span className="eyebrow">{t.previousResults}</span>
            <h2 id="results-viewer-title">{set.title}</h2>
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
        <SetResults set={set} attempts={attempts} lang={lang} />
      </div>
    </dialog>
  );
}
// A set's questions with the right answer marked, and how often Nova
// answered each one wrong.
// Opens the material document: a PDF in a new tab, a Word file downloads.
function MaterialDocLink({ doc, lang }: { doc: MaterialDoc; lang: Language }) {
  const kind = (doc.fileName ?? doc.url).match(/\.(pdf|docx?)$/i)?.[1];
  return (
    <a
      className="material-doc"
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <FileText size={22} aria-hidden="true" />
      <span>
        <strong>{words[lang].materialDoc}</strong>
        <small>{doc.fileName ?? (kind ? kind.toUpperCase() : doc.url)}</small>
      </span>
    </a>
  );
}

function SetQuestions({
  set,
  attempts,
  lang,
  order,
}: {
  set: StudySet;
  attempts: Attempt[];
  lang: Language;
  order?: FactKey[];
}) {
  const t = words[lang];
  return (
    <>
      {set.description && <p>{set.description}</p>}
      <SetFacts set={set} lang={lang} order={order} />
      {set.materialDoc && <MaterialDocLink doc={set.materialDoc} lang={lang} />}
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
              <h3 className="prompt">{q.prompt}</h3>
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
              {q.explanation && <p className="explanation">{q.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
// Which practices the results list shows, by their share of right answers.
type ScoreFilter = 'all' | 'perfect' | 'none' | 'below70' | 'below50';
const scoreFilters: Record<ScoreFilter, (a: Attempt) => boolean> = {
  all: () => true,
  perfect: (a) => a.correct === a.total,
  none: (a) => a.correct === 0,
  below70: (a) => a.correct < a.total * 0.7,
  below50: (a) => a.correct < a.total * 0.5,
};
// Every finished practice of one set, newest first, narrowed by score; each
// opens to its answers with its own answer filters.
function SetResults({
  set,
  attempts,
  lang,
}: {
  set: StudySet | PublicSet;
  attempts: Attempt[];
  lang: Language;
}) {
  const t = words[lang];
  const [filter, setFilter] = useState<ScoreFilter>('all');
  const options: [ScoreFilter, string][] = [
    ['all', t.filterAll],
    ['perfect', t.scorePerfect],
    ['none', t.scoreNone],
    ['below70', t.scoreBelow70],
    ['below50', t.scoreBelow50],
  ];
  const shown = attempts.filter(scoreFilters[filter]);
  return (
    <>
      <fieldset className="result-filters">
        <legend>{t.showResults}</legend>
        {options.map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name={`score-filter-${set.id}`}
              value={value}
              checked={filter === value}
              onChange={() => setFilter(value)}
            />
            {label}
            <span className="count">
              {attempts.filter(scoreFilters[value]).length}
            </span>
          </label>
        ))}
      </fieldset>
      {!shown.length && <p className="muted">{t.noResultsInFilter}</p>}
      {shown.map((a) => (
        <details className="attempt" key={a.id}>
          <summary>
            <span className="attempt-icon">
              <BookOpen size={20} />
            </span>
            <span>
              <strong>
                {new Date(a.createdAt).toLocaleString(lang, {
                  timeZone: 'Europe/Amsterdam',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </strong>
            </span>
            <span className="attempt-score">
              {a.correct}/{a.total}
            </span>
          </summary>
          <FilteredReview attempt={a} lang={lang} questions={set.questions} />
        </details>
      ))}
    </>
  );
}
// The parent's form for a card's details, opened from the card itself. It
// closes once saved; Esc or the close button closes it unsaved.
function DetailsDialog({
  set,
  sets,
  groups,
  lang,
  onSaved,
  onClose,
}: {
  set: StudySet;
  sets: (StudySet | PublicSet)[];
  groups: string[];
  lang: Language;
  onSaved: () => Promise<void> | void;
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
      className="set-viewer edit-details"
      aria-labelledby="edit-details-title"
      onClose={onClose}
    >
      <div className="set-viewer-inner">
        <header>
          <div>
            <span className="eyebrow">{t.editDetails}</span>
            <h2 id="edit-details-title">{set.title}</h2>
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
        <DetailsEditor
          inline
          set={set}
          sets={sets}
          groups={groups}
          t={t}
          onSaved={async () => {
            await onSaved();
            dialog.current?.close();
          }}
        />
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
// A card's description, cut to two lines with a link to show the rest.
function CardDescription({ text, lang }: { text: string; lang: Language }) {
  const t = words[lang];
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const p = ref.current;
    if (!p || open) return;
    const measure = () => setLong(p.scrollHeight > p.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(p);
    return () => observer.disconnect();
  }, [text, open]);
  return (
    <div className="card-description">
      <p ref={ref} className={open ? undefined : 'clamped'}>
        {text}
        {/* Open, the link follows the last word; closed, it covers the end of
            the second line. */}
        {long && open && (
          <>
            {' '}
            <button
              type="button"
              className="more-link"
              aria-expanded
              onClick={() => setOpen(false)}
            >
              {t.showLess}
            </button>
          </>
        )}
      </p>
      {long && !open && (
        <button
          type="button"
          className="more-link at-end"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {t.showMore}
        </button>
      )}
    </div>
  );
}
// Facts about a set for its card, in the subject's order. Older sets have no
// lesson or group fields, so those are looked for in the title and
// description. A theme or test style shows only when the set has one.
function SetFacts({
  set,
  lang,
  order = factOrder(),
  shown,
}: {
  set: StudySet | PublicSet;
  lang: Language;
  order?: FactKey[];
  // How many details show before a "more details" link; all when left out.
  shown?: number;
}) {
  const t = words[lang];
  const [open, setOpen] = useState(false);
  const labels = factLabels(t);
  const counts = set.questions.map((q) => q.options.length);
  const [low, high] = [Math.min(...counts), Math.max(...counts)];
  const text = `${set.title} ${set.description}`;
  const values: Record<FactKey, string | number | null> = {
    group: set.group ?? groupIn(text) ?? '—',
    theme: set.theme ?? null,
    lesson: set.lesson ?? lessonIn(text) ?? '—',
    testStyle: set.testStyle ? styleLabels[set.testStyle](t) : null,
    questions: set.questions.length,
    options: low === high ? low : `${low}–${high}`,
    subject: subjectLabel(set.subject, lang),
    // Sets from before test types existed all have one correct answer.
    testType: typeLabels[set.testType ?? 'single-choice'](t),
    difficulty: set.difficulty ? difficultyLabels[set.difficulty](t) : '—',
    // The author's date is a calendar day; the import time is a moment.
    added: set.addedDate
      ? new Date(`${set.addedDate}T12:00:00Z`).toLocaleDateString(lang, {
          timeZone: 'UTC',
          dateStyle: 'medium',
        })
      : new Date(set.createdAt).toLocaleDateString(lang, {
          timeZone: 'Europe/Amsterdam',
          dateStyle: 'medium',
        }),
  };
  const facts = order
    .filter((key) => values[key] !== null)
    .map((key) => [labels[key], values[key]] as const);
  const hidden = shown !== undefined && facts.length > shown;
  return (
    <dl className="set-facts">
      {(hidden && !open ? facts.slice(0, shown) : facts).map(
        ([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ),
      )}
      {hidden && (
        <div className="more-facts">
          <button
            type="button"
            className="more-link"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t.fewerDetails : t.moreDetails}
          </button>
        </div>
      )}
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
  return (
    <section className="result-summary paper">
      <ScoreChart answers={attempt.answers} lang={lang} />
      <ResultFilters
        answers={attempt.answers}
        lang={lang}
        filter={filter}
        onFilter={onFilter}
      />
    </section>
  );
}
// A ring of correct, wrong and unanswered answers with a legend beside it.
function ScoreChart({
  answers,
  lang,
  legend,
}: {
  answers: Attempt['answers'];
  lang: Language;
  // Shown beside the ring in place of the usual legend.
  legend?: React.ReactNode;
}) {
  const t = words[lang];
  const total = answers.length;
  const parts = [
    {
      key: 'correct',
      label: t.correct,
      n: answers.filter((a) => a.correct).length,
    },
    {
      key: 'wrong',
      label: t.wrong,
      n: answers.filter(resultFilters.wrong).length,
    },
    {
      key: 'skipped',
      label: t.unanswered,
      n: answers.filter((a) => a.option === null).length,
    },
  ] as const;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const shown = parts.filter((p) => p.n);
  // A 2px gap between segments, none when one segment fills the ring.
  const gap = shown.length > 1 ? 2 : 0;
  let at = 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
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
      {legend ?? (
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
      )}
    </div>
  );
}
// Buttons that pick which answers are listed, each with how many it shows.
function ResultFilters({
  answers,
  lang,
  filter,
  onFilter,
  name = 'result-filter',
}: {
  answers: Attempt['answers'];
  lang: Language;
  filter: ResultFilter;
  onFilter: (f: ResultFilter) => void;
  name?: string;
}) {
  const t = words[lang];
  const options: [ResultFilter, string][] = [
    ['all', t.filterAll],
    ['wrong', t.wrong],
    ['correct', t.correct],
    ['unanswered', t.unanswered],
    ['unsure', t.filterUnsure],
    ['not_understood', t.filterNotUnderstood],
    ['odd_options', t.odd_options],
  ];
  return (
    <fieldset className="result-filters">
      <legend>{t.showAnswers}</legend>
      {options.map(([value, label]) => (
        <label key={value}>
          <input
            type="radio"
            name={name}
            value={value}
            checked={filter === value}
            onChange={() => onFilter(value)}
          />
          {label}
          <span className="count">
            {answers.filter(resultFilters[value]).length}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
type ShownQuestion = PublicSet['questions'][number];
// A question as it was asked: its picture and every option, with the right
// one and the chosen one marked. The set may have changed since; then only
// the chosen and right answers are named.
function QuestionDetail({
  question,
  prompt,
  chosen,
  chosenText,
  chosenLabel,
  correctAnswer,
  lang,
}: {
  question?: ShownQuestion;
  prompt: string;
  chosen: number | null;
  chosenText: string | null;
  chosenLabel: string;
  correctAnswer: string;
  lang: Language;
}) {
  const t = words[lang];
  const q = question?.prompt === prompt ? question : undefined;
  return (
    <>
      {question?.image && (
        <img
          className="question-image"
          src={question.image}
          alt={t.questionImage}
        />
      )}
      {q ? (
        <>
          <ul className="set-viewer-options">
            {q.options.map((o, j) => {
              const right = o === correctAnswer;
              const picked = j === chosen;
              return (
                <li key={j} className={right ? 'right' : picked ? 'wrong' : ''}>
                  <span className="option-letter">{'ABCDEF'[j]}</span>
                  {q.optionImages?.[j] && (
                    <img
                      className="option-image"
                      src={q.optionImages[j]!}
                      alt=""
                    />
                  )}
                  <span>{o}</span>
                  {picked && (
                    <small className="option-tag">{chosenLabel}</small>
                  )}
                  {right ? (
                    <Check size={18} aria-label={t.rightAnswer} />
                  ) : picked ? (
                    <X size={18} aria-label={t.wrong} />
                  ) : null}
                </li>
              );
            })}
          </ul>
          {chosen === null && (
            <p>
              {chosenLabel}: <strong>{t.skipped}</strong>
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            {chosenLabel}: <strong>{chosenText ?? t.skipped}</strong>
          </p>
          {chosenText !== correctAnswer && (
            <p>
              {t.rightAnswer}: <strong>{correctAnswer}</strong>
            </p>
          )}
        </>
      )}
    </>
  );
}
// One practice's answers with its own filter buttons above them.
function FilteredReview({
  attempt,
  lang,
  questions,
  initialFilter = 'all',
}: {
  attempt: Attempt;
  lang: Language;
  questions?: (ShownQuestion | undefined)[];
  initialFilter?: ResultFilter;
}) {
  const [filter, setFilter] = useState<ResultFilter>(initialFilter);
  return (
    <>
      <ResultFilters
        answers={attempt.answers}
        lang={lang}
        filter={filter}
        onFilter={setFilter}
        name={`result-filter-${attempt.id}`}
      />
      <Review
        attempt={attempt}
        lang={lang}
        questions={questions}
        show={resultFilters[filter]}
      />
    </>
  );
}
function Review({
  attempt,
  lang,
  questions = [],
  show = () => true,
}: {
  attempt: Attempt;
  lang: Language;
  questions?: (ShownQuestion | undefined)[];
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
              {(a.confidence !== 'sure' || a.oddOptions) && (
                <span className="confidence-label">
                  {[
                    a.confidence !== 'sure' && t[a.confidence],
                    a.oddOptions && t.odd_options,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
            <h3 className="prompt">
              {i + 1}. {a.prompt}
            </h3>
            <QuestionDetail
              question={questions[i]}
              prompt={a.prompt}
              chosen={a.option}
              chosenText={a.selected}
              chosenLabel={t.yourAnswer}
              correctAnswer={a.correctAnswer}
              lang={lang}
            />
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
