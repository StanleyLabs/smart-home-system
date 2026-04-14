import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Toggle } from '../components/Toggle';
import { Slider } from '../components/Slider';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

type TriggerType = 'device_state' | 'schedule';

interface AutomationRule {
  rule_id: string;
  name: string;
  enabled: boolean;
  retrigger: { behavior: 'restart' | 'ignore' | 'queue'; cooldown_seconds: number };
  trigger: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  condition_logic: 'all' | 'any';
}

interface DeviceOpt {
  device_id: string;
  name: string;
  device_type: string;
}

interface SceneOpt {
  scene_id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Property definitions per device type
// ---------------------------------------------------------------------------

type PropertyControl =
  | { control: 'toggle' }
  | { control: 'slider'; min: number; max: number; unit?: string }
  | { control: 'number'; min?: number; max?: number; unit?: string }
  | { control: 'select'; options: { value: string; label: string }[] };

type PropertyDef = { key: string; label: string } & PropertyControl;

const DEVICE_PROPERTIES: Record<string, PropertyDef[]> = {
  light: [
    { key: 'on', label: 'Power', control: 'toggle' },
    { key: 'brightness', label: 'Brightness', control: 'slider', min: 0, max: 100, unit: '%' },
    { key: 'color_temp', label: 'Color temperature', control: 'slider', min: 150, max: 500, unit: ' K' },
  ],
  switch: [
    { key: 'on', label: 'Power', control: 'toggle' },
  ],
  lock: [
    { key: 'locked', label: 'Locked', control: 'toggle' },
  ],
  thermostat: [
    { key: 'hvac_mode', label: 'Mode', control: 'select', options: [
      { value: 'off', label: 'Off' },
      { value: 'heat', label: 'Heat' },
      { value: 'cool', label: 'Cool' },
      { value: 'auto', label: 'Auto' },
    ] },
    { key: 'target_temperature', label: 'Target temperature', control: 'number', min: 40, max: 95, unit: '°' },
  ],
  contact_sensor: [
    { key: 'open', label: 'Open', control: 'toggle' },
  ],
  motion_sensor: [
    { key: 'motion', label: 'Motion detected', control: 'toggle' },
  ],
  environment_sensor: [
    { key: 'temperature', label: 'Temperature', control: 'number', unit: '°' },
    { key: 'humidity', label: 'Humidity', control: 'number', min: 0, max: 100, unit: '%' },
  ],
  blinds: [
    { key: 'position', label: 'Position', control: 'slider', min: 0, max: 100, unit: '%' },
    { key: 'tilt', label: 'Tilt', control: 'slider', min: 0, max: 100, unit: '%' },
  ],
};

function getPropertiesForDevice(deviceId: string, devices: DeviceOpt[]): PropertyDef[] {
  const dev = devices.find((d) => d.device_id === deviceId);
  if (!dev) return [];
  return DEVICE_PROPERTIES[dev.device_type] ?? [];
}

// ---------------------------------------------------------------------------
// Schedule (cron) helpers
// ---------------------------------------------------------------------------

type RepeatMode = 'once' | 'every_day' | 'weekdays' | 'weekends' | 'specific';
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_CRON = [1, 2, 3, 4, 5, 6, 0]; // cron: 0=Sun, 1=Mon...

interface ScheduleState {
  repeat: RepeatMode;
  days: boolean[];
  time: string; // HH:mm
}

function cronToSchedule(cron: string): ScheduleState {
  const parts = cron.trim().split(/\s+/);
  const minute = parts[0] ?? '0';
  const hour = parts[1] ?? '8';
  const dom = parts[2] ?? '*';
  const month = parts[3] ?? '*';
  const dow = parts[4] ?? '*';
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

  if (dom !== '*' && month !== '*') return { repeat: 'once', days: Array(7).fill(false), time };
  if (dow === '*') return { repeat: 'every_day', days: Array(7).fill(false), time };
  const nums = dow.split(',').map(Number);
  const isWeekdays = nums.length === 5 && [1, 2, 3, 4, 5].every((n) => nums.includes(n));
  const isWeekends = nums.length === 2 && [0, 6].every((n) => nums.includes(n));
  if (isWeekdays) return { repeat: 'weekdays', days: Array(7).fill(false), time };
  if (isWeekends) return { repeat: 'weekends', days: Array(7).fill(false), time };

  const days = DAY_CRON.map((cronDay) => nums.includes(cronDay));
  return { repeat: 'specific', days, time };
}

function scheduleToCron(s: ScheduleState): string {
  const [h, m] = s.time.split(':').map(Number);
  const minute = isNaN(m!) ? 0 : m;
  const hour = isNaN(h!) ? 8 : h;

  if (s.repeat === 'once') {
    const now = new Date();
    return `${minute} ${hour} ${now.getDate()} ${now.getMonth() + 1} *`;
  }

  let dow = '*';
  if (s.repeat === 'weekdays') dow = '1,2,3,4,5';
  else if (s.repeat === 'weekends') dow = '0,6';
  else if (s.repeat === 'specific') {
    const selected = DAY_CRON.filter((_, i) => s.days[i]);
    if (selected.length > 0) dow = selected.join(',');
  }
  return `${minute} ${hour} * * ${dow}`;
}

// ---------------------------------------------------------------------------
// Trigger summary (for rule list cards)
// ---------------------------------------------------------------------------

function deviceName(id: unknown, devices: DeviceOpt[]): string {
  if (typeof id !== 'string' || !id) return 'a device';
  return devices.find((d) => d.device_id === id)?.name ?? String(id);
}

function propertyLabel(propertyKey: unknown, deviceId: unknown, devices: DeviceOpt[]): string {
  if (typeof propertyKey !== 'string') return '';
  const dev = devices.find((d) => d.device_id === deviceId);
  if (dev) {
    const defs = DEVICE_PROPERTIES[dev.device_type];
    const def = defs?.find((p) => p.key === propertyKey);
    if (def) return def.label.toLowerCase();
  }
  return propertyKey;
}

function triggerSummary(trigger: Record<string, unknown>, devices: DeviceOpt[]): string {
  const t = trigger?.type as string | undefined;
  if (t === 'device_state') {
    const name = deviceName(trigger.device_id, devices);
    const prop = propertyLabel(trigger.property, trigger.device_id, devices);
    return `${name} ${prop} changes`;
  }
  if (t === 'schedule') {
    try {
      const s = cronToSchedule(String(trigger.cron ?? ''));
      const repeatLabel = s.repeat === 'once' ? '(once)' :
        s.repeat === 'every_day' ? 'every day' :
        s.repeat === 'weekdays' ? 'on weekdays' :
        s.repeat === 'weekends' ? 'on weekends' :
        'on selected days';
      return `${s.time} ${repeatLabel}`;
    } catch {
      return `Schedule: ${String(trigger.cron ?? '')}`;
    }
  }
  if (t === 'availability') return `${deviceName(trigger.device_id, devices)} goes ${String(trigger.to ?? '')}`;
  return t || '(no trigger)';
}

// ---------------------------------------------------------------------------
// Value control renderer (shared between triggers, conditions, and actions)
// ---------------------------------------------------------------------------

function ValueControl({ def, value, onChange }: {
  def: PropertyDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.control === 'toggle') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--text-secondary)]">{value ? 'On' : 'Off'}</span>
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
          className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        {def.unit && <span className="text-sm text-[var(--text-secondary)]">{def.unit}</span>}
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

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const inputCls = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]';
const selectCls = inputCls + ' select-chevron';
const cardCls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4';
const pillBtnCls = 'rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultTrigger = (type: TriggerType): Record<string, unknown> => {
  switch (type) {
    case 'device_state':
      return { type: 'device_state', device_id: '', property: 'on', to: true };
    case 'schedule':
      return { type: 'schedule', cron: '0 8 * * *' };
    default:
      return { type: 'device_state', device_id: '', property: '', to: '' };
  }
};

const emptyRule = (): Omit<AutomationRule, 'rule_id'> => ({
  name: '',
  enabled: true,
  retrigger: { behavior: 'ignore', cooldown_seconds: 0 },
  trigger: defaultTrigger('schedule'),
  conditions: [],
  actions: [{ type: 'device_command', device_id: '', action: 'set', properties: {} }],
  condition_logic: 'all',
});

// ===========================================================================
// Component
// ===========================================================================

export default function Automations() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [devices, setDevices] = useState<DeviceOpt[]>([]);
  const [sceneList, setSceneList] = useState<SceneOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<AutomationRule, 'rule_id'>>(emptyRule());
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<AutomationRule[]>('/automations'),
      api.get<(DeviceOpt & Record<string, unknown>)[]>('/devices'),
      api.get<{ scenes: SceneOpt[] }>('/scenes'),
    ])
      .then(([r, d, scRes]) => {
        setRules(r);
        setDevices(d.map((x) => ({
          device_id: x.device_id,
          name: x.name,
          device_type: String(x.device_type ?? 'unknown'),
        })));
        setSceneList(scRes.scenes);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // -- Modal open/close -----------------------------------------------------

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyRule());
    setAdvancedOpen(false);
    setModalOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingId(rule.rule_id);
    const { rule_id: _, ...rest } = rule;
    setDraft({
      ...rest,
      trigger: { ...rest.trigger },
      conditions: rest.conditions.map((c) => ({ ...c })),
      actions: rest.actions.map((a) => ({ ...a })),
    });
    setAdvancedOpen(false);
    setModalOpen(true);
  };

  // -- Trigger helpers ------------------------------------------------------

  const setTriggerType = (type: TriggerType) => {
    setDraft((d) => ({ ...d, trigger: defaultTrigger(type) }));
  };

  const updateTrigger = (patch: Record<string, unknown>) => {
    setDraft((d) => ({ ...d, trigger: { ...d.trigger, ...patch } }));
  };

  // -- Condition helpers ----------------------------------------------------

  const addCondition = (kind: 'time_range' | 'device_state') => {
    setDraft((d) => ({
      ...d,
      conditions: [
        ...d.conditions,
        kind === 'time_range'
          ? { type: 'time_range', after: '08:00', before: '22:00' }
          : { type: 'device_state', device_id: '', property: 'on', equals: true },
      ],
    }));
  };

  const updateCondition = (index: number, patch: Record<string, unknown>) => {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const removeCondition = (index: number) => {
    setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, i) => i !== index) }));
  };

  // -- Action helpers -------------------------------------------------------

  const addAction = (kind: 'device_command' | 'delay' | 'notify' | 'activate_scene') => {
    setDraft((d) => {
      const next = [...d.actions];
      if (kind === 'device_command') next.push({ type: 'device_command', device_id: '', action: 'set', properties: {} });
      else if (kind === 'delay') next.push({ type: 'delay', seconds: 5 });
      else if (kind === 'notify') next.push({ type: 'notify', channel: 'dashboard', message: '' });
      else next.push({ type: 'activate_scene', scene_id: '' });
      return { ...d, actions: next };
    });
  };

  const updateAction = (index: number, patch: Record<string, unknown>) => {
    setDraft((d) => ({
      ...d,
      actions: d.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  };

  const removeAction = (index: number) => {
    setDraft((d) => ({ ...d, actions: d.actions.filter((_, i) => i !== index) }));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const actionIds = draft.actions.map((_, i) => `action-${i}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = Number(String(active.id).replace('action-', ''));
    const to = Number(String(over.id).replace('action-', ''));
    setDraft((d) => {
      const next = [...d.actions];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return { ...d, actions: next };
    });
  };

  // -- Save -----------------------------------------------------------------

  const saveRule = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...draft };
      if (editingId) {
        await api.put(`/automations/${editingId}`, payload);
      } else {
        await api.post('/automations', payload);
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (id: string) => {
    setError(null);
    try {
      await api.post(`/automations/${id}/toggle`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this automation?')) return;
    setError(null);
    try {
      await api.delete(`/automations/${id}`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  // -- Derived state --------------------------------------------------------

  const tt = (draft.trigger?.type as string) || 'device_state';

  // -- Render ---------------------------------------------------------------

  return (
    <div className="min-h-full p-6 text-[var(--text-primary)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Automations</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Create Automation
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading && <p className="text-[var(--text-secondary)]">Loading...</p>}

      {!loading && rules.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--text-secondary)]">
          <p className="text-lg font-medium">No automations yet</p>
          <p className="mt-1 text-sm">Create your first automation to make your home work for you.</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {rules.map((r) => (
            <div
              key={r.rule_id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name || '(unnamed)'}</span>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={() => toggleRule(r.rule_id)}
                    />
                    Enabled
                  </label>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {triggerSummary(r.trigger as Record<string, unknown>, devices)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-sm hover:bg-[var(--bg-card-active)]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteRule(r.rule_id)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--bg-card-active)]"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL                                                              */}
      {/* ================================================================= */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto my-8 w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {editingId ? 'Edit Automation' : 'New Automation'}
            </h2>

            {/* Name */}
            <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Turn on lights at sunset"
                className={inputCls}
              />
            </label>

            {/* ============================================================= */}
            {/* WHEN (Trigger)                                                 */}
            {/* ============================================================= */}
            <section className="mt-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">When this happens...</h3>
              <select
                value={tt === 'schedule' || tt === 'device_state' ? tt : 'device_state'}
                onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                className={'mt-2 ' + selectCls}
              >
                <option value="schedule">At a specific time</option>
                <option value="device_state">A device changes</option>
              </select>

              {/* Trigger: device_state */}
              {tt === 'device_state' && (
                <div className={'mt-3 ' + cardCls}>
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    Device
                    <select
                      value={String(draft.trigger.device_id ?? '')}
                      onChange={(e) => {
                        const devId = e.target.value;
                        const props = getPropertiesForDevice(devId, devices);
                        const firstProp = props[0];
                        updateTrigger({
                          device_id: devId,
                          property: firstProp?.key ?? 'on',
                          to: firstProp?.control === 'toggle' ? true : '',
                        });
                      }}
                      className={selectCls}
                    >
                      <option value="">Choose a device...</option>
                      {devices.map((d) => (
                        <option key={d.device_id} value={d.device_id}>{d.name}</option>
                      ))}
                    </select>
                  </label>

                  {draft.trigger.device_id ? (() => {
                    const props = getPropertiesForDevice(String(draft.trigger.device_id), devices);
                    const selectedProp = props.find((p) => p.key === draft.trigger.property);
                    return (
                      <>
                        <label className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
                          Property
                          {props.length > 0 ? (
                            <select
                              value={String(draft.trigger.property ?? '')}
                              onChange={(e) => {
                                const prop = props.find((p) => p.key === e.target.value);
                                updateTrigger({
                                  property: e.target.value,
                                  to: prop?.control === 'toggle' ? true : '',
                                });
                              }}
                              className={selectCls}
                            >
                              {props.map((p) => (
                                <option key={p.key} value={p.key}>{p.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={String(draft.trigger.property ?? '')}
                              onChange={(e) => updateTrigger({ property: e.target.value })}
                              placeholder="Property name"
                              className={inputCls}
                            />
                          )}
                        </label>

                        <div className="mt-3">
                          <span className="block text-sm font-medium text-[var(--text-secondary)]">Changes to</span>
                          <div className="mt-1">
                            {selectedProp ? (
                              <ValueControl
                                def={selectedProp}
                                value={draft.trigger.to}
                                onChange={(v) => updateTrigger({ to: v })}
                              />
                            ) : (
                              <input
                                value={String(draft.trigger.to ?? '')}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === 'true') updateTrigger({ to: true });
                                  else if (v === 'false') updateTrigger({ to: false });
                                  else if (v !== '' && !isNaN(Number(v))) updateTrigger({ to: Number(v) });
                                  else updateTrigger({ to: v });
                                }}
                                placeholder="Value"
                                className={inputCls}
                              />
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })() : null}
                </div>
              )}

              {/* Trigger: schedule */}
              {tt === 'schedule' && <SchedulePicker
                cron={String(draft.trigger.cron ?? '0 8 * * *')}
                onChange={(cron) => updateTrigger({ cron })}
              />}

            </section>

            {/* ============================================================= */}
            {/* ONLY IF (Conditions)                                           */}
            {/* ============================================================= */}
            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Only if...</h3>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addCondition('time_range')} className={pillBtnCls}>
                    + Time window
                  </button>
                  <button type="button" onClick={() => addCondition('device_state')} className={pillBtnCls}>
                    + Device is...
                  </button>
                </div>
              </div>

              {draft.conditions.length > 0 && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">Match</span>
                  <select
                    value={draft.condition_logic}
                    onChange={(e) => setDraft((d) => ({ ...d, condition_logic: e.target.value as 'all' | 'any' }))}
                    className="select-chevron rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  >
                    <option value="all">all conditions</option>
                    <option value="any">any condition</option>
                  </select>
                </div>
              )}

              <div className="mt-3 space-y-3">
                {draft.conditions.map((c, i) => (
                  <div key={i} className={cardCls}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {c.type === 'time_range' ? 'Time window' : 'Device is...'}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeCondition(i)}
                        className="text-xs text-[var(--danger)] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    {c.type === 'time_range' && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm font-medium text-[var(--text-secondary)]">
                            After
                            <input
                              type="time"
                              value={String(c.after ?? '08:00')}
                              onChange={(e) => updateCondition(i, { after: e.target.value })}
                              className={inputCls}
                            />
                          </label>
                          <label className="text-sm font-medium text-[var(--text-secondary)]">
                            Before
                            <input
                              type="time"
                              value={String(c.before ?? '22:00')}
                              onChange={(e) => updateCondition(i, { before: e.target.value })}
                              className={inputCls}
                            />
                          </label>
                        </div>
                      </>
                    )}
                    {c.type === 'device_state' && (
                      <>
                        <label className="block text-sm font-medium text-[var(--text-secondary)]">
                          Device
                          <select
                            value={String(c.device_id ?? '')}
                            onChange={(e) => {
                              const devId = e.target.value;
                              const props = getPropertiesForDevice(devId, devices);
                              const firstProp = props[0];
                              updateCondition(i, {
                                device_id: devId,
                                property: firstProp?.key ?? 'on',
                                equals: firstProp?.control === 'toggle' ? true : '',
                              });
                            }}
                            className={selectCls}
                          >
                            <option value="">Choose a device...</option>
                            {devices.map((d) => (
                              <option key={d.device_id} value={d.device_id}>{d.name}</option>
                            ))}
                          </select>
                        </label>
                        {c.device_id && (() => {
                          const props = getPropertiesForDevice(String(c.device_id), devices);
                          const selectedProp = props.find((p) => p.key === c.property);
                          return (
                            <>
                              <label className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
                                Property
                                {props.length > 0 ? (
                                  <select
                                    value={String(c.property ?? '')}
                                    onChange={(e) => {
                                      const prop = props.find((p) => p.key === e.target.value);
                                      updateCondition(i, {
                                        property: e.target.value,
                                        equals: prop?.control === 'toggle' ? true : '',
                                      });
                                    }}
                                    className={selectCls}
                                  >
                                    {props.map((p) => (
                                      <option key={p.key} value={p.key}>{p.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    value={String(c.property ?? '')}
                                    onChange={(e) => updateCondition(i, { property: e.target.value })}
                                    placeholder="Property name"
                                    className={inputCls}
                                  />
                                )}
                              </label>
                              <div className="mt-3">
                                <span className="block text-sm font-medium text-[var(--text-secondary)]">Equals</span>
                                <div className="mt-1">
                                  {selectedProp ? (
                                    <ValueControl
                                      def={selectedProp}
                                      value={c.equals}
                                      onChange={(v) => updateCondition(i, { equals: v })}
                                    />
                                  ) : (
                                    <input
                                      value={String(c.equals ?? '')}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === 'true') updateCondition(i, { equals: true });
                                        else if (v === 'false') updateCondition(i, { equals: false });
                                        else if (v !== '' && !isNaN(Number(v))) updateCondition(i, { equals: Number(v) });
                                        else updateCondition(i, { equals: v });
                                      }}
                                      placeholder="Value"
                                      className={inputCls}
                                    />
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ============================================================= */}
            {/* DO (Actions)                                                   */}
            {/* ============================================================= */}
            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Then do this...</h3>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => addAction('device_command')} className={pillBtnCls}>+ Control a device</button>
                  <button type="button" onClick={() => addAction('delay')} className={pillBtnCls}>+ Wait</button>
                  <button type="button" onClick={() => addAction('notify')} className={pillBtnCls}>+ Send notification</button>
                  <button type="button" onClick={() => addAction('activate_scene')} className={pillBtnCls}>+ Activate scene</button>
                </div>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                <SortableContext items={actionIds} strategy={verticalListSortingStrategy}>
                  <div className="mt-3 space-y-3">
                    {draft.actions.map((a, i) => (
                      <SortableActionCard key={actionIds[i]} id={actionIds[i]!} onRemove={() => removeAction(i)} action={a}>
                    {/* device_command */}
                    {a.type === 'device_command' && (
                      <>
                        <label className="block text-sm font-medium text-[var(--text-secondary)]">
                          Device
                          <select
                            value={String(a.device_id ?? '')}
                            onChange={(e) => {
                              const devId = e.target.value;
                              const props = getPropertiesForDevice(devId, devices);
                              const defaultProps: Record<string, unknown> = {};
                              if (props.length > 0) {
                                const first = props[0]!;
                                defaultProps[first.key] = first.control === 'toggle' ? true :
                                  first.control === 'slider' ? first.min :
                                  '';
                              }
                              updateAction(i, { device_id: devId, action: 'set', properties: defaultProps });
                            }}
                            className={selectCls}
                          >
                            <option value="">Choose a device...</option>
                            {devices.map((d) => (
                              <option key={d.device_id} value={d.device_id}>{d.name}</option>
                            ))}
                          </select>
                        </label>

                        {a.device_id && (() => {
                          const props = getPropertiesForDevice(String(a.device_id), devices);
                          const currentProps = (a.properties ?? {}) as Record<string, unknown>;
                          if (props.length === 0) {
                            return (
                              <label className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
                                Properties (JSON)
                                <textarea
                                  value={JSON.stringify(currentProps, null, 2)}
                                  onChange={(e) => {
                                    try {
                                      updateAction(i, { properties: JSON.parse(e.target.value) });
                                    } catch { /* keep typing */ }
                                  }}
                                  rows={3}
                                  className={inputCls + ' font-mono text-xs'}
                                />
                              </label>
                            );
                          }
                          return (
                            <div className="mt-3 space-y-3">
                              {props.map((def) => {
                                const isActive = def.key in currentProps;
                                return (
                                  <div key={def.key} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                    <label className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => {
                                          const next = { ...currentProps };
                                          if (e.target.checked) {
                                            next[def.key] = def.control === 'toggle' ? true :
                                              def.control === 'slider' ? def.min :
                                              def.control === 'number' ? (def.min ?? 0) :
                                              def.control === 'select' ? (def.options[0]?.value ?? '') : '';
                                          } else {
                                            delete next[def.key];
                                          }
                                          updateAction(i, { properties: next });
                                        }}
                                      />
                                      <span className="font-medium text-[var(--text-primary)]">{def.label}</span>
                                    </label>
                                    {isActive && (
                                      <div className="mt-2 pl-6">
                                        <ValueControl
                                          def={def}
                                          value={currentProps[def.key]}
                                          onChange={(v) => {
                                            updateAction(i, { properties: { ...currentProps, [def.key]: v } });
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {/* delay */}
                    {a.type === 'delay' && (
                      <label className="text-sm font-medium text-[var(--text-secondary)]">
                        Duration (seconds)
                        <input
                          type="number"
                          min={0}
                          value={Number(a.seconds ?? 0)}
                          onChange={(e) => updateAction(i, { seconds: parseInt(e.target.value, 10) || 0 })}
                          className={inputCls}
                        />
                      </label>
                    )}

                    {/* notify */}
                    {a.type === 'notify' && (
                      <>
                        <label className="block text-sm font-medium text-[var(--text-secondary)]">
                          Channel
                          <select
                            value={String(a.channel ?? 'dashboard')}
                            onChange={(e) => updateAction(i, { channel: e.target.value })}
                            className={selectCls}
                          >
                            <option value="dashboard">Dashboard</option>
                            <option value="push">Push notification</option>
                            <option value="email">Email</option>
                          </select>
                        </label>
                        <label className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
                          Message
                          <input
                            value={String(a.message ?? '')}
                            onChange={(e) => updateAction(i, { message: e.target.value })}
                            placeholder="e.g. Motion detected in the backyard"
                            className={inputCls}
                          />
                        </label>
                      </>
                    )}

                    {/* activate_scene */}
                    {a.type === 'activate_scene' && (
                      <label className="text-sm font-medium text-[var(--text-secondary)]">
                        Scene
                        <select
                          value={String(a.scene_id ?? '')}
                          onChange={(e) => updateAction(i, { scene_id: e.target.value })}
                          className={selectCls}
                        >
                          <option value="">Choose a scene...</option>
                          {sceneList.map((s) => (
                            <option key={s.scene_id} value={s.scene_id}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                      </SortableActionCard>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </section>

            {/* ============================================================= */}
            {/* ADVANCED (Retrigger)                                           */}
            {/* ============================================================= */}
            <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Advanced options
                <svg
                  className={'h-4 w-4 transition-transform ' + (advancedOpen ? 'rotate-180' : '')}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {advancedOpen && (
                <div className="border-t border-[var(--border)] px-4 py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-[var(--text-secondary)]">
                      If triggered again...
                      <select
                        value={draft.retrigger.behavior}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            retrigger: { ...d.retrigger, behavior: e.target.value as 'restart' | 'ignore' | 'queue' },
                          }))
                        }
                        className={selectCls}
                      >
                        <option value="ignore">Ignore until finished</option>
                        <option value="restart">Restart the automation</option>
                        <option value="queue">Queue and run after</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-[var(--text-secondary)]">
                      Minimum time between runs
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={draft.retrigger.cooldown_seconds}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              retrigger: { ...d.retrigger, cooldown_seconds: parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                          className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
                        <span className="text-sm text-[var(--text-muted)]">seconds</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </section>

            {/* ============================================================= */}
            {/* Footer                                                         */}
            {/* ============================================================= */}
            <div className="mt-8 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !draft.name.trim()}
                onClick={saveRule}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Sortable Action Card
// ===========================================================================

function SortableActionCard({ id, onRemove, action, children }: {
  id: string;
  onRemove: () => void;
  action: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    animateLayoutChanges: () => false,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.25)' : undefined,
  };
  const label = action.type === 'device_command' ? 'Control a device' :
    action.type === 'delay' ? 'Wait' :
    action.type === 'notify' ? 'Send notification' :
    action.type === 'activate_scene' ? 'Activate scene' : String(action.type);

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={cardCls}>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          className="touch-none cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
            <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
            <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
          </svg>
        </button>
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-[var(--danger)] hover:underline"
        >
          Remove
        </button>
      </div>
      {children}
    </div>
  );
}

// ===========================================================================
// Schedule Picker (extracted for clarity)
// ===========================================================================

function SchedulePicker({ cron, onChange }: { cron: string; onChange: (cron: string) => void }) {
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
      <label className="block text-sm font-medium text-[var(--text-secondary)]">
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
          <span className="block text-sm font-medium text-[var(--text-secondary)]">Days</span>
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
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  state.days[idx]
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm font-medium text-[var(--text-secondary)]">
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
