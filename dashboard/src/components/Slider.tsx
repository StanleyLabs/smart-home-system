import { useEffect, useRef, useState } from 'react';

type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  disabled?: boolean;
};

export function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
  label,
  unit,
  disabled,
}: SliderProps) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const localRef = useRef(value);

  useEffect(() => {
    if (!dragging.current) {
      setLocal(value);
      localRef.current = value;
    }
  }, [value]);

  const pct = max > min ? ((local - min) / (max - min)) * 100 : 0;

  function startDrag() {
    dragging.current = true;
  }

  function updateValue(e: React.FormEvent<HTMLInputElement>) {
    const v = Number((e.target as HTMLInputElement).value);
    localRef.current = v;
    setLocal(v);
  }

  function commitPointer() {
    if (dragging.current) {
      dragging.current = false;
      onChange(localRef.current);
    }
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
    ) {
      dragging.current = false;
      onChange(localRef.current);
    }
  }

  function handleBlur() {
    if (dragging.current) {
      dragging.current = false;
      onChange(localRef.current);
    }
  }

  return (
    <div className={disabled ? 'pointer-events-none opacity-40' : ''}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-[var(--text-muted)]">{label ?? '\u00a0'}</span>
        <span className="tabular-nums text-[var(--text-secondary)]">
          {local}
          {unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={local}
        disabled={disabled}
        onPointerDown={startDrag}
        onInput={updateValue}
        onPointerUp={commitPointer}
        onTouchEnd={commitPointer}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        className={[
          'h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none',
          '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-black/25',
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md',
        ].join(' ')}
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--border-hover) ${pct}%, var(--border-hover) 100%)`,
        }}
      />
    </div>
  );
}
