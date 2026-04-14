import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Scene {
  scene_id: string;
  name: string;
  icon: string;
  snapshot: Record<string, Record<string, unknown>>;
  transition_seconds: number;
}

interface DeviceRow {
  device_id: string;
  name: string;
  state: Record<string, unknown>;
}

export default function Scenes() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [rooms, setRooms] = useState<{ room_id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createIcon, setCreateIcon] = useState('scene');
  const [createSnapshot, setCreateSnapshot] = useState<Record<string, Record<string, unknown>>>({});
  const [captureName, setCaptureName] = useState('');
  const [captureIcon, setCaptureIcon] = useState('scene');
  const [captureScope, setCaptureScope] = useState<'all' | 'room' | 'devices'>('all');
  const [captureDeviceIds, setCaptureDeviceIds] = useState<Set<string>>(new Set());
  const [captureRoomId, setCaptureRoomId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<{ scenes: Scene[]; active_scene_id: string | null }>('/scenes'),
      api.get<DeviceRow[]>('/devices'),
      api.get<{ room_id: string; name: string }[]>('/rooms'),
    ])
      .then(([sc, dev, rm]) => {
        setScenes(sc.scenes);
        setActiveSceneId(sc.active_scene_id);
        setDevices(dev);
        setRooms(rm);
        if (rm.length && !captureRoomId) setCaptureRoomId(rm[0].room_id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const deviceCount = (s: Scene) => Object.keys(s.snapshot || {}).length;

  const toggleDeviceInSnapshot = (deviceId: string, on: boolean) => {
    setCreateSnapshot((prev) => {
      const next = { ...prev };
      if (on) {
        const d = devices.find((x) => x.device_id === deviceId);
        next[deviceId] = d?.state ? { ...d.state } : {};
      } else {
        delete next[deviceId];
      }
      return next;
    });
  };

  const activate = async (id: string) => {
    await api.post(`/scenes/${id}/activate`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this scene?')) return;
    await api.delete(`/scenes/${id}`);
    load();
  };

  const submitCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/scenes', {
        name: createName,
        icon: createIcon,
        snapshot: createSnapshot,
        transition_seconds: 0,
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateIcon('scene');
      setCreateSnapshot({});
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const submitCapture = async () => {
    setSaving(true);
    setError(null);
    try {
      const scope =
        captureScope === 'room' && captureRoomId
          ? { room_id: captureRoomId }
          : captureScope === 'devices' && captureDeviceIds.size > 0
            ? { device_ids: [...captureDeviceIds] }
            : {};
      await api.post('/scenes/capture', {
        name: captureName,
        icon: captureIcon,
        scope,
        transition_seconds: 0,
      });
      setCaptureOpen(false);
      setCaptureName('');
      setCaptureIcon('scene');
      setCaptureScope('all');
      setCaptureDeviceIds(new Set());
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full p-6 text-[var(--text-primary)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Scenes</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCreateSnapshot({});
              setCreateOpen(true);
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            Create Scene
          </button>
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-card-active)]"
          >
            Capture Current
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading && <p className="text-[var(--text-secondary)]">Loading…</p>}

      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s) => {
            const active = s.scene_id === activeSceneId;
            return (
              <div
                key={s.scene_id}
                className={`flex flex-col rounded-xl border bg-[var(--bg-card)] p-4 ${
                  active
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent-glow)]'
                    : 'border-[var(--border)]'
                }`}
              >
                <div className="text-2xl" aria-hidden>
                  {s.icon || '◆'}
                </div>
                <h2 className="mt-2 font-semibold">{s.name}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {deviceCount(s)} device{deviceCount(s) === 1 ? '' : 's'}
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => activate(s.scene_id)}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)]"
                  >
                    Activate
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.scene_id)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--bg-card-active)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Create Scene</h2>
            <label className="mt-4 block text-sm text-[var(--text-secondary)]">
              Name
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-secondary)]">
              Icon (name or emoji)
              <input
                value={createIcon}
                onChange={(e) => setCreateIcon(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <p className="mt-4 text-sm font-medium text-[var(--text-secondary)]">Devices</p>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
              {devices.map((d) => (
                <label
                  key={d.device_id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!!createSnapshot[d.device_id]}
                    onChange={(e) => toggleDeviceInSnapshot(d.device_id, e.target.checked)}
                  />
                  <span className="text-[var(--text-primary)]">{d.name}</span>
                  <span className="text-[var(--text-muted)]">{d.device_id}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !createName.trim()}
                onClick={submitCreate}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {captureOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Capture Current</h2>
            <label className="mt-4 block text-sm text-[var(--text-secondary)]">
              Name
              <input
                value={captureName}
                onChange={(e) => setCaptureName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-secondary)]">
              Icon
              <input
                value={captureIcon}
                onChange={(e) => setCaptureIcon(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <p className="mt-4 text-sm text-[var(--text-secondary)]">Scope</p>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={captureScope === 'all'}
                  onChange={() => setCaptureScope('all')}
                />
                All devices
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={captureScope === 'room'}
                  onChange={() => setCaptureScope('room')}
                />
                Room
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={captureScope === 'devices'}
                  onChange={() => setCaptureScope('devices')}
                />
                Select devices
              </label>
            </div>
            {captureScope === 'room' && (
              <select
                value={captureRoomId}
                onChange={(e) => setCaptureRoomId(e.target.value)}
                className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              >
                {rooms.map((r) => (
                  <option key={r.room_id} value={r.room_id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            {captureScope === 'devices' && (
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                {devices.map((d) => (
                  <label
                    key={d.device_id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={captureDeviceIds.has(d.device_id)}
                      onChange={(e) => {
                        setCaptureDeviceIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.device_id);
                          else next.delete(d.device_id);
                          return next;
                        });
                      }}
                    />
                    <span className="text-[var(--text-primary)]">{d.name}</span>
                    <span className="text-[var(--text-muted)]">{d.device_id}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCaptureOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !captureName.trim() || (captureScope === 'devices' && captureDeviceIds.size === 0)}
                onClick={submitCapture}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
