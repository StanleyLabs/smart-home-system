import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../stores/auth-store';
import { useDeviceStore } from '../stores/device-store';
import { api } from '../lib/api';

const navItems: { to: string; label: string; adminOnly?: boolean }[] = [
  { to: '/', label: 'Home' },
  { to: '/devices', label: 'Devices' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/automations', label: 'Automations' },
  { to: '/scenes', label: 'Scenes' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/users', label: 'Users', adminOnly: true },
  { to: '/settings', label: 'Settings', adminOnly: true },
];

const baseLinkClass =
  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const activeLinkClass = 'bg-[var(--bg-card-active)] text-[var(--text-primary)]';
const inactiveLinkClass =
  'text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]';

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [hubName, setHubName] = useState('Smart Home');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const user = useAuthStore((s) => s.user);
  const theme = useAuthStore((s) => s.theme);
  const setTheme = useAuthStore((s) => s.setTheme);
  const logout = useAuthStore((s) => s.logout);

  const mqttConnected = useDeviceStore((s) => s.mqttConnected);
  const notifications = useDeviceStore((s) => s.notifications);
  const canUndo = useDeviceStore((s) => s.canUndo);
  const canRedo = useDeviceStore((s) => s.canRedo);

  const isAdmin = user?.role === 'admin';
  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);
  const notificationCount = notifications.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<any>('/system/status');
        if (!cancelled && data?.hub_name) setHubName(data.hub_name);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userMenuOpen]);

  const applyTheme = useCallback(
    (t: string) => {
      setTheme(t);
      setUserMenuOpen(false);
    },
    [setTheme],
  );

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate({ to: '/login' });
  };

  const handleUndo = () => {
    if (canUndo) void api.post('/system/undo').catch(() => {});
  };
  const handleRedo = () => {
    if (canRedo) void api.post('/system/redo').catch(() => {});
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] md:flex">
        <div className="border-b border-[var(--border)] px-4 py-4 text-lg font-semibold tracking-tight">
          {hubName}
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {visibleNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={baseLinkClass}
              activeProps={{ className: `${baseLinkClass} ${activeLinkClass}` }}
              inactiveProps={{
                className: `${baseLinkClass} ${inactiveLinkClass}`,
              }}
              activeOptions={{ exact: item.to === '/' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-base font-semibold">{hubName}</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
              title={mqttConnected ? 'Connected' : 'Disconnected'}
            >
              <span
                className={
                  mqttConnected
                    ? 'h-2 w-2 rounded-full bg-[var(--success)]'
                    : 'h-2 w-2 rounded-full bg-[var(--danger)]'
                }
              />
              {mqttConnected ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-active)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={handleRedo}
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-active)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Redo
            </button>
            <Link
              to="/notifications"
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-active)]"
              aria-label="Notifications"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </Link>

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm hover:bg-[var(--bg-card-active)]"
              >
                <span className="hidden max-w-[10rem] truncate sm:inline">
                  {user?.display_name ?? user?.username ?? 'Account'}
                </span>
                <svg
                  className="h-4 w-4 text-[var(--text-muted)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg">
                  <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    Theme
                  </div>
                  {(['midnight', 'light', 'lcars'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => applyTheme(t)}
                      className={`w-full px-3 py-2 text-left text-sm ${theme === t ? 'text-[var(--accent)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-active)]'}`}
                    >
                      {t === 'midnight'
                        ? 'Midnight'
                        : t === 'light'
                          ? 'Light'
                          : 'LCARS'}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--bg-card-active)]"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-1 md:hidden">
        {visibleNav.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/' }}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[10px] font-medium text-[var(--text-secondary)]"
            activeProps={{
              className:
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md bg-[var(--bg-card-active)] px-1 py-2 text-[10px] font-medium text-[var(--accent)]',
            }}
          >
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
