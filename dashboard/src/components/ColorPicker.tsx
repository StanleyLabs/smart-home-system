import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

type ColorPickerProps = {
  hue: number;
  saturation: number;
  onColorChange: (hue: number, saturation: number) => void;
  onClose: () => void;
};

type SavedPreset = {
  preset_id: string;
  name: string;
  hue: number;
  saturation: number;
  sort_order: number;
  created_at: string;
};

const DEFAULT_PRESETS: { name: string; hue: number; saturation: number }[] = [
  { name: 'Red', hue: 0, saturation: 100 },
  { name: 'Orange', hue: 30, saturation: 100 },
  { name: 'Yellow', hue: 55, saturation: 100 },
  { name: 'Green', hue: 120, saturation: 100 },
  { name: 'Teal', hue: 170, saturation: 100 },
  { name: 'Blue', hue: 220, saturation: 100 },
  { name: 'Purple', hue: 270, saturation: 100 },
  { name: 'Pink', hue: 330, saturation: 85 },
  { name: 'Warm White', hue: 35, saturation: 25 },
  { name: 'Cool White', hue: 210, saturation: 15 },
  { name: 'Daylight', hue: 50, saturation: 8 },
  { name: 'Lavender', hue: 260, saturation: 40 },
];

/** Convert hue (0-360) + saturation (0-100) to a CSS color string (assumes V=100%). */
export function hsToCss(h: number, s: number): string {
  const sv = s / 100;
  const l = 1 - sv / 2;
  const sl = l === 0 || l === 1 ? 0 : (1 - l) / Math.min(l, 1 - l);
  return `hsl(${h}, ${Math.round(sl * 100)}%, ${Math.round(l * 100)}%)`;
}

const WHEEL_SIZE = 180;

export function ColorPicker({
  hue,
  saturation,
  onColorChange,
  onClose,
}: ColorPickerProps) {
  const [localHue, setLocalHue] = useState(hue);
  const [localSat, setLocalSat] = useState(saturation);
  const [customs, setCustoms] = useState<SavedPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    api.get<SavedPreset[]>('/color-presets').then(setCustoms).catch(() => {});
  }, []);

  useEffect(() => {
    if (!dragging.current) {
      setLocalHue(hue);
      setLocalSat(saturation);
    }
  }, [hue, saturation]);

  const colorFromPointer = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      const el = wheelRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const radius = rect.width / 2;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);

      let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      return {
        hue: Math.round(angle) % 360,
        saturation: Math.round((dist / radius) * 100),
      };
    },
    [],
  );

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const c = colorFromPointer(e);
    if (c) {
      setLocalHue(c.hue);
      setLocalSat(c.saturation);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const c = colorFromPointer(e);
    if (c) {
      setLocalHue(c.hue);
      setLocalSat(c.saturation);
    }
  }

  function handlePointerUp() {
    if (dragging.current) {
      dragging.current = false;
      onColorChange(localHue, localSat);
    }
  }

  function selectPreset(h: number, s: number) {
    setLocalHue(h);
    setLocalSat(s);
    onColorChange(h, s);
  }

  async function addCustom() {
    if (saving) return;
    setSaving(true);
    try {
      const created = await api.post<SavedPreset>('/color-presets', {
        hue: localHue,
        saturation: localSat,
      });
      setCustoms((prev) => [...prev, created]);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function removeCustom(presetId: string) {
    setCustoms((prev) => prev.filter((p) => p.preset_id !== presetId));
    try {
      await api.delete(`/color-presets/${presetId}`);
    } catch {
      api.get<SavedPreset[]>('/color-presets').then(setCustoms).catch(() => {});
    }
  }

  const angleRad = ((localHue - 90) * Math.PI) / 180;
  const indicatorR = (localSat / 100) * (WHEEL_SIZE / 2);
  const indicatorX = WHEEL_SIZE / 2 + indicatorR * Math.cos(angleRad);
  const indicatorY = WHEEL_SIZE / 2 + indicatorR * Math.sin(angleRad);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-5 w-5 rounded-full shadow-sm"
              style={{ backgroundColor: hsToCss(localHue, localSat) }}
            />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Light Color
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Color wheel */}
        <div className="mb-4 flex justify-center">
          <div
            ref={wheelRef}
            className="relative cursor-crosshair rounded-full touch-none"
            style={{
              width: WHEEL_SIZE,
              height: WHEEL_SIZE,
              background: [
                'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 65%)',
                'conic-gradient(from 0deg, hsl(0 100% 50%), hsl(30 100% 50%), hsl(60 100% 50%), hsl(90 100% 50%), hsl(120 100% 50%), hsl(150 100% 50%), hsl(180 100% 50%), hsl(210 100% 50%), hsl(240 100% 50%), hsl(270 100% 50%), hsl(300 100% 50%), hsl(330 100% 50%), hsl(360 100% 50%))',
              ].join(', '),
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md shadow-black/30"
              style={{
                left: indicatorX,
                top: indicatorY,
                backgroundColor: hsToCss(localHue, localSat),
              }}
            />
          </div>
        </div>

        {/* Default presets */}
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
            Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                title={p.name}
                onClick={() => selectPreset(p.hue, p.saturation)}
                className={[
                  'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                  localHue === p.hue && localSat === p.saturation
                    ? 'border-[var(--text-primary)] scale-110'
                    : 'border-transparent',
                ].join(' ')}
                style={{ backgroundColor: hsToCss(p.hue, p.saturation) }}
              />
            ))}
          </div>
        </div>

        {/* Saved presets (shared across all users) */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Saved Colors
            </p>
            <button
              type="button"
              onClick={addCustom}
              disabled={saving}
              className={[
                'rounded-md px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-glow)]',
                saving ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {saving ? 'Saving…' : '+ Save'}
            </button>
          </div>
          {customs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customs.map((p) => (
                <div key={p.preset_id} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectPreset(p.hue, p.saturation)}
                    className={[
                      'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                      localHue === p.hue && localSat === p.saturation
                        ? 'border-[var(--text-primary)] scale-110'
                        : 'border-transparent',
                    ].join(' ')}
                    style={{ backgroundColor: hsToCss(p.hue, p.saturation) }}
                  />
                  <button
                    type="button"
                    onClick={() => removeCustom(p.preset_id)}
                    className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--danger)] text-[8px] leading-none text-white group-hover:flex"
                    aria-label="Remove preset"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-[var(--text-muted)]">
              Tap + Save to store the current color
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
