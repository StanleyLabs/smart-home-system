import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Spinner } from '../components/Spinner';
import { useAuthStore } from '../stores/auth-store';
import { Toggle } from '../components/Toggle';

const SECTIONS = [
  'hub',
  'network',
  'protocols',
  'automations',
  'notifications',
  'updates',
  'security',
  'storage',
  'backup',
] as const;

type SectionId = (typeof SECTIONS)[number];

function labelize(id: string) {
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const KNOWN_OPTIONS: Record<string, { label: string; value: string }[]> = {
  'hub.units.temperature': [
    { label: 'Fahrenheit', value: 'fahrenheit' },
    { label: 'Celsius', value: 'celsius' },
  ],
  'hub.units.distance': [
    { label: 'Imperial', value: 'imperial' },
    { label: 'Metric', value: 'metric' },
  ],
  'network.protocol': [
    { label: 'HTTP (no TLS)', value: 'http' },
    { label: 'HTTPS (TLS, saved in config)', value: 'https' },
  ],
  'network.mqtt.websocket_protocol': [
    { label: 'WS', value: 'ws' },
    { label: 'WSS', value: 'wss' },
  ],
  'protocols.zwave.region': [
    { label: 'US', value: 'US' },
    { label: 'EU', value: 'EU' },
    { label: 'ANZ', value: 'ANZ' },
    { label: 'HK', value: 'HK' },
    { label: 'JP', value: 'JP' },
    { label: 'KR', value: 'KR' },
    { label: 'IN', value: 'IN' },
    { label: 'RU', value: 'RU' },
    { label: 'CN', value: 'CN' },
    { label: 'IL', value: 'IL' },
    { label: 'MY', value: 'MY' },
  ],
  'backup.destinations.type': [
    { label: 'Local', value: 'local' },
    { label: 'Network', value: 'network' },
    { label: 'Cloud', value: 'cloud' },
  ],
};

function renderField(
  key: string,
  val: unknown,
  optionPath: string,
  htmlId: string,
  onChange: (value: unknown) => void,
): React.ReactNode {
  const options = KNOWN_OPTIONS[optionPath];
  if (options && typeof val === 'string') {
    return (
      <div key={htmlId} className="flex flex-col gap-1.5">
        <label htmlFor={htmlId} className="text-sm text-[var(--text-secondary)]">
          {labelize(key)}
        </label>
        <select
          id={htmlId}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (typeof val === 'boolean') {
    return (
      <div key={htmlId} className="flex items-center justify-between gap-4">
        <label htmlFor={htmlId} className="text-sm text-[var(--text-secondary)]">
          {labelize(key)}
        </label>
        <Toggle checked={val} onChange={(c) => onChange(c)} />
      </div>
    );
  }

  if (typeof val === 'number') {
    return (
      <div key={htmlId} className="flex flex-col gap-1.5">
        <label htmlFor={htmlId} className="text-sm text-[var(--text-secondary)]">
          {labelize(key)}
        </label>
        <input
          id={htmlId}
          type="number"
          value={Number.isFinite(val) ? val : ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? 0 : Number(e.target.value))
          }
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </div>
    );
  }

  if (isPlainObject(val)) {
    return (
      <fieldset
        key={htmlId}
        className="rounded-lg border border-[var(--border)] p-4"
      >
        <legend className="px-2 text-sm font-medium text-[var(--text-primary)]">
          {labelize(key)}
        </legend>
        <div className="flex flex-col gap-4">
          {Object.keys(val).map((subKey) =>
            renderField(
              subKey,
              val[subKey],
              `${optionPath}.${subKey}`,
              `${htmlId}-${subKey}`,
              (subVal) => onChange({ ...val, [subKey]: subVal }),
            ),
          )}
        </div>
      </fieldset>
    );
  }

  if (Array.isArray(val)) {
    return (
      <fieldset
        key={htmlId}
        className="rounded-lg border border-[var(--border)] p-4"
      >
        <legend className="px-2 text-sm font-medium text-[var(--text-primary)]">
          {labelize(key)}
        </legend>
        <div className="flex flex-col gap-3">
          {val.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {isPlainObject(item)
                  ? Object.keys(item).map((subKey) =>
                      renderField(
                        subKey,
                        (item as Record<string, unknown>)[subKey],
                        `${optionPath}.${subKey}`,
                        `${htmlId}-${idx}-${subKey}`,
                        (subVal) => {
                          const next = [...val];
                          next[idx] = { ...item, [subKey]: subVal };
                          onChange(next);
                        },
                      ),
                    )
                  : (
                      <input
                        type="text"
                        value={String(item ?? '')}
                        onChange={(e) => {
                          const next = [...val];
                          next[idx] = e.target.value;
                          onChange(next);
                        }}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                    )}
              </div>
              <button
                type="button"
                onClick={() => onChange(val.filter((_: unknown, i: number) => i !== idx))}
                className="shrink-0 rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const template =
                val.length > 0 && isPlainObject(val[0])
                  ? Object.fromEntries(
                      Object.keys(val[0] as Record<string, unknown>).map(
                        (k) => {
                          const sample = (val[0] as Record<string, unknown>)[k];
                          if (typeof sample === 'boolean') return [k, false];
                          if (typeof sample === 'number') return [k, 0];
                          return [k, ''];
                        },
                      ),
                    )
                  : '';
              onChange([...val, template]);
            }}
            className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
          >
            + Add item
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <div key={htmlId} className="flex flex-col gap-1.5">
      <label htmlFor={htmlId} className="text-sm text-[var(--text-secondary)]">
        {labelize(key)}
      </label>
      <input
        id={htmlId}
        type="text"
        value={val === null || val === undefined ? '' : String(val)}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Record<string, Record<string, unknown>>>({});
  const [open, setOpen] = useState<SectionId | null>('hub');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SectionId | null>(null);
  const [resetting, setResetting] = useState<SectionId | null>(null);
  const [sectionError, setSectionError] = useState<Partial<Record<SectionId, string>>>({});
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});
  const initialMount = useRef(true);

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (!open) return;
    const id = requestAnimationFrame(() => {
      sectionRefs.current[open]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await api.get<Record<string, unknown>>('/settings');
      const next: Record<string, Record<string, unknown>> = {};
      for (const id of SECTIONS) {
        const raw = res[id];
        next[id] = isPlainObject(raw) ? { ...raw } : {};
      }
      setData(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = useCallback((section: SectionId, key: string, value: unknown) => {
    setData((d) => ({
      ...d,
      [section]: { ...d[section], [key]: value },
    }));
    setSectionError((se) => ({ ...se, [section]: undefined }));
  }, []);

  const saveSection = useCallback(
    async (section: SectionId) => {
      setSaving(section);
      setSectionError((se) => ({ ...se, [section]: undefined }));
      try {
        const res = await api.put<Record<string, unknown>>(
          `/settings/${section}`,
          data[section] ?? {},
        );
        if (res.__hub_restart_recommended) {
          window.alert(
            'Restart the hub service so HTTPS listeners and certificates apply (e.g. sudo systemctl restart your smart-home unit, or stop and start npm start).',
          );
        }
        await load();
      } catch (e) {
        setSectionError((se) => ({
          ...se,
          [section]: e instanceof Error ? e.message : 'Save failed',
        }));
      } finally {
        setSaving(null);
      }
    },
    [data, load],
  );

  const resetSection = useCallback(
    async (section: SectionId) => {
      if (
        !window.confirm(
          `Reset ${labelize(section)} to defaults? This cannot be undone.`,
        )
      ) {
        return;
      }
      setResetting(section);
      setSectionError((se) => ({ ...se, [section]: undefined }));
      try {
        await api.post<Record<string, unknown>>(`/settings/${section}/reset`);
        await load();
      } catch (e) {
        setSectionError((se) => ({
          ...se,
          [section]: e instanceof Error ? e.message : 'Reset failed',
        }));
      } finally {
        setResetting(null);
      }
    },
    [load],
  );

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-full bg-[var(--bg-primary)] p-6 md:p-10">
        <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Settings
          </h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            You need administrator access to view system settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--bg-primary)] p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            System settings
          </h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Configure your hub. Changes apply per section.
          </p>
        </header>

        {loadError && (
          <div
            className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-3">
            {SECTIONS.map((section) => {
              const isOpen = open === section;
              const sectionData = data[section] ?? {};
              const keys = Object.keys(sectionData).filter((k) => !k.startsWith('__'));
              const err = sectionError[section];
              return (
                <div
                  key={section}
                  ref={(el) => {
                    sectionRefs.current[section] = el;
                  }}
                  className="scroll-mt-18 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] transition-colors hover:border-[var(--border-hover)]"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : section)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-lg font-medium text-[var(--text-primary)]">
                      {labelize(section)}
                    </span>
                    <span
                      className={`text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      ▼
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[var(--border)] px-5 py-5">
                      {keys.length === 0 ? (
                        <p className="text-sm text-[var(--text-muted)]">
                          No fields in this section.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {keys.map((key) =>
                            renderField(
                              key,
                              sectionData[key],
                              `${section}.${key}`,
                              `${section}-${key}`,
                              (value) => setField(section, key, value),
                            ),
                          )}
                        </div>
                      )}

                      {err && (
                        <p
                          className="mt-4 text-sm text-[var(--danger)]"
                          role="alert"
                        >
                          {err}
                        </p>
                      )}

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={saving === section}
                          onClick={() => void saveSection(section)}
                          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                        >
                          {saving === section ? 'Saving…' : 'Save section'}
                        </button>
                        <button
                          type="button"
                          disabled={resetting === section}
                          onClick={() => void resetSection(section)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          {resetting === section ? 'Resetting…' : 'Reset to defaults'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
