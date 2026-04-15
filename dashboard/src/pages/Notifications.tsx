import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface NotificationRow {
  notification_id: string;
  timestamp: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  message: string;
  acknowledged: boolean;
}

function priorityClass(p: NotificationRow['priority']) {
  switch (p) {
    case 'critical':
      return 'text-[var(--danger)]';
    case 'high':
      return 'text-[var(--warning)]';
    case 'normal':
      return 'text-[var(--accent)]';
    default:
      return 'text-[var(--text-muted)]';
  }
}

function priorityBar(p: NotificationRow['priority']) {
  switch (p) {
    case 'critical':
      return 'bg-[var(--danger)]';
    case 'high':
      return 'bg-[var(--warning)]';
    case 'normal':
      return 'bg-[var(--accent)]';
    default:
      return 'bg-[var(--text-muted)]';
  }
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<NotificationRow[]>('/notifications')
      .then((data) => {
        const sorted = [...data].sort((a, b) => {
          if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        setItems(sorted);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, []);

  const acknowledgeOne = async (id: string) => {
    await api.post(`/notifications/${id}/acknowledge`);
    load();
  };

  const acknowledgeAll = async () => {
    await api.post('/notifications/acknowledge-all');
    load();
  };

  return (
    <div className="min-h-full p-6 text-[var(--text-primary)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <button
          type="button"
          onClick={() => acknowledgeAll()}
          disabled={loading || items.every((n) => n.acknowledged)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Acknowledge All
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading && <p className="text-[var(--text-secondary)]">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="text-[var(--text-muted)]">No notifications.</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.notification_id}
            className={`flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 ${
              !n.acknowledged ? 'bg-[var(--bg-card-active)] ring-1 ring-[var(--accent-glow)]' : ''
            }`}
          >
            <div className={`mt-1 h-10 w-1 shrink-0 rounded-full ${priorityBar(n.priority)}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`text-xs font-semibold uppercase ${priorityClass(n.priority)}`}>
                  {n.priority}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {new Date(n.timestamp).toLocaleString()}
                </span>
              </div>
              <h2 className="mt-1 font-medium text-[var(--text-primary)]">{n.title}</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{n.message}</p>
            </div>
            {!n.acknowledged && (
              <button
                type="button"
                onClick={() => acknowledgeOne(n.notification_id)}
                className="h-fit shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:border-[var(--border-hover)]"
              >
                Acknowledge
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
