import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useDeviceStore } from '../stores/device-store';
import DeviceCard, { type DeviceCardDevice } from '../components/DeviceCard';

type Room = {
  room_id: string;
  name: string;
  floor: string;
};

type HubDevice = {
  device_id: string;
  device_type: string;
  protocol: string;
  name: string;
  room_id: string | null;
  online: boolean;
  supports?: string[];
  state: Record<string, unknown>;
};

type ScenesResponse = {
  scenes: { scene_id: string; name: string; icon?: string }[];
  active_scene_id: string | null;
};

function toCardDevice(d: HubDevice, onlineOverride?: boolean): DeviceCardDevice {
  const allowed: DeviceCardDevice['device_type'][] = [
    'light',
    'switch',
    'lock',
    'thermostat',
    'contact_sensor',
    'motion_sensor',
    'environment_sensor',
    'blinds',
    'camera',
    'fan',
    'garage_door',
    'doorbell',
  ];
  const dt = allowed.includes(d.device_type as DeviceCardDevice['device_type'])
    ? (d.device_type as DeviceCardDevice['device_type'])
    : 'light';
  return {
    device_id: d.device_id,
    device_type: dt,
    name: d.name,
    online: onlineOverride ?? d.online,
    supports: d.supports,
  };
}

function mergedState(
  device: HubDevice,
  storeSlice: Record<string, unknown> | undefined
): Record<string, unknown> {
  return { ...(device.state ?? {}), ...(storeSlice ?? {}) };
}

const SENSOR_TYPES = new Set(['contact_sensor', 'motion_sensor', 'environment_sensor']);

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const states = useDeviceStore((s) => s.states);
  const availability = useDeviceStore((s) => s.availability);
  const updateDeviceState = useDeviceStore((s) => s.updateDeviceState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [roomList, deviceList, scenesData] = await Promise.all([
          api.get<Room[]>('/rooms'),
          api.get<HubDevice[]>('/devices'),
          api.get<ScenesResponse>('/scenes'),
        ]);
        if (cancelled) return;
        setRooms(roomList);
        setDevices(deviceList);
        setActiveSceneId(scenesData.active_scene_id);
        const active = scenesData.scenes.find((s) => s.scene_id === scenesData.active_scene_id);
        setSceneName(active?.name ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const roomDeviceMap = useMemo(() => {
    const map = new Map<string, HubDevice[]>();
    for (const d of devices) {
      const key = d.room_id ?? '__unassigned__';
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [devices]);

  const orderedSections = useMemo(() => {
    const sections: { key: string; title: string; roomId: string | null }[] = rooms
      .slice()
      .sort((a, b) => {
        const fa = a.floor || '';
        const fb = b.floor || '';
        if (fa !== fb) return fa.localeCompare(fb);
        return a.name.localeCompare(b.name);
      })
      .map((r) => ({ key: r.room_id, title: r.name, roomId: r.room_id }));
    if (roomDeviceMap.has('__unassigned__')) {
      sections.push({ key: '__unassigned__', title: 'Unassigned', roomId: null });
    }
    return sections;
  }, [rooms, roomDeviceMap]);

  const handleCommand = useCallback(
    async (deviceId: string, action: string, properties: Record<string, unknown>) => {
      updateDeviceState(deviceId, properties);
      try {
        await api.post(`/devices/${deviceId}/command`, { action, properties });
      } catch {
        setDevices((prev) => [...prev]);
      }
    },
    [updateDeviceState]
  );

  const handleRoomAllOn = async (roomId: string) => {
    try {
      await api.post(`/rooms/${roomId}/command`, {
        action: 'set',
        properties: { on: true },
        device_types: ['light', 'switch', 'fan'],
      });
    } catch {
      setDevices((prev) => [...prev]);
    }
  };

  const handleRoomAllOff = async (roomId: string) => {
    try {
      await api.post(`/rooms/${roomId}/command`, {
        action: 'set',
        properties: { on: false },
        device_types: ['light', 'switch', 'fan', 'blinds'],
      });
    } catch {
      setDevices((prev) => [...prev]);
    }
  };

  const toggleCollapsed = (key: string) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  };

  if (loading) {
    return (
      <div className="p-4 text-[var(--text-secondary)]">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-[var(--danger)]">{error}</div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--bg-primary)] p-4 md:p-6">
      {activeSceneId && sceneName && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-glow)] px-4 py-3">
          <span className="text-lg" aria-hidden>
            ◆
          </span>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
              Active scene
            </div>
            <div className="text-[var(--text-primary)]">{sceneName}</div>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--border)] [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {orderedSections.map((section) => {
          const list = roomDeviceMap.get(section.key) ?? [];
          if (!list.length) return null;
          const isCollapsed = Boolean(collapsed[section.key]);
          return (
            <section key={section.key}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(section.key)}
                  className="flex flex-1 items-center gap-2 text-left min-w-0"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={[
                      'shrink-0 text-[var(--text-muted)] transition-transform',
                      isCollapsed ? '' : 'rotate-90',
                    ].join(' ')}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <span className="truncate text-base font-semibold text-[var(--text-primary)]">
                    {section.title}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{list.length}</span>
                </button>
                {section.roomId && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRoomAllOn(section.roomId!)}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] hover:text-[var(--accent)]"
                    >
                      All On
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRoomAllOff(section.roomId!)}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
                    >
                      All Off
                    </button>
                  </div>
                )}
              </div>
              {!isCollapsed && (() => {
                const controllable = list.filter((d) => !SENSOR_TYPES.has(d.device_type));
                const sensors = list.filter((d) => SENSOR_TYPES.has(d.device_type));
                return (
                  <div className="space-y-3">
                    {controllable.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {controllable.map((d) => {
                          const storeState = states[d.device_id];
                          const liveOnline = availability[d.device_id];
                          const online = liveOnline !== undefined ? liveOnline : d.online;
                          return (
                            <DeviceCard
                              key={d.device_id}
                              device={toCardDevice(d, online)}
                              state={mergedState(d, storeState)}
                              onCommand={(action, properties) =>
                                handleCommand(d.device_id, action, properties)
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                    {sensors.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        {sensors.map((d) => {
                          const storeState = states[d.device_id];
                          const liveOnline = availability[d.device_id];
                          const online = liveOnline !== undefined ? liveOnline : d.online;
                          return (
                            <DeviceCard
                              key={d.device_id}
                              compact
                              device={toCardDevice(d, online)}
                              state={mergedState(d, storeState)}
                              onCommand={(action, properties) =>
                                handleCommand(d.device_id, action, properties)
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          );
        })}
      </div>
    </div>
  );
}
