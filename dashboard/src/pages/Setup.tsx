import { useState, useEffect, useMemo, useId } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import type { AuthUser } from '../stores/auth-store';
const PHASE2_STEPS = 5;

type WifiNetwork = { ssid: string; signal: number; security: string };
type WifiStatus = {
  connected: boolean;
  ssid: string | null;
  hotspot_active: boolean;
  ip: string | null;
  platform_supported: boolean;
  hotspot_ssid: string;
  /** mDNS hostname from hub config (for captive recovery pre-fill). */
  hostname: string | null;
  /** Canonical dashboard URL from hub config (respects HTTPS and port). */
  public_base_url: string;
};
function getTimeZoneOptions(): string[] {
  try {
    const z = Intl.supportedValuesOf('timeZone');
    return [...z].sort((a, b) => a.localeCompare(b, 'en'));
  } catch {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
    ];
  }
}

function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function scrollSetupPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
}

/** Shown as chips; filtered to zones supported by the runtime. */
const TIMEZONE_QUICK_PICKS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

function filterTimezones(zones: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const qUnderscore = q.replace(/\s+/g, '_');
  const out: string[] = [];
  for (const z of zones) {
    const low = z.toLowerCase();
    const spaced = low.replace(/_/g, ' ');
    if (
      low.includes(qUnderscore)
      || spaced.includes(q)
      || low.includes(q)
    ) {
      out.push(z);
    }
    if (out.length >= 250) break;
  }
  return out.sort((a, b) => a.localeCompare(b, 'en'));
}

function timezoneShortLabel(z: string): string {
  const tail = z.includes('/') ? z.slice(z.lastIndexOf('/') + 1) : z;
  return tail.replace(/_/g, ' ');
}

type TimeZonePickerProps = {
  id: string;
  value: string;
  onChange: (tz: string) => void;
  options: string[];
};

function TimeZonePicker({ id, value, onChange, options }: TimeZonePickerProps) {
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const deviceTz = useMemo(() => defaultTimeZone(), []);
  const optionSet = useMemo(() => new Set(options), [options]);

  const quickPicks = useMemo(
    () => TIMEZONE_QUICK_PICKS.filter((z) => optionSet.has(z)),
    [optionSet],
  );

  const filtered = useMemo(
    () => filterTimezones(options, query),
    [options, query],
  );

  const showSearchResults = query.trim().length >= 1;
  const inputDisplay = focused ? query : (query || value);

  function pickZone(z: string) {
    onChange(z);
    setQuery('');
    setFocused(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={inputDisplay}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setFocused(true);
          setQuery('');
        }}
        onBlur={() => {
          setFocused(false);
          setQuery('');
        }}
        placeholder="Search by city or region (e.g. New York)"
        aria-autocomplete="list"
        aria-controls={showSearchResults ? listboxId : undefined}
        aria-expanded={showSearchResults}
        className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 font-mono text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
      />

      {showSearchResults && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-[var(--text-muted)]">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            {filtered.length >= 250 ? ' (showing first 250)' : ''}
          </p>
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Timezone search results"
            className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-input)] py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">No matches. Try another spelling.</li>
            ) : (
              filtered.map((z) => (
                <li key={z} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === z}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickZone(z)}
                    className={`flex w-full px-3 py-2.5 text-left text-sm font-mono transition-colors hover:bg-[var(--bg-card-active)] ${
                      value === z ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {z}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {!showSearchResults && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">Quick picks</p>
          <div className="flex flex-wrap gap-2">
            {deviceTz && optionSet.has(deviceTz) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickZone(deviceTz)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  value === deviceTz
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--accent)]/50'
                }`}
              >
                This device ({timezoneShortLabel(deviceTz)})
              </button>
            )}
            {quickPicks.map((z) => (
              <button
                key={z}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickZone(z)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  value === z
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:border-[var(--accent)]/50'
                }`}
              >
                {timezoneShortLabel(z)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Shared wrapper
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-[var(--bg-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,var(--accent-glow),transparent)]" />
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[var(--accent)]/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[var(--accent)]/8 blur-3xl" />
      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        {children}
        <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
          Your data stays on this hub.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable WiFi network list
// ---------------------------------------------------------------------------

function NetworkList({
  networks,
  selectedSsid,
  onSelect,
}: {
  networks: WifiNetwork[];
  selectedSsid: string;
  onSelect: (ssid: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-3">
      {networks.map((n) => (
        <button
          key={n.ssid}
          type="button"
          onClick={() => onSelect(n.ssid)}
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
            selectedSsid === n.ssid
              ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/40'
              : 'hover:bg-[var(--bg-card-active)] border border-transparent'
          }`}
        >
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" />
            </svg>
            <span className="font-medium text-[var(--text-primary)]">{n.ssid}</span>
          </div>
          <div className="flex items-center gap-2">
            {n.security !== 'Open' && n.security !== '' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            <div className="flex items-end gap-0.5">
              {[1, 2, 3, 4].map((bar) => (
                <div
                  key={bar}
                  className={`w-1 rounded-full ${
                    n.signal >= bar * 25
                      ? 'bg-[var(--accent)]'
                      : 'bg-[var(--border)]'
                  }`}
                  style={{ height: `${bar * 4 + 4}px` }}
                />
              ))}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 1  –  Captive portal (WiFi + hostname only)
// ---------------------------------------------------------------------------

type CaptiveVariant = 'initial' | 'recovery';

function CaptiveSetup({
  variant = 'initial',
  initialHostname,
}: {
  variant?: CaptiveVariant;
  initialHostname?: string | null;
}) {
  const recovery = variant === 'recovery';
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [selectedSsid, setSelectedSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [hostname, setHostname] = useState('smarthome.local');
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [finishUrl, setFinishUrl] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);
  useEffect(() => {
    api.get<WifiNetwork[]>('/system/wifi/scan').then(setWifiNetworks).catch(() => {});
  }, []);

  useEffect(() => {
    if (recovery && initialHostname?.trim()) {
      setHostname(initialHostname.trim());
    }
  }, [recovery, initialHostname]);

  useEffect(() => {
    if (done) scrollSetupPageTop();
  }, [done]);

  function selectNetwork(ssid: string) {
    setSelectedSsid(ssid);
    setWifiPassword('');
    setShowManual(false);
  }

  function canSubmit() {
    return selectedSsid.trim().length > 0 && hostname.trim().length > 0;
  }

  async function submit() {
    if (!canSubmit()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; handoff_url?: string }>('/setup/captive', {
        ssid: selectedSsid.trim(),
        password: wifiPassword || undefined,
        hostname: hostname.trim(),
      });
      const resolved = hostname.trim().replace(/\.local$/, '') + '.local';
      const url = res.handoff_url ?? `http://${resolved}/`;
      setFinishUrl(url);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function copySetupUrl() {
    if (!finishUrl) return;
    try {
      await navigator.clipboard.writeText(finishUrl);
      setUrlCopied(true);
      window.setTimeout(() => setUrlCopied(false), 2500);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = finishUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setUrlCopied(true);
        window.setTimeout(() => setUrlCopied(false), 2500);
      } catch {
        /* ignore */
      }
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="mb-10 text-center sm:mb-14">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Almost there
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Connecting&hellip;
          </h1>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl shadow-black/25 sm:p-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/15">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 18h.01" />
              </svg>
            </div>

            <div>
              <p className="text-lg font-medium text-[var(--text-primary)]">
                Your hub is joining <strong>{selectedSsid}</strong>
              </p>
              <p className="mt-2 text-[var(--text-secondary)]">
                This hotspot will shut down in a few seconds.
              </p>
            </div>
          </div>

          <div className="mt-8 w-full border-t border-[var(--border)] pt-8 text-left">
            <p className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
              {recovery ? 'To reach the dashboard:' : 'To finish setup:'}
            </p>
            <ol className="list-decimal space-y-4 pl-5 text-[var(--text-primary)]">
              <li className="pl-1">
                <strong>Copy the link below</strong> (this window may close when WiFi switches).
              </li>
              <li className="pl-1">Connect your phone to <strong>{selectedSsid}</strong>.</li>
              <li className="pl-1">
                {recovery
                  ? (
                    <>
                      Open the link in <strong>Safari</strong> or <strong>Chrome</strong> to return to the dashboard.
                    </>
                  )
                  : (
                    <>
                      Paste the link into the address bar in <strong>Safari</strong> or <strong>Chrome</strong> to continue setup.
                    </>
                  )}
              </li>
            </ol>

            <p className="mb-2 mt-6 text-center text-xs text-[var(--text-muted)]">
              Tap once to select, or use Copy
            </p>
            <div className="w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] py-1 text-center">
              <span
                className="inline-block cursor-text select-all whitespace-nowrap px-1 py-2 font-mono text-base font-semibold text-[var(--accent)]"
                title={finishUrl}
              >
                {finishUrl}
              </span>
            </div>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void copySetupUrl()}
                className="w-full max-w-xs rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white touch-manipulation hover:bg-[var(--accent-hover)] sm:w-auto sm:min-w-[12rem]"
              >
                {urlCopied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-10 text-center sm:mb-14">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          {recovery ? 'WiFi required' : 'Welcome'}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {recovery ? 'Reconnect your hub' : 'Connect your hub'}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">
          {recovery
            ? 'The hub lost its network. Choose your home WiFi so it can join again.'
            : 'Choose your home WiFi network so the hub can go online.'}
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-2xl shadow-black/25 sm:p-10">
        {error && (
          <div className="mb-6 rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </div>
        )}

        <form
          className="relative flex flex-col gap-6"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading && canSubmit()) void submit();
          }}
        >
          {/* Absorbs some password-manager heuristics so the WPA field below isn&apos;t treated as a login password. */}
          <div className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden opacity-0" aria-hidden>
            <input type="text" name="shs_decoy_user" tabIndex={-1} autoComplete="username" readOnly />
          </div>

          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">WiFi</h2>

          {wifiNetworks.length > 0 && (
            <NetworkList networks={wifiNetworks} selectedSsid={selectedSsid} onSelect={selectNetwork} />
          )}

          {wifiNetworks.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No networks found. Enter your network name manually below.</p>
          )}

          {/* Manual SSID toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            >
              {showManual ? 'Hide manual entry' : 'Enter network name manually'}
            </button>
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{ maxHeight: showManual ? '80px' : '0', opacity: showManual ? 1 : 0 }}
            >
              <input
                name="wifi-ssid"
                autoComplete="off"
                value={selectedSsid && !wifiNetworks.find((n) => n.ssid === selectedSsid) ? selectedSsid : ''}
                onChange={(e) => { setSelectedSsid(e.target.value); setWifiPassword(''); }}
                placeholder="Network name (SSID)"
                className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* WPA: mask with overlay bullets — not type=password / not -webkit-text-security (iOS strong-password). */}
          {selectedSsid && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="captive-wifi-wpa-key">
                WPA key for {selectedSsid}
              </label>
              <div className="relative overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-input)] focus-within:border-[var(--accent)]">
                <input
                  id="captive-wifi-wpa-key"
                  name="wpa_psk"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder=""
                  aria-label="Wi-Fi WPA network key"
                  className="relative z-10 w-full min-w-0 bg-transparent px-4 py-3 font-mono text-base leading-normal tracking-[0.14em] text-transparent caret-[var(--accent)] outline-none placeholder:text-transparent selection:bg-transparent selection:text-transparent"
                  style={{ WebkitTextFillColor: 'transparent' }}
                />
                <div
                  className="pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden px-4 font-mono text-base leading-normal whitespace-nowrap text-[var(--text-primary)]"
                  aria-hidden
                >
                  {wifiPassword.length > 0 ? (
                    <span className="tracking-[0.14em]">{'\u2022'.repeat([...wifiPassword].length)}</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">Network key</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="captive-hub-hostname">
                Hostname
              </label>
              <p className="text-xs leading-snug text-[var(--text-muted)]">
                mDNS name on your LAN (e.g. <span className="font-mono text-[var(--text-secondary)]">smarthome.local</span>)
              </p>
              <input
                id="captive-hub-hostname"
                name="hub-mdns-hostname"
                autoComplete="off"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="smarthome.local"
                className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-base text-nowrap text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="mt-10">
            <button
              type="submit"
              disabled={loading || !canSubmit()}
              className="w-full rounded-xl bg-[var(--accent)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? 'Please wait\u2026' : recovery ? 'Connect to WiFi' : 'Connect and continue setup'}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Phase 2  –  Full setup wizard (at hostname.local)
// ---------------------------------------------------------------------------

export default function Setup() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [setupInfo, setSetupInfo] = useState<{ complete: boolean } | null>(null);

  // Phase 2 state
  const [step, setStep] = useState(1);
  const [language] = useState('en');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [hubName, setHubName] = useState('');
  const [timezone, setTimezone] = useState(defaultTimeZone);
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');
  const timezoneOptions = useMemo(() => getTimeZoneOptions(), []);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<WifiStatus>('/system/wifi/status')
      .then(setWifiStatus)
      .catch(() => setWifiStatus({
        connected: true, ssid: null, hotspot_active: false,
        ip: null, platform_supported: false, hotspot_ssid: '',
        hostname: null,
        public_base_url: typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost/',
      }));
  }, []);

  useEffect(() => {
    api.get<{ complete: boolean }>('/setup/status')
      .then((r) => setSetupInfo({ complete: r.complete }))
      .catch(() => setSetupInfo({ complete: false }));
  }, []);

  useEffect(() => {
    if (!wifiStatus || !setupInfo) return;
    if (wifiStatus.hotspot_active && setupInfo.complete && !token) {
      sessionStorage.setItem('postLoginRedirect', '/setup');
      navigate({ to: '/login', replace: true });
    }
  }, [wifiStatus, setupInfo, token, navigate]);

  const redirectHome = setupInfo?.complete === true && wifiStatus && !wifiStatus.hotspot_active;
  useEffect(() => {
    if (redirectHome) {
      navigate({ to: '/', replace: true });
    }
  }, [redirectHome, navigate]);

  useEffect(() => {
    scrollSetupPageTop();
  }, [step]);

  // Still loading wifi / setup flags
  if (!wifiStatus || !setupInfo) return null;

  if (redirectHome) {
    return null;
  }

  // Captive portal — hub hotspot (lost WiFi or first-time setup)
  if (wifiStatus.hotspot_active) {
    if (setupInfo.complete) {
      if (!token) return null;
      return (
        <CaptiveSetup
          variant="recovery"
          initialHostname={wifiStatus.hostname}
        />
      );
    }
    return <CaptiveSetup variant="initial" />;
  }

  // -- Phase 2 helpers -------------------------------------------------------

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
      if (timezone.trim().length < 1) next.timezone = 'Select a timezone.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function canContinue(): boolean {
    switch (step) {
      case 2:
        return username.trim().length >= 2
          && displayName.trim().length >= 1
          && password.length >= 12
          && /^\d{6,}$/.test(pin);
      case 3:
        return hubName.trim().length >= 1 && timezone.trim().length >= 1;
      default:
        return true;
    }
  }

  async function postStep(n: number) {
    setError(null);
    setLoading(true);
    try {
      if (n === 1) {
        await api.post('/setup/step/1', { language });
      } else if (n === 2) {
        await api.post('/setup/step/2', {
          username: username.trim(),
          display_name: displayName.trim(),
          password,
          pin,
        });
      } else if (n === 3) {
        await api.post('/setup/step/3', {
          hub_name: hubName.trim(),
          timezone: timezone.trim(),
          temperature_unit: tempUnit,
        });
        await api.post('/setup/step/6', { matter: true, zigbee: true, zwave: true });
      } else if (n === 4) {
        await api.post('/setup/step/7', { rooms });
      } else if (n === 5) {
        await api.post('/setup/step/8', {
          language,
          username: username.trim(),
          display_name: displayName.trim(),
          hub_name: hubName.trim(),
          timezone: timezone.trim(),
          temperature_unit: tempUnit,
          matter: true,
          zigbee: true,
          zwave: true,
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
      if (step < PHASE2_STEPS) setStep(step + 1);
    } catch { /* postStep sets error */ }
  }

  async function complete() {
    if (!validateStep(2) || !validateStep(3)) {
      setStep(2);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await postStep(5);
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

  function removeRoom(index: number) {
    setRooms((rows) => rows.filter((_, i) => i !== index));
  }

  // -- Phase 2 render --------------------------------------------------------

  return (
    <Shell>
      {step === 1 && (
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
      )}

      <div className="mb-10">
        <p className="mb-3 text-center text-sm text-[var(--text-muted)]">
          Step {step} of {PHASE2_STEPS}
        </p>
        <div className="flex justify-between gap-1">
          {Array.from({ length: PHASE2_STEPS }, (_, i) => (
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
          <div className="mb-6 rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </div>
        )}

        {/* Step 1: Welcome / Language */}
        {step === 1 && (
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                Hello there
              </h2>
              <p className="mt-3 text-lg text-[var(--text-secondary)]">
                We&apos;ll walk you through naming your hub, securing your account, and getting everything ready.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Language</label>
              <select disabled value="en" className="cursor-not-allowed rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] opacity-80">
                <option value="en">English</option>
              </select>
              <p className="text-sm text-[var(--text-muted)]">More languages will arrive in a future update.</p>
            </div>
          </div>
        )}

        {/* Step 2: Admin account */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Administrator account</h2>
              <p className="mt-2 text-[var(--text-secondary)]">This account has full access to your hub.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              {fieldErrors.username && <p className="text-sm text-[var(--danger)]">{fieldErrors.username}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              {fieldErrors.displayName && <p className="text-sm text-[var(--danger)]">{fieldErrors.displayName}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Password (12+ characters)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              {fieldErrors.password && <p className="text-sm text-[var(--danger)]">{fieldErrors.password}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]">PIN (6+ digits)</label>
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} autoComplete="off" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-lg tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              {fieldErrors.pin && <p className="text-sm text-[var(--danger)]">{fieldErrors.pin}</p>}
            </div>
          </div>
        )}

        {/* Step 3: Hub identity */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Hub identity</h2>
              <p className="mt-2 text-[var(--text-secondary)]">How should we refer to your home?</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Hub name</label>
              <input value={hubName} onChange={(e) => setHubName(e.target.value)} placeholder="e.g. Oak Street Home" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]" />
              {fieldErrors.hubName && <p className="text-sm text-[var(--danger)]">{fieldErrors.hubName}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="setup-timezone-search">
                Timezone
              </label>
              <TimeZonePicker
                id="setup-timezone-search"
                value={timezone}
                onChange={setTimezone}
                options={timezoneOptions}
              />
              {fieldErrors.timezone && <p className="text-sm text-[var(--danger)]">{fieldErrors.timezone}</p>}
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-secondary)]">Temperature unit</p>
                <p className="text-sm text-[var(--text-muted)]">Fahrenheit or Celsius</p>
              </div>
              <div
                className="inline-flex shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-inner shadow-black/10"
                role="group"
                aria-label="Temperature unit"
              >
                <button
                  type="button"
                  onClick={() => setTempUnit('F')}
                  className={`flex h-9 w-11 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                    tempUnit === 'F'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  &deg;F
                </button>
                <button
                  type="button"
                  onClick={() => setTempUnit('C')}
                  className={`flex h-9 w-11 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                    tempUnit === 'C'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  &deg;C
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Rooms */}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Rooms</h2>
              <p className="mt-2 text-[var(--text-secondary)]">Add rooms now or skip and do this later in the app.</p>
            </div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">Quick add</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_ROOMS.map((name) => (
                <button key={name} type="button" onClick={() => addSuggested(name)} className="rounded-full border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-active)]">
                  {name}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Room name</label>
                <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Custom room" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Floor</label>
                <input value={roomFloor} onChange={(e) => setRoomFloor(e.target.value)} placeholder="e.g. 1" className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              </div>
            </div>
            <button type="button" onClick={addCustomRoom} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-hover)]">Add room</button>
            {rooms.length > 0 && (
              <ul className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                {rooms.map((r, index) => (
                  <li key={`${r.name}-${r.floor}-${index}`} className="flex items-center justify-between gap-3 text-[var(--text-primary)]">
                    <span className="min-w-0 flex-1">
                      {r.name}
                      <span className="ml-2 text-sm text-[var(--text-muted)]">{r.floor}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRoom(index)}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger)]/15 hover:text-[var(--danger)]"
                      aria-label={`Remove ${r.name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">You&apos;re all set</h2>
              <p className="mt-2 text-[var(--text-secondary)]">Review your choices before we finish.</p>
            </div>
            <dl className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-6">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Language</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">English</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Admin</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">
                  {username || '\u2014'}
                  {displayName ? <span className="block text-sm font-normal text-[var(--text-muted)]">{displayName}</span> : null}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Hub</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">{hubName || '\u2014'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Timezone</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">{timezone || '\u2014'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Temperature</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">&deg;{tempUnit}</dd>
              </div>
              <div className="border-t border-[var(--border)] pt-4">
                <dt className="mb-2 text-[var(--text-muted)]">Rooms</dt>
                <dd className="text-[var(--text-primary)]">
                  {rooms.length === 0 ? (
                    <span className="text-[var(--text-muted)]">None added</span>
                  ) : (
                    <ul className="list-inside list-disc space-y-1">
                      {rooms.map((r) => (
                        <li key={`${r.name}-${r.floor}`}>{r.name} <span className="text-[var(--text-muted)]">({r.floor})</span></li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-between">
          {step > 1 ? (
            <button type="button" disabled={loading} onClick={() => { setError(null); setStep((s) => Math.max(1, s - 1)); }} className="order-2 rounded-xl border border-[var(--border)] bg-transparent px-6 py-3.5 text-base font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 sm:order-1">
              Back
            </button>
          ) : (
            <span className="order-2 sm:order-1" />
          )}
          {step < PHASE2_STEPS ? (
            <button type="button" disabled={loading || !canContinue()} onClick={() => void goNext()} className="order-1 rounded-xl bg-[var(--accent)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:order-2 sm:ml-auto">
              {loading ? 'Please wait\u2026' : 'Continue'}
            </button>
          ) : (
            <button type="button" disabled={loading} onClick={() => void complete()} className="order-1 rounded-xl bg-[var(--accent)] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:order-2 sm:ml-auto">
              {loading ? 'Finishing\u2026' : 'Complete setup'}
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
