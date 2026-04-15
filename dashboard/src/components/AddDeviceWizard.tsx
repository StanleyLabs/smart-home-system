import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { subscribe } from '../lib/mqtt';
import { setupPayloadIdentityKey } from '../lib/setup-payload-key';
import type { SetupQueueEntry } from './SetupQueuePanel';

/* ─── Types ──────────────────────────────────────────────────────────── */

type DiscoveredDevice = {
  temp_id: string;
  protocol: string;
  device_type: string;
  manufacturer: string;
  model: string;
  requires_code: boolean;
};

type Room = { room_id: string; name: string };

type CommissionedDevice = {
  device_id: string;
  device_type: string;
  protocol: string;
  name: string;
  manufacturer: string;
  model: string;
};

type CommissioningStatus = 'idle' | 'pairing' | 'configuring' | 'complete' | 'failed';

type View = 'main' | 'manual' | 'pairing' | 'setup';

type Props = {
  rooms: Room[];
  onClose: () => void;
  onComplete: () => void;
};

/* ─── Constants ──────────────────────────────────────────────────────── */

const DEVICE_TYPE_ICONS: Record<string, string> = {
  light: 'M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7zM9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1z',
  switch: 'M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z',
  thermostat: 'M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4z',
  contact_sensor: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h5v8l2.5-1.5L16 12V4h2v16z',
  motion_sensor: 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z',
  environment_sensor: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  blinds: 'M20 19V3H4v16H2v2h20v-2h-2zM6 5h12v2H6V5zm0 4h12v2H6V9zm0 4h12v2H6v-2z',
};

const PROTOCOL_LABELS: Record<string, string> = {
  matter: 'Matter',
  zigbee: 'Zigbee',
  zwave: 'Z-Wave',
};

const PROGRESS_STEPS: { key: CommissioningStatus; label: string }[] = [
  { key: 'pairing', label: 'Pairing' },
  { key: 'configuring', label: 'Configuring' },
  { key: 'complete', label: 'Complete' },
];

/* ─── Helper Components ──────────────────────────────────────────────── */

function DeviceTypeIcon({ type }: { type: string }) {
  const path = DEVICE_TYPE_ICONS[type] ?? DEVICE_TYPE_ICONS.light;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d={path} />
    </svg>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export default function AddDeviceWizard({ rooms, onClose, onComplete }: Props) {
  const [view, setView] = useState<View>('main');

  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  // Manual code form (view: 'manual')
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRoom, setManualRoom] = useState('');
  const [manualExistingEntryId, setManualExistingEntryId] = useState<string | null>(null);

  // Discovery state
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);

  // Commission state (view: 'pairing')
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [pairSetupCode, setPairSetupCode] = useState('');
  const [commissionStatus, setCommissionStatus] = useState<CommissioningStatus>('idle');
  const [commissionError, setCommissionError] = useState<string | null>(null);
  const [commissionedDevice, setCommissionedDevice] = useState<CommissionedDevice | null>(null);

  // Post-commission setup (view: 'setup')
  const [deviceName, setDeviceName] = useState('');
  const [deviceRoom, setDeviceRoom] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Wi-Fi
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  const selectedRef = useRef<DiscoveredDevice | null>(null);
  const scanningStarted = useRef(false);

  /* ── Effects ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (scanningStarted.current) return;
    scanningStarted.current = true;
    api.post('/system/discovery/start').catch(() => {});
    api.get<{ ssid: string | null }>('/system/wifi')
      .then((r) => { if (r.ssid) setWifiSsid(r.ssid); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = subscribe('home/system/events', (_topic, message) => {
      const p = message.payload;
      const event = typeof p?.event === 'string' ? p.event : undefined;
      if (!event || !p) return;

      if (event === 'device_discovered') {
        const d = p as unknown as DiscoveredDevice & { event: string };
        setDiscovered((prev) => {
          if (prev.some((x) => x.temp_id === d.temp_id)) return prev;
          return [...prev, { temp_id: d.temp_id, protocol: d.protocol, device_type: d.device_type, manufacturer: d.manufacturer, model: d.model, requires_code: d.requires_code }];
        });
      }

      if (event === 'commissioning_progress') {
        const status = p.status as CommissioningStatus;
        setCommissionStatus(status);
        if (status === 'failed') {
          setCommissionError(typeof p.error === 'string' ? p.error : 'Commissioning failed');
        }
      }

      if (event === 'commissioning_complete') {
        setCommissionedDevice({
          device_id: String(p.device_id ?? ''),
          device_type: String(p.device_type ?? ''),
          protocol: String(p.protocol ?? ''),
          name: `${String(p.manufacturer ?? '')} ${String(p.model ?? '')}`,
          manufacturer: String(p.manufacturer ?? ''),
          model: String(p.model ?? ''),
        });
      }
    });
    return unsub;
  }, []);

  /* ── Handlers ───────────────────────────────────────────────────────── */

  const handleClose = useCallback(() => {
    api.post('/system/discovery/stop').catch(() => {});
    onClose();
  }, [onClose]);

  const handleDone = useCallback(() => {
    api.post('/system/discovery/stop').catch(() => {});
    onComplete();
  }, [onComplete]);

  const openManualEntry = useCallback(() => {
    setScanError(null);
    setManualCode('');
    setManualName('');
    setManualRoom('');
    setManualExistingEntryId(null);
    setView('manual');
  }, []);

  const lookupManualDuplicate = useCallback(async () => {
    const code = manualCode.trim();
    if (!code) {
      setManualExistingEntryId(null);
      return;
    }
    const key = setupPayloadIdentityKey(code);
    try {
      const list = await api.get<SetupQueueEntry[]>('/setup-queue');
      const existing = list.find((e) => setupPayloadIdentityKey(e.setup_payload) === key);
      if (existing) {
        setManualExistingEntryId(existing.entry_id);
        setManualName(existing.name);
        setManualRoom(existing.room_id ?? '');
      } else {
        setManualExistingEntryId(null);
      }
    } catch {
      setManualExistingEntryId(null);
    }
  }, [manualCode]);

  const handleAddManual = useCallback(async () => {
    const code = manualCode.trim();
    if (!code) return;
    setScanBusy(true);
    setScanError(null);
    try {
      const list = await api.get<SetupQueueEntry[]>('/setup-queue');
      const key = setupPayloadIdentityKey(code);
      const existing = list.find((e) => setupPayloadIdentityKey(e.setup_payload) === key);
      if (existing) {
        await api.put(`/setup-queue/${existing.entry_id}`, {
          name: manualName.trim() || existing.name,
          room_id: manualRoom || null,
        });
      } else {
        await api.post('/setup-queue', {
          setup_payload: code,
          name: manualName || 'New Device',
          room_id: manualRoom || undefined,
        });
      }
      setManualCode('');
      setManualName('');
      setManualRoom('');
      setManualExistingEntryId(null);
      setScanError(null);
      setAddedCount((n) => n + 1);
      setView('main');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to add device');
    } finally {
      setScanBusy(false);
    }
  }, [manualCode, manualName, manualRoom]);

  const handleSelectDevice = useCallback((device: DiscoveredDevice) => {
    setSelectedDevice(device);
    selectedRef.current = device;
    setCommissionStatus('idle');
    setCommissionError(null);
    setCommissionedDevice(null);
    setPairSetupCode('');
    setView('pairing');

    if (!device.requires_code) {
      doCommission(device.temp_id, {});
    }
  }, []);

  const handlePairManualSubmit = useCallback(() => {
    const device = selectedRef.current;
    if (!device || !pairSetupCode.trim()) return;
    const creds: Record<string, string> = { setup_code: pairSetupCode.trim() };
    if (wifiSsid.trim()) creds.wifi_ssid = wifiSsid.trim();
    if (wifiPassword) creds.wifi_password = wifiPassword;
    doCommission(device.temp_id, creds);
  }, [pairSetupCode, wifiSsid, wifiPassword]);

  const doCommission = useCallback(async (tempId: string, credentials: Record<string, unknown>) => {
    setCommissionStatus('idle');
    setCommissionError(null);
    try {
      const device = await api.post<CommissionedDevice>('/system/commission', { temp_id: tempId, credentials });
      setCommissionedDevice(device);
      setDeviceName(`${device.manufacturer} ${device.model}`);
    } catch (err) {
      setCommissionStatus('failed');
      setCommissionError(err instanceof Error ? err.message : 'Commission failed');
    }
  }, []);

  const handleRetryCommission = useCallback(() => {
    const device = selectedRef.current;
    if (!device) return;
    const creds: Record<string, string> = {};
    if (pairSetupCode.trim()) creds.setup_code = pairSetupCode.trim();
    if (wifiSsid.trim()) creds.wifi_ssid = wifiSsid.trim();
    if (wifiPassword) creds.wifi_password = wifiPassword;
    doCommission(device.temp_id, creds);
  }, [pairSetupCode, wifiSsid, wifiPassword, doCommission]);

  const handleSetupSubmit = useCallback(async () => {
    if (!commissionedDevice || !deviceName.trim()) return;
    setSetupBusy(true);
    setSetupError(null);
    try {
      await api.post('/system/setup-device', {
        device_id: commissionedDevice.device_id,
        name: deviceName.trim(),
        room_id: deviceRoom || undefined,
      });
      setView('main');
      setCommissionedDevice(null);
      setSelectedDevice(null);
      setCommissionStatus('idle');
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSetupBusy(false);
    }
  }, [commissionedDevice, deviceName, deviceRoom]);

  /* ── Derived ────────────────────────────────────────────────────────── */

  const progressIndex = PROGRESS_STEPS.findIndex((s) => s.key === commissionStatus);

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-device-title">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 id="add-device-title" className="text-lg font-semibold text-[var(--text-primary)]">Add Device</h2>
          <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* ── Content (scrollable) ────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">

          {/* ════ MAIN VIEW ═══════════════════════════════════════ */}
          {view === 'main' && (
            <div className="space-y-5">
              <button
                type="button"
                onClick={openManualEntry}
                className="flex w-full items-center gap-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-primary)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-active)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="2" />
                    <path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Enter Setup Code</p>
                  <p className="text-xs text-[var(--text-muted)]">Type the code from the device or its packaging</p>
                </div>
              </button>

              <p className="text-center text-xs text-[var(--text-muted)]">
                Queued codes appear on the Devices page under Setup Queue.
              </p>

              {addedCount > 0 && (
                <div className="rounded-xl bg-[var(--success)]/10 px-4 py-2.5 text-center text-sm font-medium text-[var(--success)]">
                  {addedCount} device{addedCount !== 1 ? 's' : ''} added — see Setup Queue on the Devices page
                </div>
              )}

              {/* Discovered devices */}
              {discovered.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Nearby Devices
                  </p>
                  <div className="space-y-1.5">
                    {discovered.map((d) => (
                      <button
                        key={d.temp_id}
                        type="button"
                        onClick={() => handleSelectDevice(d)}
                        className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-active)]"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card-active)] text-[var(--text-secondary)]">
                          <DeviceTypeIcon type={d.device_type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {d.manufacturer} {d.model}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {PROTOCOL_LABELS[d.protocol] ?? d.protocol} &middot; {d.device_type.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-muted)]">
                          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Discovery hint */}
              {discovered.length === 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-primary)] p-4">
                  <div className="relative h-8 w-8 shrink-0">
                    <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-15" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent)]">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M8.1 8.1a5.5 5.5 0 017.8 0M15.9 15.9a5.5 5.5 0 01-7.8 0" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Searching for devices on your network. Devices already powered on and in pairing mode will appear here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════ MANUAL CODE VIEW ═══════════════════════════════ */}
          {view === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">Setup code</label>
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    setManualExistingEntryId(null);
                  }}
                  onBlur={() => lookupManualDuplicate()}
                  placeholder="MT:... or 1234-567-8901"
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-center font-mono text-lg tracking-widest text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <p className="mt-1.5 text-center text-xs text-[var(--text-muted)]">
                  Printed on the device or its packaging
                </p>
              </div>

              {manualExistingEntryId && (
                <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
                  This code is already in your setup queue — name and room are filled in below.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">Device name</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Hallway Motion Sensor"
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">Room</label>
                <select
                  value={manualRoom}
                  onChange={(e) => setManualRoom(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">No room</option>
                  {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.name}</option>)}
                </select>
              </div>

              {scanError && (
                <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
                  {scanError}
                </div>
              )}
            </div>
          )}

          {/* ════ PAIRING VIEW ═══════════════════════════════════ */}
          {view === 'pairing' && selectedDevice && (
            <div className="space-y-4">
              {/* Device info */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-card-active)] text-[var(--text-secondary)]">
                  <DeviceTypeIcon type={selectedDevice.device_type} />
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">
                    {selectedDevice.manufacturer} {selectedDevice.model}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {PROTOCOL_LABELS[selectedDevice.protocol] ?? selectedDevice.protocol} &middot; {selectedDevice.device_type.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>

              {/* Credentials step (if needed and not yet commissioning) */}
              {selectedDevice.requires_code && commissionStatus === 'idle' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">Setup code</label>
                  <input
                    type="text"
                    value={pairSetupCode}
                    onChange={(e) => setPairSetupCode(e.target.value)}
                    placeholder={selectedDevice.protocol === 'matter' ? 'MT:... or 1234-567-8901' : 'Code'}
                    autoFocus
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-center font-mono text-lg tracking-widest text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />

                  {selectedDevice.protocol === 'matter' && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-[var(--text-muted)]">Wi-Fi for new devices</p>
                      <input type="text" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="Wi-Fi SSID" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      <input type="password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} placeholder="Wi-Fi Password" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                    </div>
                  )}
                </div>
              )}

              {/* Commission progress */}
              {commissionStatus !== 'idle' && (
                <div className="space-y-3">
                  {PROGRESS_STEPS.map((ps, i) => {
                    const isActive = commissionStatus === ps.key;
                    const isDone = commissionStatus !== 'failed' && (progressIndex > i || commissionStatus === 'complete');
                    const isFailed = commissionStatus === 'failed' && i === Math.max(0, progressIndex);
                    return (
                      <div key={ps.key} className="flex items-center gap-3">
                        <div className={[
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                          isDone ? 'bg-[var(--success)] text-white'
                            : isFailed ? 'bg-[var(--danger)] text-white'
                            : isActive ? 'bg-[var(--accent)] text-white'
                            : 'border border-[var(--border)] text-[var(--text-muted)]',
                        ].join(' ')}>
                          {isDone ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          ) : isFailed ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                          ) : isActive ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <span>{i + 1}</span>
                          )}
                        </div>
                        <span className={['text-sm', isDone ? 'text-[var(--success)]' : isFailed ? 'text-[var(--danger)]' : isActive ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-muted)]'].join(' ')}>
                          {ps.label}
                        </span>
                      </div>
                    );
                  })}

                  {commissionError && (
                    <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-center text-sm text-[var(--danger)]">
                      {commissionError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════ SETUP VIEW (post-commission) ══════════════════ */}
          {view === 'setup' && commissionedDevice && (
            <div className="space-y-4">
              <div className="flex flex-col items-center">
                <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--success)]/10 text-[var(--success)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="font-medium text-[var(--text-primary)]">Device paired</p>
                <p className="text-xs text-[var(--text-muted)]">{commissionedDevice.manufacturer} {commissionedDevice.model}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">Device name</label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Kitchen Light"
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">Room</label>
                <select
                  value={deviceRoom}
                  onChange={(e) => setDeviceRoom(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">No room</option>
                  {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.name}</option>)}
                </select>
              </div>

              {setupError && <p className="text-sm text-[var(--danger)]">{setupError}</p>}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-6 py-4">

          {view === 'main' && (
            <>
              <span className="text-xs text-[var(--text-muted)]">
                {discovered.length > 0 ? `${discovered.length} nearby` : ''}
              </span>
              <button type="button" onClick={handleDone} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
                Done
              </button>
            </>
          )}

          {view === 'manual' && (
            <>
              <button type="button" onClick={() => setView('main')} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]">
                Back
              </button>
              <button
                type="button"
                onClick={handleAddManual}
                disabled={scanBusy || !manualCode.trim()}
                className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {scanBusy ? 'Saving…' : manualExistingEntryId ? 'Save' : 'Add to Queue'}
              </button>
            </>
          )}

          {view === 'pairing' && (
            <>
              <button
                type="button"
                onClick={() => { setView('main'); setCommissionStatus('idle'); setCommissionError(null); }}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]"
              >
                Back
              </button>
              {selectedDevice?.requires_code && commissionStatus === 'idle' && (
                <button
                  type="button"
                  onClick={handlePairManualSubmit}
                  disabled={!pairSetupCode.trim()}
                  className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  Pair Device
                </button>
              )}
              {commissionStatus === 'failed' && (
                <button type="button" onClick={handleRetryCommission} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
                  Retry
                </button>
              )}
              {commissionStatus === 'complete' && (
                <button type="button" onClick={() => setView('setup')} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
                  Continue
                </button>
              )}
            </>
          )}

          {view === 'setup' && (
            <>
              <button
                type="button"
                onClick={() => {
                  handleSetupSubmit().then(() => {
                    setView('main');
                  });
                }}
                disabled={setupBusy || !deviceName.trim()}
                className="ml-auto rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {setupBusy ? 'Saving...' : 'Done'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
