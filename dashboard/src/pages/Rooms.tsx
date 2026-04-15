import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Spinner } from '../components/Spinner';
import { useAuthStore } from '../stores/auth-store';
import { useDeviceStore } from '../stores/device-store';
import { PencilIcon, TrashIcon } from '../components/action-icons';
import DeviceCard, { type DeviceCardDevice } from '../components/DeviceCard';

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
  supports?: string[];
  state: Record<string, unknown>;
};

function toCardDevice(d: HubDevice, onlineOverride?: boolean): DeviceCardDevice {
  const allowed: DeviceCardDevice['device_type'][] = [
    'light',
    'switch',
    'lock',
    'thermostat',
    'contact_sensor',
    'motion_sensor',
    'environment_sensor',
    'blinds',
    'camera',
    'fan',
    'garage_door',
    'doorbell',
  ];
  const dt = allowed.includes(d.device_type as DeviceCardDevice['device_type'])
    ? (d.device_type as DeviceCardDevice['device_type'])
    : 'light';
  return {
    device_id: d.device_id,
    device_type: dt,
    name: d.name,
    online: onlineOverride ?? d.online,
    supports: d.supports,
  };
}

function mergedState(
  device: HubDevice,
  storeSlice: Record<string, unknown> | undefined
): Record<string, unknown> {
  return { ...(device.state ?? {}), ...(storeSlice ?? {}) };
}

export default function Rooms() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFloor, setNewFloor] = useState('');
  const [creating, setCreating] = useState(false);

  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editName, setEditName] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const states = useDeviceStore((s) => s.states);
  const availability = useDeviceStore((s) => s.availability);
  const updateDeviceState = useDeviceStore((s) => s.updateDeviceState);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomList, deviceList] = await Promise.all([
        api.get<Room[]>('/rooms'),
        api.get<HubDevice[]>('/devices'),
      ]);
      setRooms(roomList);
      setDevices(deviceList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countByRoom = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of devices) {
      if (!d.room_id) continue;
      m.set(d.room_id, (m.get(d.room_id) ?? 0) + 1);
    }
    return m;
  }, [devices]);

  const devicesInRoom = useMemo(() => {
    if (!selectedId) return [];
    return devices.filter((d) => d.room_id === selectedId);
  }, [devices, selectedId]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.room_id === selectedId) ?? null,
    [rooms, selectedId]
  );

  const handleCommand = useCallback(
    async (deviceId: string, action: string, properties: Record<string, unknown>) => {
      updateDeviceState(deviceId, properties);
      try {
        await api.post(`/devices/${deviceId}/command`, { action, properties });
      } catch {
        load();
      }
    },
    [updateDeviceState, load]
  );

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post<Room>('/rooms', { name: newName.trim(), floor: newFloor.trim() });
      setNewName('');
      setNewFloor('');
      setAddRoomOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRoom || !editName.trim()) return;
    setEditBusy(true);
    try {
      await api.put(`/rooms/${editRoom.room_id}`, {
        name: editName.trim(),
        floor: editFloor.trim(),
      });
      setEditRoom(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update room');
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRoom) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/rooms/${deleteRoom.room_id}`);
      if (selectedId === deleteRoom.room_id) setSelectedId(null);
      setDeleteRoom(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete room');
    } finally {
      setDeleteBusy(false);
    }
  };

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort((a, b) => {
        const fa = a.floor || '';
        const fb = b.floor || '';
        if (fa !== fb) return fa.localeCompare(fb);
        return a.name.localeCompare(b.name);
      }),
    [rooms]
  );

  if (loading && !rooms.length) {
    return <Spinner />;
  }

  return (
    <div className="min-h-full bg-[var(--bg-primary)] p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Rooms</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {rooms.length} room{rooms.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddRoomOpen(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Add Room
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedRooms.map((r) => {
          const count = countByRoom.get(r.room_id) ?? 0;
          const active = selectedId === r.room_id;
          return (
            <div
              key={r.room_id}
              className={[
                'relative rounded-xl border p-4 transition-colors',
                active
                  ? 'border-[var(--accent)] bg-[var(--bg-card-active)]'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]',
              ].join(' ')}
            >
              <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 sm:right-3 sm:top-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditRoom(r);
                    setEditName(r.name);
                    setEditFloor(r.floor);
                  }}
                  title="Edit room"
                  className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
                >
                  <PencilIcon />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setDeleteRoom(r)}
                    title="Delete room"
                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedId((id) => (id === r.room_id ? null : r.room_id))}
                className="w-full pr-14 text-left sm:pr-16"
              >
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{r.name}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {count} device{count === 1 ? '' : 's'}
                  {r.floor ? ` · Floor ${r.floor}` : ''}
                </p>
              </button>
            </div>
          );
        })}
      </div>

      {selectedRoom && devicesInRoom.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-medium text-[var(--text-primary)]">
            Devices in {selectedRoom.name}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {devicesInRoom.map((d) => {
              const storeState = states[d.device_id];
              const liveOnline = availability[d.device_id];
              const online = liveOnline !== undefined ? liveOnline : d.online;
              return (
                <DeviceCard
                  key={d.device_id}
                  device={toCardDevice(d, online)}
                  state={mergedState(d, storeState)}
                  onCommand={(action, properties) =>
                    handleCommand(d.device_id, action, properties)
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {selectedRoom && devicesInRoom.length === 0 && (
        <div className="mt-8 rounded-xl border border-[var(--border)] border-dashed bg-[var(--bg-secondary)] px-4 py-8 text-center text-[var(--text-secondary)]">
          No devices in {selectedRoom.name}.
        </div>
      )}

      {addRoomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-room-title"
        >
          <form
            onSubmit={createRoom}
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
          >
            <h2 id="add-room-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Add room
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                  placeholder="Living room"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Floor</label>
                <input
                  value={newFloor}
                  onChange={(e) => setNewFloor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                  placeholder="1"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddRoomOpen(false);
                  setNewName('');
                  setNewFloor('');
                }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {creating ? 'Adding…' : 'Add Room'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={saveEdit}
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Edit room</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Floor</label>
                <input
                  value={editFloor}
                  onChange={(e) => setEditFloor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditRoom(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editBusy}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {editBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Delete room</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Delete &ldquo;{deleteRoom.name}&rdquo;? Devices in this room will become unassigned.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRoom(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
                className="rounded-lg bg-[var(--danger)] px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
