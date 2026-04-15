import { useState } from 'react';
import {
  cronToSchedule,
  scheduleToCron,
  DAY_LABELS,
  cardCls,
  selectCls,
  inputCls,
  type RepeatMode,
  type ScheduleState,
} from './automation-data';

export function SchedulePicker({ cron, onChange }: { cron: string; onChange: (cron: string) => void }) {
  const [state, setState] = useState<ScheduleState>(() => cronToSchedule(cron));

  const update = (patch: Partial<ScheduleState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      onChange(scheduleToCron(next));
      return next;
    });
  };

  return (
    <div className={'mt-3 space-y-4 ' + cardCls}>
      <label className="block text-base font-medium text-[var(--text-secondary)]">
        Repeat
        <select
          value={state.repeat}
          onChange={(e) => update({ repeat: e.target.value as RepeatMode })}
          className={selectCls}
        >
          <option value="once">Don't repeat</option>
          <option value="every_day">Every day</option>
          <option value="weekdays">Weekdays (Mon-Fri)</option>
          <option value="weekends">Weekends (Sat-Sun)</option>
          <option value="specific">Specific days...</option>
        </select>
      </label>

      {state.repeat === 'specific' && (
        <div>
          <span className="block text-base font-medium text-[var(--text-secondary)]">Days</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const next = [...state.days];
                  next[idx] = !next[idx];
                  update({ days: next });
                }}
                className={[
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  state.days[idx]
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-base font-medium text-[var(--text-secondary)]">
        Time
        <input
          type="time"
          value={state.time}
          onChange={(e) => update({ time: e.target.value })}
          className={inputCls}
        />
      </label>
    </div>
  );
}
