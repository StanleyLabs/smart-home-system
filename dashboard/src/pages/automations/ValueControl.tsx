import { Toggle } from '../../components/Toggle';
import { Slider } from '../../components/Slider';
import type { PropertyDef } from './automation-data';
import { selectCls } from './automation-data';

export function ValueControl({ def, value, onChange }: {
  def: PropertyDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.control === 'toggle') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-base text-[var(--text-secondary)]">{value ? 'On' : 'Off'}</span>
        <Toggle checked={!!value} onChange={(c) => onChange(c)} />
      </div>
    );
  }
  if (def.control === 'slider') {
    return (
      <Slider
        label={def.label}
        value={Number(value ?? def.min)}
        min={def.min}
        max={def.max}
        unit={def.unit}
        onChange={(v) => onChange(v)}
      />
    );
  }
  if (def.control === 'number') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={def.min}
          max={def.max}
          value={value == null ? '' : Number(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-base text-[var(--text-primary)]"
        />
        {def.unit && <span className="text-base text-[var(--text-secondary)]">{def.unit}</span>}
      </div>
    );
  }
  if (def.control === 'select') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={selectCls}
      >
        <option value="">Choose...</option>
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  return null;
}
