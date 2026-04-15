import { useEffect } from 'react';
import type { DeviceCardDevice } from './DeviceCard';

type DeviceInfoDialogProps = {
  device: DeviceCardDevice;
  state: Record<string, unknown>;
  onClose: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  light: 'Light',
  switch: 'Switch',
  lock: 'Lock',
  thermostat: 'Thermostat',
  contact_sensor: 'Contact sensor',
  motion_sensor: 'Motion sensor',
  environment_sensor: 'Environment sensor',
  blinds: 'Blinds',
  camera: 'Camera',
  fan: 'Fan',
  garage_door: 'Garage door',
  doorbell: 'Doorbell',
};

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

function formatLast(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    if (!Number.isNaN(d.getTime())) {
      const ms = Date.now() - d.getTime();
      if (ms < 60_000) return 'Just now';
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
      const days = Math.floor(ms / 86_400_000);
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString();
    }
    return String(v);
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const ms = Date.now() - d.getTime();
      if (ms < 60_000) return 'Just now';
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
      const days = Math.floor(ms / 86_400_000);
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString();
    }
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border)]/70 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

export function DeviceInfoDialog({ device, state, onClose }: DeviceInfoDialogProps) {
  const { online } = device;
  const battery = num(state, 'battery', 'battery_percent', 'battery_level');
  const signal = num(state, 'signal', 'link_quality', 'rssi');
  const typeLabel = TYPE_LABELS[device.device_type] ?? device.device_type;
  const powerDraw = num(state, 'power_w', 'power', 'power_draw', 'energy_w');
  const mode = (str(state, 'hvac_mode', 'mode') ?? 'off').toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-info-dialog-title"
    >
      <div className="absolute inset-0 cursor-default" aria-hidden onClick={onClose} />
      <div className="relative z-[1] max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="device-info-dialog-title" className="text-lg font-semibold text-[var(--text-primary)]">
              {device.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {typeLabel}
              <span className="text-[var(--text-muted)]"> · </span>
              <span className={online ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}>
                {online ? 'Online' : 'Offline'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-active)]"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-2xl font-medium tabular-nums text-[var(--text-primary)]">
          {primaryLine(device, state)}
        </p>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/40 px-3 py-1">
          {device.device_type === 'light' && (
            <>
              <Row label="Power" value={bool(state, 'on') ? 'On' : 'Off'} />
              {num(state, 'brightness') != null && (
                <Row label="Brightness" value={`${Math.round(num(state, 'brightness')!)}%`} />
              )}
              {num(state, 'color_temp', 'color_temperature') != null && (
                <Row label="Color temp" value={`${Math.round(num(state, 'color_temp', 'color_temperature')!)} mired`} />
              )}
              {(num(state, 'color_hue', 'hue') != null || num(state, 'color_saturation', 'saturation') != null) && (
                <Row
                  label="Color"
                  value={`Hue ${Math.round(num(state, 'color_hue', 'hue') ?? 0)} · Sat ${Math.round(num(state, 'color_saturation', 'saturation') ?? 0)}%`}
                />
              )}
            </>
          )}
          {device.device_type === 'switch' && (
            <>
              <Row label="Power" value={bool(state, 'on') ? 'On' : 'Off'} />
              {powerDraw != null && (
                <Row label="Power draw" value={`${Math.round(powerDraw * 10) / 10} W`} />
              )}
            </>
          )}
          {device.device_type === 'lock' && (
            <>
              <Row label="State" value={bool(state, 'locked') ? 'Locked' : 'Unlocked'} />
              {state.last_action != null && (
                <Row label="Last action" value={formatLast(state.last_action)} />
              )}
            </>
          )}
          {device.device_type === 'thermostat' && (
            <>
              <Row label="Mode" value={mode} />
              {num(state, 'target_temperature', 'target_temp', 'heating_setpoint') != null && (
                <Row
                  label="Target"
                  value={`${Math.round((num(state, 'target_temperature', 'target_temp', 'heating_setpoint') ?? 0) * 2) / 2}${str(state, 'temperature_unit') ?? '°'}`}
                />
              )}
              {num(state, 'current_temperature', 'current_temp', 'temperature') != null && (
                <Row
                  label="Current"
                  value={`${Math.round((num(state, 'current_temperature', 'current_temp', 'temperature') ?? 0) * 10) / 10}${str(state, 'temperature_unit') ?? '°'}`}
                />
              )}
              {num(state, 'humidity') != null && (
                <Row label="Humidity" value={`${Math.round(num(state, 'humidity')!)}%`} />
              )}
            </>
          )}
          {device.device_type === 'contact_sensor' && (
            <>
              <Row
                label="Contact"
                value={bool(state, 'open', 'contact_open') ? 'Open' : 'Closed'}
              />
              {battery != null && <Row label="Battery" value={`${Math.round(battery)}%`} />}
              {signal != null && <Row label="Link quality" value={String(Math.round(signal))} />}
            </>
          )}
          {device.device_type === 'motion_sensor' && (
            <>
              <Row
                label="Motion"
                value={bool(state, 'motion', 'motion_detected') ? 'Detected' : 'Clear'}
              />
              <Row label="Last motion" value={formatLast(state.last_motion)} />
              {num(state, 'illuminance') != null && (
                <Row label="Illuminance" value={`${Math.round(num(state, 'illuminance')!)} lx`} />
              )}
              {num(state, 'temperature') != null && (
                <Row
                  label="Temperature"
                  value={`${Math.round((num(state, 'temperature') ?? 0) * 10) / 10}°`}
                />
              )}
              {battery != null && <Row label="Battery" value={`${Math.round(battery)}%`} />}
              {signal != null && <Row label="Link quality" value={String(Math.round(signal))} />}
            </>
          )}
          {device.device_type === 'environment_sensor' && (
            <>
              {num(state, 'temperature', 'temp') != null && (
                <Row
                  label="Temperature"
                  value={`${Math.round((num(state, 'temperature', 'temp') ?? 0) * 10) / 10}°`}
                />
              )}
              {num(state, 'humidity') != null && (
                <Row label="Humidity" value={`${Math.round(num(state, 'humidity')!)}%`} />
              )}
              {bool(state, 'smoke') != null && (
                <Row label="Smoke" value={bool(state, 'smoke') ? 'Detected' : 'Clear'} />
              )}
              {bool(state, 'co') != null && (
                <Row label="CO" value={bool(state, 'co') ? 'Detected' : 'Clear'} />
              )}
              {num(state, 'tvoc', 'voc') != null && (
                <Row label="TVOC" value={String(Math.round(num(state, 'tvoc', 'voc')!))} />
              )}
              {num(state, 'pressure') != null && (
                <Row label="Pressure" value={`${Math.round(num(state, 'pressure')!)}`} />
              )}
              {battery != null && <Row label="Battery" value={`${Math.round(battery)}%`} />}
              {signal != null && <Row label="Link quality" value={String(Math.round(signal))} />}
            </>
          )}
          {device.device_type === 'blinds' && (
            <>
              {num(state, 'position', 'current_position') != null && (
                <Row label="Position" value={`${Math.round(num(state, 'position', 'current_position')!)}%`} />
              )}
              {num(state, 'tilt', 'tilt_position') != null && (
                <Row label="Tilt" value={`${Math.round(num(state, 'tilt', 'tilt_position')!)}°`} />
              )}
            </>
          )}
          {device.device_type === 'camera' && (
            <>
              <Row label="Recording" value={bool(state, 'recording') ? 'Yes' : 'No'} />
              <Row label="Streaming" value={bool(state, 'streaming') ? 'Yes' : 'No'} />
              <Row label="Night vision" value={bool(state, 'night_vision') ? 'On' : 'Off'} />
              <Row
                label="Motion"
                value={bool(state, 'motion_detected') ? 'Detected' : 'None'}
              />
              <Row label="Last motion" value={formatLast(state.last_motion)} />
            </>
          )}
          {device.device_type === 'fan' && (
            <>
              <Row label="Power" value={bool(state, 'on') ? 'On' : 'Off'} />
              {num(state, 'speed') != null && (
                <Row
                  label="Speed"
                  value={
                    num(state, 'max_speed') != null
                      ? `${Math.round(num(state, 'speed')!)}/${Math.round(num(state, 'max_speed')!)}`
                      : String(Math.round(num(state, 'speed')!))
                  }
                />
              )}
            </>
          )}
          {device.device_type === 'garage_door' && (
            <>
              <Row label="Door" value={bool(state, 'open') ? 'Open' : 'Closed'} />
              {bool(state, 'obstruction') && (
                <Row label="Obstruction" value="Detected" />
              )}
            </>
          )}
          {device.device_type === 'doorbell' && (
            <>
              <Row label="Ringing" value={bool(state, 'ringing') ? 'Yes' : 'No'} />
              <Row
                label="Motion"
                value={bool(state, 'motion_detected') ? 'Detected' : 'None'}
              />
              <Row label="Last ring" value={formatLast(state.last_ring)} />
              {battery != null && <Row label="Battery" value={`${Math.round(battery)}%`} />}
            </>
          )}
        </div>

        {device.supports != null && device.supports.length > 0 && (
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            <span className="text-[var(--text-secondary)]">Capabilities</span>{' '}
            {device.supports.join(', ')}
          </p>
        )}

        {(device.manufacturer || device.model || device.protocol) && (
          <div className="mt-4 space-y-1 text-xs text-[var(--text-muted)]">
            {device.manufacturer && (
              <p>
                <span className="text-[var(--text-secondary)]">Manufacturer</span> {device.manufacturer}
              </p>
            )}
            {device.model && (
              <p>
                <span className="text-[var(--text-secondary)]">Model</span> {device.model}
              </p>
            )}
            {device.protocol && (
              <p>
                <span className="text-[var(--text-secondary)]">Protocol</span> {device.protocol}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 font-mono text-[10px] text-[var(--text-muted)]">{device.device_id}</p>
      </div>
    </div>
  );
}
