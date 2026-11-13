'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import type { words } from '@/lib/i18n';
import {
  buttonKeys,
  buttonOrder,
  defaultButtonsPerRow,
  defaultFactCount,
  defaultMaxMistakes,
  defaultMinPercent,
  defaultStars,
  factKeys,
  factOrder,
  type ButtonKey,
  type CardLayout,
  type FactKey,
} from '@/lib/facts';

type Words = (typeof words)['nl'];

export const factLabels = (t: Words): Record<FactKey, string> => ({
  group: t.factGroup,
  theme: t.factTheme,
  lesson: t.factLesson,
  testStyle: t.factStyle,
  questions: t.factQuestions,
  options: t.factOptions,
  subject: t.factSubject,
  testType: t.factType,
  difficulty: t.factDifficulty,
  added: t.factAdded,
});

const buttonLabels = (t: Words): Record<ButtonKey, string> => ({
  study: t.study,
  results: t.previousResults,
  startOver: t.startOver,
  practice: `${t.practice} / ${t.resume}`,
});

// A number typed into a field, kept as typed so the field can be cleared to
// type another; outside min to max, or empty, it counts as the default.
function useNumber(
  saved: number | undefined,
  fallback: number,
  max: number,
  min = 1,
) {
  const [text, setText] = useState(String(saved ?? fallback));
  const typed = Math.round(Number(text));
  const value =
    text.trim() !== '' && typed >= min && typed <= max ? typed : fallback;
  return {
    text,
    setText,
    value,
    min,
    max,
    reset: () => setText(String(fallback)),
  };
}

// Items moved up or down one place at a time. With cutAt, the items from
// there on are marked with cutLabel (details waiting behind "more").
function OrderList<K extends string>({
  order,
  labels,
  t,
  cutAt,
  cutLabel,
  onChange,
}: {
  order: K[];
  labels: Record<K, string>;
  t: Words;
  cutAt?: number;
  cutLabel?: string;
  onChange: (order: K[]) => void;
}) {
  const move = (from: number, to: number) => {
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };
  return (
    <ol>
      {order.map((key, i) => (
        <li
          key={key}
          className={cutAt !== undefined && i >= cutAt ? 'behind-more' : ''}
          data-more={i === cutAt ? cutLabel : undefined}
        >
          <span>{labels[key]}</span>
          <button
            type="button"
            className="small-icon"
            aria-label={`${t.moveUp}: ${labels[key]}`}
            title={t.moveUp}
            disabled={i === 0}
            onClick={() => move(i, i - 1)}
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="small-icon"
            aria-label={`${t.moveDown}: ${labels[key]}`}
            title={t.moveDown}
            disabled={i === order.length - 1}
            onClick={() => move(i, i + 1)}
          >
            <ArrowDown size={15} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}

// The parent sets one subject's material cards: the order of the details
// and how many show before "more", and the order of the buttons and how
// many stand side by side. Saving the defaults clears the setting.
export function CardLayoutEditor({
  subjectId,
  saved,
  t,
  onSaved,
}: {
  subjectId: string;
  saved: CardLayout;
  t: Words;
  onSaved: () => Promise<void> | void;
}) {
  const [facts, setFacts] = useState(() => factOrder(saved.factOrder));
  const [buttons, setButtons] = useState(() => buttonOrder(saved.buttonOrder));
  const factCount = useNumber(
    saved.factCount,
    defaultFactCount,
    factKeys.length,
  );
  const perRow = useNumber(
    saved.buttonsPerRow,
    defaultButtonsPerRow,
    buttonKeys.length,
  );
  const maxMistakes = useNumber(
    saved.resultMaxMistakes,
    defaultMaxMistakes,
    999,
    0,
  );
  const minPercent = useNumber(
    saved.resultMinPercent,
    defaultMinPercent,
    100,
    0,
  );
  const stars = {
    goldMaxMistakes: useNumber(
      saved.goldMaxMistakes,
      defaultStars.goldMaxMistakes,
      999,
      0,
    ),
    goldMinPercent: useNumber(
      saved.goldMinPercent,
      defaultStars.goldMinPercent,
      100,
      0,
    ),
    silverMaxMistakes: useNumber(
      saved.silverMaxMistakes,
      defaultStars.silverMaxMistakes,
      999,
      0,
    ),
    silverMinPercent: useNumber(
      saved.silverMinPercent,
      defaultStars.silverMinPercent,
      100,
      0,
    ),
  };
  const starKeys = Object.keys(defaultStars) as (keyof typeof defaultStars)[];
  // Each star limit, or null when it is the default.
  const starValues = Object.fromEntries(
    starKeys.map((k) => [
      k,
      stars[k].value === defaultStars[k] ? null : stars[k].value,
    ]),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ ok: true, message: '' });
  const changed = () => setStatus({ ok: true, message: '' });
  const defaultFacts = facts.every((k, i) => k === factKeys[i]);
  const defaultButtons = buttons.every((k, i) => k === buttonKeys[i]);
  const isDefault =
    defaultFacts &&
    defaultButtons &&
    factCount.value === defaultFactCount &&
    perRow.value === defaultButtonsPerRow &&
    maxMistakes.value === defaultMaxMistakes &&
    minPercent.value === defaultMinPercent &&
    starKeys.every((k) => starValues[k] === null);
  async function save() {
    setBusy(true);
    try {
      const r = await fetch('/api/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'subject',
          id: subjectId,
          layout: true,
          factOrder: defaultFacts ? [] : facts,
          factCount:
            factCount.value === defaultFactCount ? null : factCount.value,
          buttonOrder: defaultButtons ? [] : buttons,
          buttonsPerRow:
            perRow.value === defaultButtonsPerRow ? null : perRow.value,
          resultMaxMistakes:
            maxMistakes.value === defaultMaxMistakes ? null : maxMistakes.value,
          resultMinPercent:
            minPercent.value === defaultMinPercent ? null : minPercent.value,
          ...starValues,
        }),
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
  const number = (label: string, field: ReturnType<typeof useNumber>) => (
    <label className="field fact-count">
      {label}
      <input
        type="number"
        min={field.min}
        max={field.max}
        value={field.text}
        onChange={(e) => {
          field.setText(e.target.value);
          changed();
        }}
        onBlur={() => field.setText(String(field.value))}
      />
    </label>
  );
  return (
    <details className="details-editor fact-order">
      <summary>{t.cardLayoutTitle}</summary>
      <div className="fact-order-body">
        <div className="card-layout">
          <section>
            <h3>{t.cardDetails}</h3>
            <p className="muted">{t.factOrderText}</p>
            {number(t.factCountLabel, factCount)}
            <OrderList
              order={facts}
              labels={factLabels(t)}
              t={t}
              cutAt={factCount.value}
              cutLabel={t.behindMore}
              onChange={(order) => {
                setFacts(order);
                changed();
              }}
            />
          </section>
          <section>
            <h3>{t.cardButtons}</h3>
            <p className="muted">{t.buttonOrderText}</p>
            {number(t.buttonsPerRowLabel, perRow)}
            <OrderList
              order={buttons}
              labels={buttonLabels(t)}
              t={t}
              onChange={(order) => {
                setButtons(order);
                changed();
              }}
            />
            <h3>{t.resultColours}</h3>
            <p className="muted">{t.resultColoursText}</p>
            <div className="result-thresholds">
              {number(t.resultMaxMistakesLabel, maxMistakes)}
              {number(t.resultMinPercentLabel, minPercent)}
            </div>
            <h3>{t.starsTitle}</h3>
            <p className="muted">{t.starsText}</p>
            <div className="result-thresholds">
              {number(t.goldMaxMistakesLabel, stars.goldMaxMistakes)}
              {number(t.goldMinPercentLabel, stars.goldMinPercent)}
              {number(t.silverMaxMistakesLabel, stars.silverMaxMistakes)}
              {number(t.silverMinPercentLabel, stars.silverMinPercent)}
            </div>
          </section>
        </div>
        <div className="details-actions">
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={save}
          >
            {t.saveDetails}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || isDefault}
            onClick={() => {
              setFacts([...factKeys]);
              setButtons([...buttonKeys]);
              factCount.reset();
              perRow.reset();
              maxMistakes.reset();
              minPercent.reset();
              starKeys.forEach((k) => stars[k].reset());
              changed();
            }}
          >
            {t.resetOrder}
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
      </div>
    </details>
  );
}
