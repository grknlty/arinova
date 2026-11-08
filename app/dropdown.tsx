'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type Choice = { value: string; label: string };

// A select whose list opens below the button, or above it when there is no
// room below in the window. Arrow keys, Enter and Escape work as in a select.
export function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function show() {
    const r = button.current!.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const needed = Math.min(options.length * 40 + 16, 300);
    setUp(below < needed && r.top > below);
    setActive(chosen);
    setOpen(true);
  }
  function pick(i: number) {
    onChange(options[i].value);
    setOpen(false);
    button.current?.focus();
  }

  // A press anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="field dropdown" ref={box}>
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
          if (step) {
            e.preventDefault();
            if (!open) return show();
            setActive((i) =>
              Math.min(options.length - 1, Math.max(0, i + step)),
            );
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (open) pick(active);
            else show();
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        <span>{options[chosen]?.label}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`dropdown-list${up ? ' up' : ''}`}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === chosen}
              className={i === active ? 'active' : ''}
              // Keeps focus on the button, so it does not blur and close.
              onPointerDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="dropdown-check">
                {i === chosen && <Check size={16} aria-hidden="true" />}
              </span>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
