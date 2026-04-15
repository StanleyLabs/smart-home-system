import { useState, type SyntheticEvent } from 'react';
import { DeviceInfoDialog } from './DeviceInfoDialog';
import { ColorPicker } from './ColorPicker';
import { hsToCss } from '../lib/color-hs';
import { Slider } from './Slider';
import { StatusBadge } from './StatusBadge';
import { Toggle } from './Toggle';

export type DeviceType =
  | 'light'
  | 'switch'
  | 'lock'
  | 'thermostat'
  | 'contact_sensor'
  | 'motion_sensor'
  | 'environment_sensor'
  | 'blinds'
  | 'camera'
  | 'fan'
  | 'garage_door'
  | 'doorbell';

export type DeviceCardDevice = {
  device_id: string;
  device_type: DeviceType;
  name: string;
  online: boolean;
  supports?: string[];
  manufacturer?: string;
  model?: string;
  protocol?: string;
};

type DeviceCardProps = {
  device: DeviceCardDevice;
  state: Record<string, unknown>;
  onCommand: (action: string, properties: Record<string, unknown>) => void;
  compact?: boolean;
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function num(state: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = state[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return undefined;
}

function str(state: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = state[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function bool(state: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = state[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatLast(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    if (!Number.isNaN(d.getTime())) return relativeTime(d);
    return String(v);
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return relativeTime(d);
    return v;
  }
  return String(v);
}

function primaryLine(device: DeviceCardDevice, state: Record<string, unknown>): string {
  switch (device.device_type) {
    case 'light': {
      if (!bool(state, 'on')) return 'Off';
      const br = num(state, 'brightness');
      if (br != null) return `On · ${Math.round(br)}%`;
      return 'On';
    }
    case 'switch':
      return bool(state, 'on') ? 'On' : 'Off';
    case 'lock':
      return bool(state, 'locked') ? 'Locked' : 'Unlocked';
    case 'thermostat': {
      const cur = num(state, 'current_temperature', 'current_temp', 'temperature');
      const u = str(state, 'temperature_unit') ?? '°';
      if (cur != null) return `${Math.round(cur * 10) / 10}${u}`;
      return str(state, 'hvac_mode', 'mode') ?? '—';
    }
    case 'contact_sensor':
      return bool(state, 'open', 'contact_open') ? 'Open' : 'Closed';
    case 'motion_sensor':
      return bool(state, 'motion', 'motion_detected') ? 'Motion detected' : 'Clear';
    case 'environment_sensor': {
      const t = num(state, 'temperature', 'temp');
      const h = num(state, 'humidity');
      const parts: string[] = [];
      if (t != null) parts.push(`${Math.round(t * 10) / 10}°`);
      if (h != null) parts.push(`${Math.round(h)}% RH`);
      return parts.length ? parts.join(' · ') : '—';
    }
    case 'blinds': {
      const pos = num(state, 'position', 'current_position');
      if (pos != null) return `${Math.round(pos)}% open`;
      return '—';
    }
    case 'camera':
      if (bool(state, 'streaming')) return 'Streaming';
      if (bool(state, 'recording')) return 'Recording';
      return 'Idle';
    case 'fan': {
      if (!bool(state, 'on')) return 'Off';
      const spd = num(state, 'speed');
      const maxSpd = num(state, 'max_speed');
      if (spd != null && maxSpd != null) return `On · Speed ${spd}/${maxSpd}`;
      if (spd != null) return `On · Speed ${spd}`;
      return 'On';
    }
    case 'garage_door':
      return bool(state, 'open') ? 'Open' : 'Closed';
    case 'doorbell':
      return bool(state, 'ringing') ? 'Ringing' : 'Ready';
    default:
      return '—';
  }
}

function cardBorder(
  type: DeviceType,
  state: Record<string, unknown>,
  online: boolean,
): string {
  if (!online) return 'border-[var(--border)]';
  switch (type) {
    case 'light':
    case 'switch':
    case 'fan':
      return bool(state, 'on') ? 'border-[var(--accent)]' : 'border-[var(--border)]';
    case 'lock':
      return bool(state, 'locked') === false
        ? 'border-[var(--warning)]'
        : 'border-[var(--border)]';
    case 'contact_sensor':
    case 'garage_door':
      return bool(state, 'open') ? 'border-[var(--warning)]' : 'border-[var(--border)]';
    case 'motion_sensor':
      return bool(state, 'motion', 'motion_detected')
        ? 'border-[var(--warning)]'
        : 'border-[var(--border)]';
    case 'doorbell':
      return bool(state, 'ringing') ? 'border-[var(--accent)]' : 'border-[var(--border)]';
    case 'camera':
      return bool(state, 'streaming') ? 'border-[var(--accent)]' : 'border-[var(--border)]';
    default:
      return 'border-[var(--border)]';
  }
}

/* ── Icons ────────────────────────────────────────────────────────── */

function PowerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="2" x2="12" y2="10" />
      <path d="M6.34 6.34a8 8 0 1 0 11.32 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M16 11V7a4 4 0 0 0-7.97-.32" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function LightSliders({ show, supports, brightness, colorTemp, muted, onCommand }: {
  show: boolean;
  supports: string[];
  brightness: number;
  colorTemp: number;
  muted: boolean;
  onCommand: (action: string, properties: Record<string, unknown>) => void;
}) {
  if (!show) return null;
  return (
    <div className="mt-3 space-y-2">
      {supports.includes('brightness') && (
        <Slider
          label="Brightness"
          unit="%"
          min={0}
          max={100}
          value={Math.min(100, Math.max(0, brightness))}
          disabled={muted}
          onChange={(v) => onCommand('set', { brightness: v })}
        />
      )}
      {supports.includes('color_temp') && (
        <Slider
          label="Color temp"
          unit=" mired"
          min={153}
          max={500}
          value={Math.min(500, Math.max(153, colorTemp))}
          disabled={muted}
          onChange={(v) => onCommand('set', { color_temp: v })}
        />
      )}
    </div>
  );
}

/* ── Thermostat modes ─────────────────────────────────────────────── */

const THERM_MODES = ['heat', 'cool', 'auto', 'off'] as const;

/** Prevent card background click from opening device info when using inner controls. */
function stopDeviceInfoClick(e: SyntheticEvent) {
  e.stopPropagation();
}

/* ── Component ────────────────────────────────────────────────────── */

function DeviceCard({ device, state, onCommand, compact }: DeviceCardProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [deviceInfoOpen, setDeviceInfoOpen] = useState(false);
  const { online } = device;
  const muted = !online;
  const supports = device.supports ?? [];

  const on = Boolean(bool(state, 'on'));
  const locked = Boolean(bool(state, 'locked'));

  const brightness = Math.round(num(state, 'brightness') ?? 0);
  const colorTemp = Math.round(num(state, 'color_temp', 'color_temperature') ?? 300);
  const colorHue = Math.round(num(state, 'color_hue', 'hue') ?? 0);
  const colorSat = Math.round(num(state, 'color_saturation', 'saturation') ?? 100);

  const position = Math.round(num(state, 'position', 'current_position') ?? 0);
  const tilt = Math.round(num(state, 'tilt', 'tilt_position') ?? 0);

  const targetTemp = num(state, 'target_temperature', 'target_temp', 'heating_setpoint');
  const currentTemp = num(state, 'current_temperature', 'current_temp', 'temperature');
  const humidity = num(state, 'humidity');
  const mode = (str(state, 'hvac_mode', 'mode') ?? 'off').toLowerCase();

  const powerDraw = num(state, 'power_w', 'power', 'power_draw', 'energy_w');
  const battery = num(state, 'battery', 'battery_percent', 'battery_level');
  const signal = num(state, 'signal', 'link_quality', 'rssi');

  const isLight = device.device_type === 'light';
  const hasLightSliders = isLight && (supports.includes('brightness') || supports.includes('color_temp'));
  const hasPowerBtn =
    isLight ||
    device.device_type === 'switch' ||
    device.device_type === 'fan';

  if (compact) {
    const cardClass = [
      'rounded-xl border bg-[var(--bg-card)] px-3 py-2.5 transition-colors',
      muted ? 'opacity-50' : '',
      cardBorder(device.device_type, state, online),
      'w-full cursor-pointer text-left font-inherit hover:bg-[var(--bg-card-active)]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
    ].join(' ');

    const inner = (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-xs font-medium text-[var(--text-primary)]">
              {device.name}
            </h3>
            <span
              className={[
                'h-1.5 w-1.5 shrink-0 rounded-full',
                online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
              ].join(' ')}
              title={online ? 'Online' : 'Offline'}
            />
            {battery != null && <StatusBadge type="battery" value={battery} />}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {primaryLine(device, state)}
          </p>
        </div>
      </div>
    );

    return (
      <>
        <button
          type="button"
          data-device-id={device.device_id}
          className={cardClass}
          onClick={() => setDeviceInfoOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={deviceInfoOpen}
        >
          {inner}
        </button>
        {deviceInfoOpen && (
          <DeviceInfoDialog device={device} state={state} onClose={() => setDeviceInfoOpen(false)} />
        )}
      </>
    );
  }

  const fullCardClass = [
    'rounded-xl border bg-[var(--bg-card)] p-4 transition-colors h-48',
    muted ? 'opacity-50' : '',
    cardBorder(device.device_type, state, online),
    'w-full cursor-pointer text-left font-inherit hover:bg-[var(--bg-card-active)]/20',
  ].join(' ');

  const fullCardInner = (
    <>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-[var(--text-primary)]">
              {device.name}
            </h3>
            <span
              className={[
                'h-1.5 w-1.5 shrink-0 rounded-full',
                online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
              ].join(' ')}
              title={online ? 'Online' : 'Offline'}
            />
            {battery != null && <StatusBadge type="battery" value={battery} />}
            {signal != null && <StatusBadge type="signal" value={signal} />}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {primaryLine(device, state)}
          </p>
        </div>

        {device.device_type === 'light' && supports.includes('color') && (
          <button
            type="button"
            disabled={muted}
            onClick={(e) => {
              stopDeviceInfoClick(e);
              setColorPickerOpen(true);
            }}
            aria-label="Change color"
            className={[
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] transition-transform hover:scale-110',
              muted ? 'cursor-not-allowed' : '',
            ].join(' ')}
            style={{ backgroundColor: hsToCss(colorHue, colorSat) }}
          />
        )}

        {hasPowerBtn && (
          <button
            type="button"
            disabled={muted}
            onClick={(e) => {
              stopDeviceInfoClick(e);
              onCommand('set', { on: !on });
            }}
            aria-label={on ? 'Turn off' : 'Turn on'}
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
              on
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--bg-card-active)] text-[var(--text-muted)]',
              !muted && !on
                ? 'hover:bg-[var(--border-hover)] hover:text-[var(--text-secondary)]'
                : '',
              muted ? 'cursor-not-allowed' : '',
            ].join(' ')}
          >
            <PowerIcon />
          </button>
        )}

        {device.device_type === 'lock' && (
          <button
            type="button"
            disabled={muted}
            onClick={(e) => {
              stopDeviceInfoClick(e);
              onCommand('set', { locked: !locked });
            }}
            aria-label={locked ? 'Unlock' : 'Lock'}
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
              locked
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--warning)] text-white shadow-sm',
              muted ? 'cursor-not-allowed' : '',
            ].join(' ')}
          >
            {locked ? <LockIcon /> : <UnlockIcon />}
          </button>
        )}

        {device.device_type === 'garage_door' && (
          <button
            type="button"
            disabled={muted}
            onClick={(e) => {
              stopDeviceInfoClick(e);
              onCommand('set', { open: !bool(state, 'open') });
            }}
            aria-label={bool(state, 'open') ? 'Close garage door' : 'Open garage door'}
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
              bool(state, 'open')
                ? 'bg-[var(--warning)] text-white shadow-sm'
                : 'bg-[var(--bg-card-active)] text-[var(--text-muted)]',
              !muted
                ? 'hover:bg-[var(--border-hover)] hover:text-[var(--text-secondary)]'
                : 'cursor-not-allowed',
            ].join(' ')}
          >
            {bool(state, 'open') ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </button>
        )}
      </div>

      {/* ── Light controls ─────────────────────────────────────── */}
      <div onClick={stopDeviceInfoClick} onPointerDown={stopDeviceInfoClick}>
        <LightSliders show={hasLightSliders} supports={supports} brightness={brightness} colorTemp={colorTemp} muted={muted} onCommand={onCommand} />
      </div>

      {/* ── Switch info ────────────────────────────────────────── */}
      {device.device_type === 'switch' && powerDraw != null && (
        <p className="mt-2 text-xs tabular-nums text-[var(--text-muted)]">
          {Math.round(powerDraw * 10) / 10} W
        </p>
      )}

      {/* ── Lock info ──────────────────────────────────────────── */}
      {device.device_type === 'lock' && state.last_action != null && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {formatLast(state.last_action)}
        </p>
      )}

      {/* ── Thermostat ─────────────────────────────────────────── */}
      {device.device_type === 'thermostat' && (
        <div
          className="mt-3 space-y-3"
          onClick={stopDeviceInfoClick}
          onPointerDown={stopDeviceInfoClick}
        >
          <div className="flex flex-wrap gap-1">
            {THERM_MODES.map((m) => (
              <button
                key={m}
                type="button"
                disabled={muted}
                onClick={() => onCommand('set', { hvac_mode: m, mode: m })}
                className={[
                  'rounded-md border px-2 py-1 text-xs capitalize transition-colors',
                  mode === m
                    ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]',
                  muted ? 'cursor-not-allowed opacity-50' : '',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
          {targetTemp != null && (
            <Slider
              label="Target"
              unit={str(state, 'temperature_unit') ?? '°'}
              min={num(state, 'min_temp', 'min_setpoint') ?? 50}
              max={num(state, 'max_temp', 'max_setpoint') ?? 85}
              value={Math.round(targetTemp * 2) / 2}
              disabled={muted}
              onChange={(v) =>
                onCommand('set', { target_temperature: v, target_temp: v })
              }
            />
          )}
          <div className="flex gap-4 text-xs">
            <span className="text-[var(--text-muted)]">
              Now{' '}
              <span className="tabular-nums text-[var(--text-secondary)]">
                {currentTemp != null
                  ? `${Math.round(currentTemp * 10) / 10}${str(state, 'temperature_unit') ?? '°'}`
                  : '—'}
              </span>
            </span>
            {humidity != null && (
              <span className="text-[var(--text-muted)]">
                Humidity{' '}
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {Math.round(humidity)}%
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Contact sensor ─────────────────────────────────────── */}
      {device.device_type === 'contact_sensor' && battery != null && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Battery {Math.round(battery)}%
        </p>
      )}

      {/* ── Motion sensor ──────────────────────────────────────── */}
      {device.device_type === 'motion_sensor' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span>Last: {formatLast(state.last_motion)}</span>
          {battery != null && <span>Battery {Math.round(battery)}%</span>}
        </div>
      )}

      {/* ── Environment sensor ─────────────────────────────────── */}
      {device.device_type === 'environment_sensor' && battery != null && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Battery {Math.round(battery)}%
        </p>
      )}

      {/* ── Blinds ─────────────────────────────────────────────── */}
      {device.device_type === 'blinds' && (
        <div
          className="mt-3 space-y-2"
          onClick={stopDeviceInfoClick}
          onPointerDown={stopDeviceInfoClick}
        >
          <Slider
            label="Position"
            unit="%"
            min={0}
            max={100}
            value={Math.min(100, Math.max(0, position))}
            disabled={muted}
            onChange={(v) => onCommand('set', { position: v })}
          />
          {supports.includes('tilt') && (
            <Slider
              label="Tilt"
              unit="°"
              min={-90}
              max={90}
              value={Math.min(90, Math.max(-90, tilt))}
              disabled={muted}
              onChange={(v) => onCommand('set', { tilt: v })}
            />
          )}
        </div>
      )}

      {/* ── Camera ─────────────────────────────────────────────── */}
      {device.device_type === 'camera' && (
        <div
          className="mt-3 space-y-2 text-sm"
          onClick={stopDeviceInfoClick}
          onPointerDown={stopDeviceInfoClick}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">Recording</span>
            <Toggle
              checked={Boolean(bool(state, 'recording'))}
              disabled={muted}
              onChange={(v) => onCommand('set', { recording: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">Night vision</span>
            <Toggle
              checked={Boolean(bool(state, 'night_vision'))}
              disabled={muted}
              onChange={(v) => onCommand('set', { night_vision: v })}
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
            <span>
              Motion:{' '}
              <span
                className={
                  bool(state, 'motion_detected')
                    ? 'text-[var(--warning)]'
                    : 'text-[var(--text-secondary)]'
                }
              >
                {bool(state, 'motion_detected') ? 'Detected' : 'None'}
              </span>
            </span>
            <span>Last: {formatLast(state.last_motion)}</span>
          </div>
        </div>
      )}

      {/* ── Fan controls ───────────────────────────────────────── */}
      {device.device_type === 'fan' && supports.includes('speed') && (
        <div
          className="mt-3"
          onClick={stopDeviceInfoClick}
          onPointerDown={stopDeviceInfoClick}
        >
          <Slider
            label="Speed"
            unit=""
            min={1}
            max={Math.round(num(state, 'max_speed') ?? 4)}
            value={Math.round(num(state, 'speed') ?? 1)}
            disabled={muted}
            onChange={(v) => onCommand('set', { speed: v })}
          />
        </div>
      )}

      {/* ── Garage door info ───────────────────────────────────── */}
      {device.device_type === 'garage_door' && bool(state, 'obstruction') && (
        <div className="mt-2 rounded-md bg-[var(--danger)]/10 px-2 py-1.5 text-xs font-medium text-[var(--danger)]">
          Obstruction detected
        </div>
      )}

      {/* ── Doorbell info ──────────────────────────────────────── */}
      {device.device_type === 'doorbell' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span>
            Motion:{' '}
            <span
              className={
                bool(state, 'motion_detected')
                  ? 'text-[var(--warning)]'
                  : 'text-[var(--text-secondary)]'
              }
            >
              {bool(state, 'motion_detected') ? 'Detected' : 'None'}
            </span>
          </span>
          <span>Last ring: {formatLast(state.last_ring)}</span>
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        data-device-id={device.device_id}
        className={fullCardClass}
        onClick={() => setDeviceInfoOpen(true)}
      >
        {fullCardInner}
      </div>
      {deviceInfoOpen && (
        <DeviceInfoDialog device={device} state={state} onClose={() => setDeviceInfoOpen(false)} />
      )}
      {colorPickerOpen && (
        <ColorPicker
          hue={colorHue}
          saturation={colorSat}
          onColorChange={(h, s) =>
            onCommand('set', { color_hue: h, color_saturation: s })
          }
          onClose={() => setColorPickerOpen(false)}
        />
      )}
    </>
  );
}

export { DeviceCard };
export default DeviceCard;
