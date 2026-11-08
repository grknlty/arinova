'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import type { words } from '@/lib/i18n';
import { factKeys, factOrder, type FactKey } from '@/lib/facts';

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

// The parent sets the order of the details on one subject's material cards,
// moving each up or down; saving the default order clears the setting.
export function FactOrderEditor({
  subjectId,
  saved,
  t,
  onSaved,
}: {
  subjectId: string;
  saved?: FactKey[];
  t: Words;
  onSaved: () => Promise<void> | void;
}) {
  const [order, setOrder] = useState(() => factOrder(saved));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ ok: true, message: '' });
  const labels = factLabels(t);
  const move = (from: number, to: number) => {
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    setStatus({ ok: true, message: '' });
  };
  const isDefault = order.every((k, i) => k === factKeys[i]);
  async function save() {
    setBusy(true);
    try {
      const r = await fetch('/api/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'subject',
          id: subjectId,
          factOrder: isDefault ? [] : order,
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
  return (
    <details className="details-editor fact-order">
      <summary>{t.factOrderTitle}</summary>
      <div className="fact-order-body">
        <p className="muted">{t.factOrderText}</p>
        <ol>
          {order.map((key, i) => (
            <li key={key}>
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
              setOrder([...factKeys]);
              setStatus({ ok: true, message: '' });
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
