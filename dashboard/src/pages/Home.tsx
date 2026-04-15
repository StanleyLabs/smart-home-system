import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../lib/api';
import type { Room, HubDevice } from '../lib/hub-types';
import { toCardDevice, mergedState } from '../lib/device-card-bridge';
import { useDeviceCommand } from '../hooks/use-device-command';
import { Spinner } from '../components/Spinner';
import { useDeviceStore } from '../stores/device-store';
import DeviceCard from '../components/DeviceCard';

type ScenesResponse = {
  scenes: { scene_id: string; name: string; icon?: string }[];
  active_scene_id: string | null;
};

type MeResponse = {
  user_preferences: {
    notifications: Record<string, unknown>;
    dashboard: {
      home_room_order?: string[];
      [key: string]: unknown;
    };
  };
};

const SENSOR_TYPES = new Set(['contact_sensor', 'motion_sensor', 'environment_sensor']);

function DragHandle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-[var(--text-muted)] opacity-60">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function SortableHomeSection({
  sectionKey,
  render,
}: {
  sectionKey: string;
  render: (listeners: Record<string, unknown>) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionKey });

  const style = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, x: 0, scaleX: 1, scaleY: 1 } : null
    ),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <section ref={setNodeRef} style={style} {...attributes} data-section={sectionKey}>
      {render(listeners ?? {})}
    </section>
  );
}

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [homeRoomOrder, setHomeRoomOrder] = useState<string[]>([]);

  const states = useDeviceStore((s) => s.states);
  const availability = useDeviceStore((s) => s.availability);

  const bumpDevices = useCallback(() => setDevices((prev) => [...prev]), []);
  const handleCommand = useDeviceCommand(bumpDevices);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [roomList, deviceList, scenesData, me] = await Promise.all([
          api.get<Room[]>('/rooms'),
          api.get<HubDevice[]>('/devices'),
          api.get<ScenesResponse>('/scenes'),
          api.get<MeResponse>('/users/me'),
        ]);
        if (cancelled) return;
        setRooms(roomList);
        setDevices(deviceList);
        setActiveSceneId(scenesData.active_scene_id);
        const active = scenesData.scenes.find((s) => s.scene_id === scenesData.active_scene_id);
        setSceneName(active?.name ?? null);
        const order = me.user_preferences?.dashboard?.home_room_order;
        setHomeRoomOrder(Array.isArray(order) ? order : []);
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

  const defaultVisibleKeys = useMemo(() => {
    const withDevices = rooms
      .filter((r) => (roomDeviceMap.get(r.room_id)?.length ?? 0) > 0)
      .sort((a, b) => {
        const fa = a.floor || '';
        const fb = b.floor || '';
        if (fa !== fb) return fa.localeCompare(fb);
        return a.name.localeCompare(b.name);
      })
      .map((r) => r.room_id);
    const keys = [...withDevices];
    if ((roomDeviceMap.get('__unassigned__')?.length ?? 0) > 0) {
      keys.push('__unassigned__');
    }
    return keys;
  }, [rooms, roomDeviceMap]);

  const orderedKeys = useMemo(() => {
    const visible = new Set(defaultVisibleKeys);
    const fromUser = homeRoomOrder.filter((k) => visible.has(k));
    const seen = new Set(fromUser);
    const tail = defaultVisibleKeys.filter((k) => !seen.has(k));
    return [...fromUser, ...tail];
  }, [homeRoomOrder, defaultVisibleKeys]);

  const orderedSections = useMemo(() => {
    return orderedKeys.map((key) => {
      const title =
        key === '__unassigned__'
          ? 'Unassigned'
          : rooms.find((r) => r.room_id === key)?.name ?? key;
      return {
        key,
        title,
        roomId: key === '__unassigned__' ? null : key,
      };
    });
  }, [orderedKeys, rooms]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedKeys.indexOf(active.id as string);
    const newIndex = orderedKeys.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = [...orderedKeys];
    const next = [...orderedKeys];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, active.id as string);
    setHomeRoomOrder(next);

    try {
      await api.patch<{ user_preferences: MeResponse['user_preferences'] }>('/users/me', {
        user_preferences: { dashboard: { home_room_order: next } },
      });
    } catch {
      setHomeRoomOrder(previous);
    }
  };

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
    return <Spinner />;
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-[var(--border)] [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
            {orderedSections.map((section) => {
              const list = roomDeviceMap.get(section.key) ?? [];
              if (!list.length) return null;
              const isCollapsed = Boolean(collapsed[section.key]);
              return (
                <SortableHomeSection
                  key={section.key}
                  sectionKey={section.key}
                  render={(listeners: Record<string, unknown>) => (
                    <>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          <button
                            type="button"
                            {...listeners}
                            className="cursor-grab touch-none rounded p-0.5 transition-colors hover:bg-[var(--bg-card-active)] active:cursor-grabbing"
                            title="Drag to reorder"
                          >
                            <DragHandle />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(section.key)}
                            className="flex flex-1 items-center gap-2 rounded-md py-1 pl-1 pr-1 -my-1 text-left min-w-0 transition-colors hover:bg-[var(--bg-card-active)]/35"
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
                        </div>
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
                        const sensorsList = list.filter((d) => SENSOR_TYPES.has(d.device_type));
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
                            {sensorsList.length > 0 && (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                                {sensorsList.map((d) => {
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
                    </>
                  )}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
