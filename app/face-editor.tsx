'use client';
import { useRef, useState } from 'react';
import { Camera, Check, RotateCcw, X } from 'lucide-react';
import type { Faces, Friend } from '@/lib/faces';
import type { words } from '@/lib/i18n';

const friends: { id: Friend; name: string }[] = [
  { id: 'arin', name: 'Nova' },
  { id: 'neco', name: 'Neco' },
  { id: 'mia', name: 'Mia' },
  { id: 'piso', name: 'Piso' },
];
// The crop window on screen, and the saved face size, in pixels.
const view = 240;
const output = 256;

type Editing = {
  id: Friend;
  image: HTMLImageElement;
  zoom: number;
  x: number;
  y: number;
};

// Where the image's top-left corner sits in the crop window, kept so the
// photo always covers the whole circle.
function place(e: Editing) {
  const scale = (view / Math.min(e.image.width, e.image.height)) * e.zoom;
  const w = e.image.width * scale;
  const h = e.image.height * scale;
  const clamp = (v: number, size: number) =>
    Math.min(0, Math.max(view - size, v));
  return {
    scale,
    w,
    h,
    left: clamp(view / 2 - w / 2 + e.x, w),
    top: clamp(view / 2 - h / 2 + e.y, h),
  };
}

export function FaceEditor({
  faces,
  t,
  onSave,
}: {
  faces: Faces;
  t: (typeof words)['nl'];
  onSave: (id: Friend, image: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  function choose(id: Friend, file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setEditing({ id, image, zoom: 1.6, x: 0, y: 0 });
    image.src = url;
  }

  async function save() {
    if (!editing) return;
    const { scale, left, top } = place(editing);
    const canvas = document.createElement('canvas');
    canvas.width = output;
    canvas.height = output;
    canvas
      .getContext('2d')!
      .drawImage(
        editing.image,
        -left / scale,
        -top / scale,
        view / scale,
        view / scale,
        0,
        0,
        output,
        output,
      );
    setBusy(true);
    try {
      await onSave(editing.id, canvas.toDataURL('image/jpeg', 0.86));
      URL.revokeObjectURL(editing.image.src);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  const spot = editing && place(editing);
  return (
    <section className="paper friends">
      <h2>{t.friends}</h2>
      <p className="page-intro">{t.friendsText}</p>
      <div className="friend-grid">
        {friends.map(({ id, name }) => (
          <div className="friend" key={id}>
            <span className={`friend-face ${faces[id] ? '' : 'empty-face'}`}>
              {faces[id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faces[id]} alt="" />
              ) : (
                <Camera aria-hidden="true" />
              )}
            </span>
            <strong>{name}</strong>
            <label className="button secondary">
              <Camera size={18} aria-hidden="true" />
              {t.choosePhoto}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  choose(id, e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {faces[id] && (
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSave(id, null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                {t.useDrawing}
              </button>
            )}
          </div>
        ))}
      </div>
      {editing && spot && (
        <div className="cropper-panel">
          <strong>{friends.find((f) => f.id === editing.id)?.name}</strong>
          <div
            className="cropper"
            style={{ width: view, height: view }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const dx = e.clientX - drag.current.x;
              const dy = e.clientY - drag.current.y;
              drag.current = { x: e.clientX, y: e.clientY };
              setEditing((s) => {
                if (!s) return s;
                // Store the clamped position so dragging back is immediate.
                const p = place({ ...s, x: s.x + dx, y: s.y + dy });
                return {
                  ...s,
                  x: p.left - (view / 2 - p.w / 2),
                  y: p.top - (view / 2 - p.h / 2),
                };
              });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={editing.image.src}
              alt=""
              draggable={false}
              style={{
                width: spot.w,
                height: spot.h,
                transform: `translate(${spot.left}px, ${spot.top}px)`,
              }}
            />
            <span className="crop-mask" aria-hidden="true" />
          </div>
          <p className="small">{t.dragHint}</p>
          <label className="zoom">
            {t.zoom}
            <input
              type="range"
              min="1"
              max="5"
              step="0.05"
              value={editing.zoom}
              onChange={(e) =>
                setEditing((s) => s && { ...s, zoom: Number(e.target.value) })
              }
            />
          </label>
          <div className="cropper-actions">
            <button
              className="button secondary"
              onClick={() => {
                URL.revokeObjectURL(editing.image.src);
                setEditing(null);
              }}
            >
              <X size={18} aria-hidden="true" />
              {t.cancel}
            </button>
            <button className="button primary" disabled={busy} onClick={save}>
              <Check size={18} aria-hidden="true" />
              {t.saveFace}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
