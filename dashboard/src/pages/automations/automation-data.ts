// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerType = 'device_state' | 'schedule';

export interface AutomationRule {
  rule_id: string;
  name: string;
  enabled: boolean;
  retrigger: { behavior: 'restart' | 'ignore' | 'queue'; cooldown_seconds: number };
  trigger: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  condition_logic: 'all' | 'any';
}

export interface DeviceOpt {
  device_id: string;
  name: string;
  device_type: string;
}

export interface SceneOpt {
  scene_id: string;
  name: string;
}

export type PropertyControl =
  | { control: 'toggle' }
  | { control: 'slider'; min: number; max: number; unit?: string }
  | { control: 'number'; min?: number; max?: number; unit?: string }
  | { control: 'select'; options: { value: string; label: string }[] };

export type PropertyDef = { key: string; label: string } & PropertyControl;

export type RepeatMode = 'once' | 'every_day' | 'weekdays' | 'weekends' | 'specific';

export interface ScheduleState {
  repeat: RepeatMode;
  days: boolean[];
  time: string; // HH:mm
}

// ---------------------------------------------------------------------------
// Device property definitions per type
// ---------------------------------------------------------------------------

export const DEVICE_PROPERTIES: Record<string, PropertyDef[]> = {
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

export function getPropertiesForDevice(deviceId: string, devices: DeviceOpt[]): PropertyDef[] {
  const dev = devices.find((d) => d.device_id === deviceId);
  if (!dev) return [];
  return DEVICE_PROPERTIES[dev.device_type] ?? [];
}

// ---------------------------------------------------------------------------
// Schedule (cron) helpers
// ---------------------------------------------------------------------------

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_CRON = [1, 2, 3, 4, 5, 6, 0]; // cron: 0=Sun, 1=Mon...

export function cronToSchedule(cron: string): ScheduleState {
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

export function scheduleToCron(s: ScheduleState): string {
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
// Trigger / property label helpers
// ---------------------------------------------------------------------------

export function deviceName(id: unknown, devices: DeviceOpt[]): string {
  if (typeof id !== 'string' || !id) return 'a device';
  return devices.find((d) => d.device_id === id)?.name ?? String(id);
}

export function propertyLabel(propertyKey: unknown, deviceId: unknown, devices: DeviceOpt[]): string {
  if (typeof propertyKey !== 'string') return '';
  const dev = devices.find((d) => d.device_id === deviceId);
  if (dev) {
    const defs = DEVICE_PROPERTIES[dev.device_type];
    const def = defs?.find((p) => p.key === propertyKey);
    if (def) return def.label.toLowerCase();
  }
  return propertyKey;
}

export function triggerSummary(trigger: Record<string, unknown>, devices: DeviceOpt[]): string {
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
// Defaults
// ---------------------------------------------------------------------------

export const defaultTrigger = (type: TriggerType): Record<string, unknown> => {
  switch (type) {
    case 'device_state':
      return { type: 'device_state', device_id: '', property: 'on', to: true };
    case 'schedule':
      return { type: 'schedule', cron: '0 8 * * *' };
    default:
      return { type: 'device_state', device_id: '', property: '', to: '' };
  }
};

export const emptyRule = (): Omit<AutomationRule, 'rule_id'> => ({
  name: '',
  enabled: true,
  retrigger: { behavior: 'ignore', cooldown_seconds: 0 },
  trigger: defaultTrigger('schedule'),
  conditions: [],
  actions: [{ type: 'device_command', device_id: '', action: 'set', properties: {} }],
  condition_logic: 'all',
});

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

export const inputCls =
  'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-base text-[var(--text-primary)]';
export const selectCls = inputCls + ' select-chevron';
export const cardCls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4';
export const pillBtnCls =
  'rounded-lg border border-[var(--border)] px-3 py-1.5 text-base font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-active)]';
