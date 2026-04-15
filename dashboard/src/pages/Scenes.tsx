import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Spinner } from '../components/Spinner';

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

/** Stored as plain strings (emoji / symbol); shown on scene cards and in this picker. */
const SCENE_ICON_CHOICES: { value: string; label: string }[] = [
  { value: '◆', label: 'Diamond' },
  { value: '🏠', label: 'Home' },
  { value: '☀️', label: 'Day' },
  { value: '🌙', label: 'Night' },
  { value: '💡', label: 'Lights' },
  { value: '🛋️', label: 'Living room' },
  { value: '🍳', label: 'Kitchen' },
  { value: '🛏️', label: 'Bedroom' },
  { value: '🎬', label: 'Movie' },
  { value: '🌿', label: 'Relax' },
  { value: '🔒', label: 'Away' },
  { value: '🎉', label: 'Party' },
  { value: '✨', label: 'Accent' },
  { value: '🌅', label: 'Wake' },
  { value: '🌆', label: 'Evening' },
];

const DEFAULT_SCENE_ICON = SCENE_ICON_CHOICES[0]!.value;

function resolveSceneIcon(value: string): string {
  return SCENE_ICON_CHOICES.some((c) => c.value === value) ? value : DEFAULT_SCENE_ICON;
}

export default function Scenes() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [rooms, setRooms] = useState<{ room_id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureName, setCaptureName] = useState('');
  const [captureIcon, setCaptureIcon] = useState(DEFAULT_SCENE_ICON);
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

  const activate = async (id: string) => {
    await api.post(`/scenes/${id}/activate`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this scene?')) return;
    await api.delete(`/scenes/${id}`);
    load();
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
        icon: resolveSceneIcon(captureIcon),
        scope,
        transition_seconds: 0,
      });
      setCaptureOpen(false);
      setCaptureName('');
      setCaptureIcon(DEFAULT_SCENE_ICON);
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
        <button
          type="button"
          onClick={() => {
            setCaptureIcon((prev) => resolveSceneIcon(prev));
            setCaptureOpen(true);
          }}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Create Scene
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading && <Spinner />}

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

      {captureOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Create Scene</h2>
            <label className="mt-4 block text-base text-[var(--text-secondary)]">
              Name
              <input
                value={captureName}
                onChange={(e) => setCaptureName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-base text-[var(--text-primary)]"
              />
            </label>
            <label className="mt-3 block text-base text-[var(--text-secondary)]">
              Icon
              <select
                value={resolveSceneIcon(captureIcon)}
                onChange={(e) => setCaptureIcon(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-base text-[var(--text-primary)] select-chevron"
              >
                {SCENE_ICON_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} {c.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-4 text-base text-[var(--text-secondary)]">Capturing…</p>
            <div className="mt-2 flex flex-wrap gap-4 text-base">
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
                className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-base text-[var(--text-primary)] select-chevron"
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
                    className="flex cursor-pointer items-center gap-2 text-base"
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
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-base text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !captureName.trim() || (captureScope === 'devices' && captureDeviceIds.size === 0)}
                onClick={submitCapture}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-base font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
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
