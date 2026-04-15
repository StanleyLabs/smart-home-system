import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { RoomListItem } from '../lib/hub-types';
import { subscribe } from '../lib/mqtt';
import { PencilIcon, TrashIcon } from './action-icons';

export type SetupQueueEntry = {
  entry_id: string;
  name: string;
  room_id: string | null;
  device_type: string;
  protocol: string;
  setup_payload: string;
  manufacturer: string;
  model: string;
  status: 'waiting' | 'connecting' | 'online' | 'failed';
  device_id: string | null;
  error: string | null;
  created_at: string;
};

const PROTOCOL_LABELS: Record<string, string> = {
  matter: 'Matter',
  zigbee: 'Zigbee',
  zwave: 'Z-Wave',
};

const QUEUE_STATUS: Record<SetupQueueEntry['status'], { label: string; color: string }> = {
  waiting: { label: 'Waiting', color: 'var(--text-muted)' },
  connecting: { label: 'Connecting', color: 'var(--accent)' },
  online: { label: 'Online', color: 'var(--success)' },
  failed: { label: 'Failed', color: 'var(--danger)' },
};

function QueueStatusBadge({ status }: { status: SetupQueueEntry['status'] }) {
  const cfg = QUEUE_STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: cfg.color, backgroundColor: `color-mix(in srgb, ${cfg.color} 12%, transparent)` }}
    >
      {status === 'connecting' && (
        <span className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {status === 'online' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {cfg.label}
    </span>
  );
}

type Props = {
  rooms: RoomListItem[];
  onWaitingCountChange?: (count: number) => void;
};

export default function SetupQueuePanel({ rooms, onWaitingCountChange }: Props) {
  const [queue, setQueue] = useState<SetupQueueEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const onWaitingRef = useRef(onWaitingCountChange);

  useEffect(() => {
    onWaitingRef.current = onWaitingCountChange;
  }, [onWaitingCountChange]);

  useEffect(() => {
    api.get<SetupQueueEntry[]>('/setup-queue').then(setQueue).catch(() => {});
  }, []);

  useEffect(() => {
    const n = queue.filter((e) => e.status === 'waiting' || e.status === 'connecting').length;
    onWaitingRef.current?.(n);
  }, [queue]);

  useEffect(() => {
    const unsub = subscribe('home/system/events', (_topic, message) => {
      const p = message.payload;
      const event = typeof p?.event === 'string' ? p.event : undefined;
      if (!event?.startsWith('setup_queue_entry_') || !p) return;

      setQueue((prev) => {
        if (event === 'setup_queue_entry_added') {
          const entry = p as unknown as SetupQueueEntry & { event: string };
          if (prev.some((e) => e.entry_id === entry.entry_id)) return prev;
          return [...prev, entry];
        }
        if (event === 'setup_queue_entry_updated') {
          const entry = p as unknown as SetupQueueEntry & { event: string };
          return prev.map((e) => (e.entry_id === entry.entry_id ? { ...e, ...entry } : e));
        }
        if (event === 'setup_queue_entry_removed') {
          const id = p.entry_id;
          return prev.filter((e) => e.entry_id !== id);
        }
        return prev;
      });
    });
    return unsub;
  }, []);

  const roomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.room_id, r.name);
    return m;
  }, [rooms]);

  const onlineQueue = queue.filter((e) => e.status === 'online');

  const startEdit = useCallback((entry: SetupQueueEntry) => {
    setEditingId(entry.entry_id);
    setEditName(entry.name);
    setEditRoom(entry.room_id ?? '');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) return;
    try {
      const updated = await api.put<SetupQueueEntry>(`/setup-queue/${editingId}`, {
        name: editName.trim(),
        room_id: editRoom || null,
      });
      setQueue((prev) => prev.map((e) => (e.entry_id === editingId ? { ...e, ...updated } : e)));
    } catch {
      /* ignore */
    }
    setEditingId(null);
  }, [editingId, editName, editRoom]);

  const removeQueueEntry = useCallback(async (id: string) => {
    setQueue((prev) => prev.filter((e) => e.entry_id !== id));
    await api.delete(`/setup-queue/${id}`).catch(() => {});
  }, []);

  const cancelConnectingEntry = useCallback(async (id: string) => {
    setQueue((prev) =>
      prev.map((e) =>
        e.entry_id === id ? { ...e, status: 'waiting' as const, error: null } : e
      )
    );
    await api.post(`/setup-queue/${id}/cancel`).catch(() => {});
  }, []);

  const retryQueueEntry = useCallback(async (id: string) => {
    setQueue((prev) =>
      prev.map((e) => (e.entry_id === id ? { ...e, status: 'waiting' as const, error: null } : e))
    );
    await api.post(`/setup-queue/${id}/retry`).catch(() => {});
  }, []);

  const clearCompleted = useCallback(async () => {
    setQueue((prev) => prev.filter((e) => e.status !== 'online'));
    await api.post('/setup-queue/clear-completed').catch(() => {});
  }, []);

  if (queue.length === 0) {
    return null;
  }

  return (
    <section id="setup-queue" className="mb-6 scroll-mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Setup Queue</h2>
        {onlineQueue.length > 0 && (
          <button
            type="button"
            onClick={clearCompleted}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            Clear completed
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {queue.map((entry) => {
          const isEditing = editingId === entry.entry_id;

          if (isEditing) {
            return (
              <div
                key={entry.entry_id}
                className="rounded-xl border border-[var(--accent)]/30 bg-[var(--bg-primary)] p-3"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  placeholder="Device name"
                  className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
                <select
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                  className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                >
                  <option value="">No room</option>
                  {rooms.map((r) => (
                    <option key={r.room_id} value={r.room_id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={!editName.trim()}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={entry.entry_id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{entry.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {entry.room_id && roomMap.has(entry.room_id) ? roomMap.get(entry.room_id) : 'No room'}
                  {' · '}
                  {PROTOCOL_LABELS[entry.protocol] ?? entry.protocol}
                </p>
                {entry.error && <p className="mt-0.5 text-[10px] leading-tight text-[var(--danger)]">{entry.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1">
                    {(entry.status === 'failed' || entry.status === 'waiting') && (
                      <button
                        type="button"
                        onClick={() => retryQueueEntry(entry.entry_id)}
                        className="rounded-lg px-1.5 py-1 text-xs text-[var(--accent)] hover:bg-[var(--bg-card-active)]"
                      >
                        {entry.status === 'failed' ? 'Retry' : 'Connect'}
                      </button>
                    )}
                    {entry.status === 'connecting' && (
                      <button
                        type="button"
                        onClick={() => cancelConnectingEntry(entry.entry_id)}
                        className="rounded-lg px-1.5 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-card-active)]"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <QueueStatusBadge status={entry.status} />
                </div>
                {entry.status !== 'connecting' && (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      title="Edit"
                      className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQueueEntry(entry.entry_id)}
                      title="Remove"
                      className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
