import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Spinner } from '../components/Spinner';
import { useAuthStore } from '../stores/auth-store';
import { useDeviceStore } from '../stores/device-store';
import AddDeviceWizard from '../components/AddDeviceWizard';
import { PencilIcon, TrashIcon } from '../components/action-icons';
import SetupQueuePanel from '../components/SetupQueuePanel';

type Room = {
  room_id: string;
  name: string;
  floor: string;
};

type HubDevice = {
  device_id: string;
  device_type: string;
  protocol: string;
  name: string;
  room_id: string | null;
  online: boolean;
  manufacturer?: string;
  model?: string;
  supports?: string[];
  state: Record<string, unknown>;
};

/* ── Device type labels & icons ────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  light: 'Light',
  switch: 'Switch',
  lock: 'Lock',
  thermostat: 'Thermostat',
  contact_sensor: 'Contact Sensor',
  motion_sensor: 'Motion Sensor',
  environment_sensor: 'Env Sensor',
  blinds: 'Blinds',
  camera: 'Camera',
  fan: 'Fan',
  garage_door: 'Garage Door',
  doorbell: 'Doorbell',
};

function DeviceTypeIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5 shrink-0';
  const props = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: cls,
  };

  switch (type) {
    case 'light':
      return (
        <svg {...props}>
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </svg>
      );
    case 'switch':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case 'thermostat':
      return (
        <svg {...props}>
          <path d="M12 9V2M8 14.6A4 4 0 1 0 16 14.6" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
      );
    case 'contact_sensor':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="18" rx="1" />
          <rect x="14" y="3" width="7" height="18" rx="1" />
        </svg>
      );
    case 'motion_sensor':
      return (
        <svg {...props}>
          <path d="M2 12a10 10 0 0 1 10-10M6 12a6 6 0 0 1 6-6M10 12a2 2 0 0 1 2-2" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...props}>
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
      );
    case 'fan':
      return (
        <svg {...props}>
          <path d="M12 12c-3-5-8-3-8 0s5 3 8 0zM12 12c5-3 3-8 0-8s-3 5 0 8zM12 12c3 5 8 3 8 0s-5-3-8 0zM12 12c-5 3-3 8 0 8s3-5 0-8z" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case 'garage_door':
      return (
        <svg {...props}>
          <path d="M3 21V8l9-5 9 5v13" />
          <path d="M3 12h18M3 16h18" />
        </svg>
      );
    case 'blinds':
      return (
        <svg {...props}>
          <path d="M3 3h18M3 7h18M3 11h18M3 15h18M3 19h18" />
        </svg>
      );
    case 'doorbell':
      return (
        <svg {...props}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
  }
}

/* ── Edit modal ────────────────────────────────────────────────────── */

function EditDeviceModal({
  device,
  rooms,
  onSave,
  onClose,
}: {
  device: HubDevice;
  rooms: Room[];
  onSave: (id: string, data: { name: string; room_id: string | null }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(device.name);
  const [roomId, setRoomId] = useState(device.room_id ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    onSave(device.device_id, {
      name: name.trim(),
      room_id: roomId || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"
      >
        <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Edit Device</h3>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Room</span>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Unassigned</option>
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Delete confirmation modal ─────────────────────────────────────── */

function DeleteDeviceModal({
  device,
  onConfirm,
  onClose,
}: {
  device: HubDevice;
  onConfirm: (id: string) => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl"
      >
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Delete Device</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Are you sure you want to remove <span className="font-medium text-[var(--text-primary)]">{device.name}</span>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              onConfirm(device.device_id);
            }}
            className="rounded-lg bg-[var(--danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sort types ────────────────────────────────────────────────────── */

type SortKey = 'name' | 'type' | 'room' | 'status';
type SortDir = 'asc' | 'desc';

function SortArrow({ dir, active }: { dir: SortDir; active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={[
        'ml-0.5 inline-block transition-transform',
        active ? 'text-[var(--text-primary)]' : 'text-transparent',
        dir === 'desc' ? 'rotate-180' : '',
      ].join(' ')}
    >
      <path d="M6 3l3 4H3l3-4z" fill="currentColor" />
    </svg>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */

export default function Devices() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [queueWaiting, setQueueWaiting] = useState(0);

  const [editDevice, setEditDevice] = useState<HubDevice | null>(null);
  const [deleteDevice, setDeleteDevice] = useState<HubDevice | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const availability = useDeviceStore((s) => s.availability);

  const roomMap = new Map(rooms.map((r) => [r.room_id, r.name]));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedDevices = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...devices].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'type': {
          const ta = TYPE_LABELS[a.device_type] ?? a.device_type;
          const tb = TYPE_LABELS[b.device_type] ?? b.device_type;
          cmp = ta.localeCompare(tb);
          break;
        }
        case 'room': {
          const ra = (a.room_id ? roomMap.get(a.room_id) : null) ?? '';
          const rb = (b.room_id ? roomMap.get(b.room_id) : null) ?? '';
          cmp = ra.localeCompare(rb);
          break;
        }
        case 'status': {
          const oa = availability[a.device_id] ?? a.online;
          const ob = availability[b.device_id] ?? b.online;
          cmp = (oa === ob) ? 0 : oa ? -1 : 1;
          break;
        }
      }
      return cmp * mul;
    });
  }, [devices, sortKey, sortDir, availability, roomMap]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deviceList, roomList] = await Promise.all([
        api.get<HubDevice[]>('/devices'),
        api.get<Room[]>('/rooms'),
      ]);
      setDevices(deviceList);
      setRooms(roomList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEdit(id: string, data: { name: string; room_id: string | null }) {
    try {
      await api.put(`/devices/${id}`, data);
      setEditDevice(null);
      load();
    } catch {
      setError('Failed to update device');
      setEditDevice(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/devices/${id}`);
      setDeleteDevice(null);
      load();
    } catch {
      setError('Failed to delete device');
      setDeleteDevice(null);
    }
  }

  if (loading && !devices.length) {
    return <Spinner />;
  }

  return (
    <div className="min-h-full bg-[var(--bg-primary)] p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Devices</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {devices.length} device{devices.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            Add Device
          </button>
        )}
      </div>

      {isAdmin && queueWaiting > 0 && (
        <button
          type="button"
          onClick={() => document.getElementById('setup-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3 text-left transition-colors hover:bg-[var(--accent)]/10"
        >
          <div className="relative h-5 w-5 shrink-0">
            <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            </div>
          </div>
          <span className="text-sm text-[var(--text-primary)]">
            <span className="font-medium">{queueWaiting} device{queueWaiting !== 1 ? 's' : ''}</span>
            <span className="text-[var(--text-secondary)]"> waiting to connect</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto shrink-0 text-[var(--text-muted)]">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {isAdmin && (
        <SetupQueuePanel rooms={rooms} onWaitingCountChange={setQueueWaiting} />
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* ── Device list ────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        {/* Header row */}
        <div className="hidden items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-card-active)] px-4 py-2.5 text-xs font-medium text-[var(--text-muted)] sm:flex">
          <span className="w-6" />
          <button type="button" onClick={() => toggleSort('name')} className="flex flex-1 items-center gap-0.5 hover:text-[var(--text-primary)]">
            Name <SortArrow dir={sortDir} active={sortKey === 'name'} />
          </button>
          <button type="button" onClick={() => toggleSort('type')} className="flex w-28 items-center gap-0.5 hover:text-[var(--text-primary)]">
            Type <SortArrow dir={sortDir} active={sortKey === 'type'} />
          </button>
          <button type="button" onClick={() => toggleSort('room')} className="flex w-28 items-center gap-0.5 hover:text-[var(--text-primary)]">
            Room <SortArrow dir={sortDir} active={sortKey === 'room'} />
          </button>
          <button type="button" onClick={() => toggleSort('status')} className="flex w-20 items-center justify-center gap-0.5 hover:text-[var(--text-primary)]">
            Status <SortArrow dir={sortDir} active={sortKey === 'status'} />
          </button>
        </div>

        {sortedDevices.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No devices yet
          </div>
        )}

        {sortedDevices.map((d, i) => {
          const online = availability[d.device_id] !== undefined
            ? availability[d.device_id]
            : d.online;
          const room = d.room_id ? roomMap.get(d.room_id) : null;
          const typeLabel = TYPE_LABELS[d.device_type] ?? d.device_type;
          const meta = [d.manufacturer, d.model].filter(Boolean).join(' · ');

          return (
            <div
              key={d.device_id}
              className={[
                'relative border-b border-[var(--border)] px-4 py-3',
                i === sortedDevices.length - 1 ? 'border-b-0' : '',
              ].join(' ')}
            >
              <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 sm:right-3 sm:top-2.5">
                <button
                  type="button"
                  onClick={() => setEditDevice(d)}
                  title="Edit device"
                  className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
                >
                  <PencilIcon />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setDeleteDevice(d)}
                    title="Delete device"
                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 pr-14 sm:flex-row sm:items-center sm:gap-3 sm:pr-16">
                {/* Icon */}
                <div className={[
                  'hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  online ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'bg-[var(--bg-card-active)] text-[var(--text-muted)]',
                ].join(' ')}>
                  <DeviceTypeIcon type={d.device_type} />
                </div>

                {/* Name + meta (mobile shows type badge) */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={[
                      'flex sm:hidden h-6 w-6 shrink-0 items-center justify-center rounded-md',
                      online ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'bg-[var(--bg-card-active)] text-[var(--text-muted)]',
                    ].join(' ')}>
                      <DeviceTypeIcon type={d.device_type} />
                    </div>
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {d.name}
                    </p>
                  </div>
                  {meta && (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{meta}</p>
                  )}
                </div>

                {/* Type */}
                <span className="hidden w-28 text-xs text-[var(--text-secondary)] sm:block">
                  {typeLabel}
                </span>

                {/* Room */}
                <span className="hidden w-28 truncate text-xs text-[var(--text-secondary)] sm:block">
                  {room ?? <span className="text-[var(--text-muted)]">—</span>}
                </span>

                {/* Status */}
                <div className="hidden w-20 sm:flex justify-center">
                  <span
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                      online
                        ? 'bg-[var(--success)]/10 text-[var(--success)]'
                        : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]',
                    ].join(' ')}
                  >
                    <span className={[
                      'h-1.5 w-1.5 rounded-full',
                      online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
                    ].join(' ')} />
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Mobile meta row */}
                <div className="flex items-center gap-2 sm:hidden">
                  <span className="text-xs text-[var(--text-muted)]">{typeLabel}</span>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span className="text-xs text-[var(--text-muted)]">{room ?? 'Unassigned'}</span>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span className={[
                    'inline-flex items-center gap-1 text-xs',
                    online ? 'text-[var(--success)]' : 'text-[var(--text-muted)]',
                  ].join(' ')}>
                    <span className={[
                      'h-1.5 w-1.5 rounded-full',
                      online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
                    ].join(' ')} />
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {editDevice && (
        <EditDeviceModal
          device={editDevice}
          rooms={rooms}
          onSave={handleEdit}
          onClose={() => setEditDevice(null)}
        />
      )}

      {deleteDevice && (
        <DeleteDeviceModal
          device={deleteDevice}
          onConfirm={handleDelete}
          onClose={() => setDeleteDevice(null)}
        />
      )}

      {addOpen && (
        <AddDeviceWizard
          rooms={rooms}
          onClose={() => setAddOpen(false)}
          onComplete={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
