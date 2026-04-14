import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import type { AuthUser } from '../stores/auth-store';
import { Toggle } from '../components/Toggle';

const STEPS = 7;
const SUGGESTED_ROOMS = [
  'Living Room',
  'Kitchen',
  'Bedroom',
  'Bathroom',
  'Office',
];

type Room = { name: string; floor: string };

type CompleteResponse = {
  token: string;
  user: AuthUser;
};

export default function Setup() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState(1);
  const [language] = useState('en');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [hubName, setHubName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');
  const [hostname, setHostname] = useState('');
  const [matterEnabled, setMatterEnabled] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validateStep(n: number): boolean {
    const next: Record<string, string> = {};
    if (n === 2) {
      if (username.trim().length < 2) next.username = 'Choose a username (2+ characters).';
      if (displayName.trim().length < 1) next.displayName = 'Enter a display name.';
      if (password.length < 12) next.password = 'Password must be at least 12 characters.';
      if (!/^\d{6,}$/.test(pin)) next.pin = 'PIN must be 6 or more digits.';
    }
    if (n === 3) {
      if (hubName.trim().length < 1) next.hubName = 'Name your hub.';
      if (timezone.trim().length < 1) next.timezone = 'Enter a timezone (e.g. America/New_York).';
    }
    if (n === 4) {
      if (hostname.trim().length < 1) next.hostname = 'Enter a hostname.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function postStep(n: number) {
    setError(null);
    setLoading(true);
    try {
      if (n === 1) {
        await api.post(`/setup/step/1`, { language });
      } else if (n === 2) {
        await api.post(`/setup/step/2`, {
          username: username.trim(),
          display_name: displayName.trim(),
          password,
          pin,
        });
      } else if (n === 3) {
        await api.post(`/setup/step/3`, {
          hub_name: hubName.trim(),
          timezone: timezone.trim(),
          temperature_unit: tempUnit,
        });
      } else if (n === 4) {
        await api.post(`/setup/step/4`, { hostname: hostname.trim() });
      } else if (n === 5) {
        await api.post(`/setup/step/5`, {
          matter_enabled: matterEnabled,
          zigbee_enabled: false,
          zwave_enabled: false,
        });
      } else if (n === 6) {
        await api.post(`/setup/step/6`, { rooms });
      } else if (n === 7) {
        await api.post(`/setup/step/7`, {
          language,
          username: username.trim(),
          display_name: displayName.trim(),
          hub_name: hubName.trim(),
          timezone: timezone.trim(),
          temperature_unit: tempUnit,
          hostname: hostname.trim(),
          matter_enabled: matterEnabled,
          rooms,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function goNext() {
    if (!validateStep(step)) return;
    setLoading(true);
    try {
      await postStep(step);
      if (step < STEPS) setStep((s) => s + 1);
    } catch {
      /* postStep sets error */
    }
  }

  async function complete() {
    if (!validateStep(2) || !validateStep(3) || !validateStep(4)) {
      setStep(2);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await postStep(7);
      const res = await api.post<CompleteResponse>('/setup/complete');
      setAuth(res.user, res.token);
      navigate({ to: '/', replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish setup.');
    } finally {
      setLoading(false);
    }
  }

  function addSuggested(name: string) {
    if (rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    setRooms((r) => [...r, { name, floor: roomFloor.trim() || '1' }]);
  }

  function addCustomRoom() {
    const n = roomName.trim();
    if (!n) return;
    if (rooms.some((r) => r.name.toLowerCase() === n.toLowerCase())) return;
    setRooms((r) => [...r, { name: n, floor: roomFloor.trim() || '1' }]);
    setRoomName('');
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-[var(--bg-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,var(--accent-glow),transparent)]" />
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[var(--accent)]/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[var(--accent)]/8 blur-3xl" />

      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div className="mb-10 text-center sm:mb-14">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Welcome
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Let&apos;s set up your hub
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">
            A few quick steps and you&apos;ll be ready to connect devices and build automations.
          </p>
        </div>

        <div className="mb-10">
          <p className="mb-3 text-center text-sm text-[var(--text-muted)]">
            Step {step} of {STEPS}
          </p>
          <div className="flex justify-between gap-1">
            {Array.from({ length: STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < step
                    ? 'bg-[var(--accent)]'
                    : i === step - 1
                      ? 'bg-[var(--accent)]/60'
                      : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-2xl shadow-black/25 sm:p-10">
          {error && (
            <div
              className="mb-6 rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Hello there
                </h2>
                <p className="mt-3 text-lg text-[var(--text-secondary)]">
                  We&apos;ll walk you through naming your hub, securing your account, and getting your network ready.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Language
                </label>
                <select
                  disabled
                  value="en"
                  className="cursor-not-allowed rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] opacity-80"
                >
                  <option value="en">English</option>
                </select>
                <p className="text-sm text-[var(--text-muted)]">
                  More languages will arrive in a future update.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Administrator account
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  This account has full access to your hub.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.username && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.username}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.displayName && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.displayName}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Password (12+ characters)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.password && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.password}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  PIN (6+ digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  autoComplete="off"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-lg tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.pin && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.pin}</p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Hub identity
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  How should we refer to your home?
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Hub name
                </label>
                <input
                  value={hubName}
                  onChange={(e) => setHubName(e.target.value)}
                  placeholder="e.g. Oak Street Home"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.hubName && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.hubName}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Timezone
                </label>
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. America/Los_Angeles"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.timezone && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.timezone}</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-5 py-4">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Temperature unit</p>
                  <p className="text-sm text-[var(--text-muted)]">Fahrenheit or Celsius</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm ${tempUnit === 'F' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                  >
                    °F
                  </span>
                  <button
                    type="button"
                    onClick={() => setTempUnit((u) => (u === 'F' ? 'C' : 'F'))}
                    className={`relative h-9 w-16 rounded-full border border-[var(--border)] transition-colors ${tempUnit === 'C' ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-active)]'}`}
                    aria-label="Toggle temperature unit"
                  >
                    <span
                      className={`absolute top-1 h-7 w-7 rounded-full bg-[var(--text-primary)] shadow transition-transform ${tempUnit === 'C' ? 'left-8' : 'left-1'}`}
                    />
                  </button>
                  <span
                    className={`text-sm ${tempUnit === 'C' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                  >
                    °C
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Network
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  How this hub appears on your local network.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Hostname
                </label>
                <input
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="e.g. smarthome.local"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
                {fieldErrors.hostname && (
                  <p className="text-sm text-[var(--danger)]">{fieldErrors.hostname}</p>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Protocols
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Choose which radios to enable.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-5 py-4">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Matter</p>
                  <p className="text-sm text-[var(--text-muted)]">IP-based smart home devices</p>
                </div>
                <Toggle checked={matterEnabled} onChange={setMatterEnabled} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card-active)] px-5 py-4 opacity-80">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Zigbee</p>
                  <p className="text-sm text-[var(--warning)]">Coming soon</p>
                </div>
                <Toggle checked={false} onChange={() => {}} disabled />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card-active)] px-5 py-4 opacity-80">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Z-Wave</p>
                  <p className="text-sm text-[var(--warning)]">Coming soon</p>
                </div>
                <Toggle checked={false} onChange={() => {}} disabled />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Rooms
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Add rooms now or skip and do this later in the app.
                </p>
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Quick add
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_ROOMS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addSuggested(name)}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-active)]"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">
                    Room name
                  </label>
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Custom room"
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">
                    Floor
                  </label>
                  <input
                    value={roomFloor}
                    onChange={(e) => setRoomFloor(e.target.value)}
                    placeholder="e.g. 1"
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addCustomRoom}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-hover)]"
              >
                Add room
              </button>
              {rooms.length > 0 && (
                <ul className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                  {rooms.map((r) => (
                    <li
                      key={`${r.name}-${r.floor}`}
                      className="flex items-center justify-between text-[var(--text-primary)]"
                    >
                      <span>{r.name}</span>
                      <span className="text-sm text-[var(--text-muted)]">Floor {r.floor}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  You&apos;re all set
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Review your choices before we finish.
                </p>
              </div>
              <dl className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-6">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Language</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">English</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Admin</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">
                    {username || '—'}
                    {displayName ? (
                      <span className="block text-sm font-normal text-[var(--text-muted)]">
                        {displayName}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Hub</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">
                    {hubName || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Timezone</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">
                    {timezone || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Temperature</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">
                    °{tempUnit}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Hostname</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">
                    {hostname || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Matter</dt>
                  <dd className="text-right font-medium text-[var(--success)]">
                    {matterEnabled ? 'On' : 'Off'}
                  </dd>
                </div>
                <div className="border-t border-[var(--border)] pt-4">
                  <dt className="mb-2 text-[var(--text-muted)]">Rooms</dt>
                  <dd className="text-[var(--text-primary)]">
                    {rooms.length === 0 ? (
                      <span className="text-[var(--text-muted)]">None added</span>
                    ) : (
                      <ul className="list-inside list-disc space-y-1">
                        {rooms.map((r) => (
                          <li key={`${r.name}-${r.floor}`}>
                            {r.name}{' '}
                            <span className="text-[var(--text-muted)]">(floor {r.floor})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-between">
            {step > 1 ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setError(null);
                  setStep((s) => Math.max(1, s - 1));
                }}
                className="order-2 rounded-xl border border-[var(--border)] bg-transparent px-6 py-3.5 text-base font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 sm:order-1"
              >
                Back
              </button>
            ) : (
              <span className="order-2 sm:order-1" />
            )}
            {step < STEPS ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void goNext()}
                className="order-1 rounded-xl bg-[var(--accent)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:order-2 sm:ml-auto"
              >
                {loading ? 'Please wait…' : 'Continue'}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => void complete()}
                className="order-1 rounded-xl bg-[var(--accent)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:order-2 sm:ml-auto"
              >
                {loading ? 'Finishing…' : 'Complete setup'}
              </button>
            )}
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
          Your data stays on this hub.
        </p>
      </div>
    </div>
  );
}
