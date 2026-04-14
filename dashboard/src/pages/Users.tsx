import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';

interface UserRow {
  user_id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'member' | 'guest';
  created_at: string;
}

interface SessionRow {
  token: string;
  user_id: string;
  interface: string;
  issued_at: string;
  expires_at: string;
}

export default function Users() {
  const role = useAuthStore((s) => s.user?.role);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplay, setFormDisplay] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'member' | 'guest'>('member');
  const [formPin, setFormPin] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'member' | 'guest'>('member');
  const [editDisplay, setEditDisplay] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<UserRow[]>('/users'),
      api.get<SessionRow[]>('/users/sessions'),
    ])
      .then(([u, s]) => {
        setUsers(u);
        setSessions(s);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [role]);

  const submitAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        username: formUsername,
        display_name: formDisplay || formUsername,
        role: formRole,
        pin: formPin,
      };
      if (formRole === 'admin' && formPassword) body.password = formPassword;
      await api.post('/users', body);
      setAddOpen(false);
      setFormUsername('');
      setFormDisplay('');
      setFormRole('member');
      setFormPin('');
      setFormPassword('');
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/users/${editUser.user_id}`, {
        display_name: editDisplay,
        role: editRole,
      });
      setEditUser(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (u: UserRow) => {
    if (!confirm(`Delete user ${u.username}?`)) return;
    setError(null);
    try {
      await api.delete(`/users/${u.user_id}`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const revokeSession = async (token: string) => {
    if (!confirm('Revoke this session?')) return;
    await api.delete(`/users/sessions/${encodeURIComponent(token)}`);
    load();
  };

  if (role !== 'admin') {
    return (
      <div className="p-6 text-[var(--text-secondary)]">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Users</h1>
        <p className="mt-2">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 text-[var(--text-primary)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Users</h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Add User
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading && <p className="text-[var(--text-secondary)]">Loading…</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Display name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">{u.username}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{u.display_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-[var(--bg-card-active)] px-2 py-0.5 text-xs capitalize text-[var(--accent)]">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditUser(u);
                        setEditRole(u.role);
                        setEditDisplay(u.display_name);
                      }}
                      className="mr-2 text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUser(u)}
                      className="text-[var(--danger)] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Active sessions</h2>
      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Interface</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.token} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                    {s.user_id}
                  </td>
                  <td className="px-4 py-3">{s.interface}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {new Date(s.issued_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {new Date(s.expires_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => revokeSession(s.token)}
                      className="text-[var(--danger)] hover:underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Add User</h2>
            <label className="mt-4 block text-sm text-[var(--text-secondary)]">
              Username
              <input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-secondary)]">
              Display name
              <input
                value={formDisplay}
                onChange={(e) => setFormDisplay(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-secondary)]">
              Role
              <select
                value={formRole}
                onChange={(e) =>
                  setFormRole(e.target.value as 'admin' | 'member' | 'guest')
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="guest">guest</option>
              </select>
            </label>
            <label className="mt-3 block text-sm text-[var(--text-secondary)]">
              PIN
              <input
                type="password"
                value={formPin}
                onChange={(e) => setFormPin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            {formRole === 'admin' && (
              <label className="mt-3 block text-sm text-[var(--text-secondary)]">
                Password
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                />
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !formUsername.trim() || !formPin}
                onClick={submitAdd}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Edit {editUser.username}</h2>
            <label className="mt-4 block text-sm text-[var(--text-secondary)]">
              Display name
              <input
                value={editDisplay}
                onChange={(e) => setEditDisplay(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="mt-3 block text-sm text-[var(--text-secondary)]">
              Role
              <select
                value={editRole}
                onChange={(e) =>
                  setEditRole(e.target.value as 'admin' | 'member' | 'guest')
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="guest">guest</option>
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveEdit}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
