import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import type { AuthUser } from '../stores/auth-store';

type LoginResponse = {
  token: string;
  user: AuthUser;
};

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinMode, setPinMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = pinMode
        ? { username, pin }
        : { username, password };
      const res = await api.post<LoginResponse>('/auth/login', body);
      setAuth(res.user, res.token);
      navigate({ to: '/', replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg-primary)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--accent-glow),transparent)]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/30">
              <svg
                className="h-9 w-9 text-[var(--accent)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              Smart Home Hub
            </h1>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              Sign in to manage your home
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-xl shadow-black/20">
            <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="login-user"
                  className="text-sm font-medium text-[var(--text-secondary)]"
                >
                  Username
                </label>
                <input
                  id="login-user"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                />
              </div>

              {pinMode ? (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="login-pin"
                    className="text-sm font-medium text-[var(--text-secondary)]"
                  >
                    PIN
                  </label>
                  <input
                    id="login-pin"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="\d*"
                    autoComplete="one-time-code"
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 12))
                    }
                    required
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-lg tracking-widest text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="login-pass"
                    className="text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Password
                  </label>
                  <input
                    id="login-pass"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPinMode((m) => !m);
                  setError(null);
                }}
                className="text-left text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline"
              >
                {pinMode ? 'Use password instead' : 'Use PIN instead'}
              </button>

              {error && (
                <div
                  className="rounded-lg border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]"
                  role="alert"
                >
                  {/lock|too many|429|temporarily/i.test(error)
                    ? `${error} Try again later or contact an administrator.`
                    : error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-xl bg-[var(--accent)] py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/25 transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
