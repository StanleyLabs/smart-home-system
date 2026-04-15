import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { InlineError } from '../components/InlineError';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { useAuthStore } from '../stores/auth-store';
import { useDeviceStore } from '../stores/device-store';
import { PencilIcon, TrashIcon } from '../components/action-icons';
import DeviceCard from '../components/DeviceCard';

const SENSOR_TYPES = new Set(['contact_sensor', 'motion_sensor', 'environment_sensor']);

type FloorOrderRow = { floor_name: string; sort_index: number };

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

function ChevronIcon({ open }: { open: boolean }) {
  return (
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
        open ? 'rotate-90' : '',
      ].join(' ')}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function AllOnOffButtons({
  onAllOn,
  onAllOff,
}: {
  onAllOn: () => void;
  onAllOff: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        onClick={onAllOn}
        className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] hover:text-[var(--accent)]"
      >
        All On
      </button>
      <button
        type="button"
        onClick={onAllOff}
        className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
      >
        All Off
      </button>
    </div>
  );
}

function SortableFloorSection({
  floorKey,
  render,
}: {
  floorKey: string;
  render: (listeners: Record<string, unknown>) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: floorKey });

  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, x: 0, scaleX: 1, scaleY: 1 } : null),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <section ref={setNodeRef} style={style} {...attributes} data-floor={floorKey}>
      {render(listeners ?? {})}
    </section>
  );
}

export default function Rooms() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const canEditFloor = user?.role === 'admin' || user?.role === 'member';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFloor, setNewFloor] = useState('');
  const [creating, setCreating] = useState(false);

  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editName, setEditName] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [floorOrder, setFloorOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingFloorKey, setEditingFloorKey] = useState<string | null>(null);
  const [floorRenameDraft, setFloorRenameDraft] = useState('');
  const [floorRenameBusy, setFloorRenameBusy] = useState(false);
  const floorNameInputRef = useRef<HTMLInputElement>(null);
  const floorRenameCommitLock = useRef(false);

  const states = useDeviceStore((s) => s.states);
  const availability = useDeviceStore((s) => s.availability);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomList, deviceList, orderRows] = await Promise.all([
        api.get<Room[]>('/rooms'),
        api.get<HubDevice[]>('/devices'),
        api.get<FloorOrderRow[]>('/floors/order'),
      ]);
      setRooms(roomList);
      setDevices(deviceList);
      setFloorOrder(orderRows.map((r) => r.floor_name));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countByRoom = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of devices) {
      if (!d.room_id) continue;
      m.set(d.room_id, (m.get(d.room_id) ?? 0) + 1);
    }
    return m;
  }, [devices]);

  const devicesByRoom = useMemo(() => {
    const m = new Map<string, HubDevice[]>();
    for (const d of devices) {
      if (!d.room_id) continue;
      const list = m.get(d.room_id) ?? [];
      list.push(d);
      m.set(d.room_id, list);
    }
    return m;
  }, [devices]);

  const handleCommand = useDeviceCommand(load);

  const showFloorSections = useMemo(() => {
    const keys = new Set(rooms.map((r) => (r.floor ?? '').trim()));
    return keys.size > 1;
  }, [rooms]);

  const floorGroups = useMemo(() => {
    const map = new Map<string, Room[]>();
    for (const r of rooms) {
      const key = (r.floor ?? '').trim();
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const allKeys = [...map.keys()];

    const orderedKeys: string[] = [];
    for (const k of floorOrder) {
      if (allKeys.includes(k)) orderedKeys.push(k);
    }
    for (const k of allKeys.sort((a, b) => a.localeCompare(b))) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }

    return orderedKeys.map((floorKey) => ({ floorKey, rooms: map.get(floorKey)! }));
  }, [rooms, floorOrder]);

  const floorIds = useMemo(() => floorGroups.map((g) => g.floorKey), [floorGroups]);

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort((a, b) => {
        const fa = a.floor || '';
        const fb = b.floor || '';
        if (fa !== fb) return fa.localeCompare(fb);
        return a.name.localeCompare(b.name);
      }),
    [rooms]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = floorIds.indexOf(active.id as string);
    const newIndex = floorIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...floorIds];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, active.id as string);
    setFloorOrder(next);

    try {
      await api.put('/floors/order', next);
    } catch {
      setFloorOrder(floorIds);
    }
  };

  const toggleCollapsed = (key: string) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  };

  const commitFloorRename = async (oldKey: string, group: Room[], draft: string) => {
    if (floorRenameCommitLock.current) return;
    const trimmed = draft.trim();
    if (trimmed === oldKey) {
      setEditingFloorKey(null);
      setFloorRenameDraft('');
      return;
    }
    floorRenameCommitLock.current = true;
    setFloorRenameBusy(true);
    setError(null);
    try {
      await Promise.all(
        group.map((r) => api.put(`/rooms/${r.room_id}`, { name: r.name, floor: trimmed })),
      );
      const nextOrder = floorOrder.map((k) => (k === oldKey ? trimmed : k));
      const seen = new Set<string>();
      const deduped = nextOrder.filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      await api.put('/floors/order', deduped);
      const ckOld = oldKey || '__empty';
      const ckNew = trimmed || '__empty';
      if (ckOld !== ckNew) {
        setCollapsed((c) => {
          const v = c[ckOld];
          if (v === undefined) return c;
          const next = { ...c };
          delete next[ckOld];
          next[ckNew] = v;
          return next;
        });
      }
      setEditingFloorKey(null);
      setFloorRenameDraft('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename floor');
    } finally {
      setFloorRenameBusy(false);
      floorRenameCommitLock.current = false;
    }
  };

  useLayoutEffect(() => {
    if (editingFloorKey === null) return;
    const el = floorNameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingFloorKey]);

  const handleFloorAllOn = async (floorName: string) => {
    try {
      await api.post(`/floors/${encodeURIComponent(floorName)}/command`, {
        action: 'set',
        properties: { on: true },
        device_types: ['light', 'switch', 'fan'],
      });
    } catch {
      /* ignore */
    }
  };

  const handleFloorAllOff = async (floorName: string) => {
    try {
      await api.post(`/floors/${encodeURIComponent(floorName)}/command`, {
        action: 'set',
        properties: { on: false },
        device_types: ['light', 'switch', 'fan', 'blinds'],
      });
    } catch {
      /* ignore */
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
      /* ignore */
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
      /* ignore */
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post<Room>('/rooms', { name: newName.trim(), floor: newFloor.trim() });
      setNewName('');
      setNewFloor('');
      setAddRoomOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRoom || !editName.trim()) return;
    setEditBusy(true);
    try {
      await api.put(`/rooms/${editRoom.room_id}`, {
        name: editName.trim(),
        floor: editFloor.trim(),
      });
      setEditRoom(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update room');
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRoom) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/rooms/${deleteRoom.room_id}`);
      if (selectedId === deleteRoom.room_id) setSelectedId(null);
      setDeleteRoom(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete room');
    } finally {
      setDeleteBusy(false);
    }
  };

  const renderDevicePanel = (roomId: string, roomName: string) => {
    const list = devicesByRoom.get(roomId) ?? [];
    if (list.length === 0) {
      return (
        <div className="rounded-xl border border-[var(--border)] border-dashed bg-[var(--bg-card)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          No devices in {roomName}.
        </div>
      );
    }
    const controllable = list.filter((d) => !SENSOR_TYPES.has(d.device_type));
    const sensorsList = list.filter((d) => SENSOR_TYPES.has(d.device_type));
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl">
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
      </div>
    );
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<{ left: number; width: number } | null>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!selectedId || !activeCardRef.current || !gridRef.current) {
      setPanelStyle(null);
      return;
    }
    const gridRect = gridRef.current.getBoundingClientRect();
    const cardRect = activeCardRef.current.getBoundingClientRect();
    setPanelStyle({
      left: gridRect.left - cardRect.left,
      width: gridRect.width,
    });
  }, [selectedId]);

  const renderRoomCard = (r: Room, showFloorInSubtitle: boolean) => {
    const count = countByRoom.get(r.room_id) ?? 0;
    const active = selectedId === r.room_id;
    return (
      <div key={r.room_id} className={['relative z-[31]', active ? 'z-[41]' : ''].join(' ')} ref={active ? activeCardRef : undefined}>
        <div
          className={[
            'relative rounded-xl border p-4 transition-colors',
            active
              ? 'border-[var(--accent)] bg-[var(--bg-card-active)]'
              : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]',
          ].join(' ')}
        >
          {count > 0 && (
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1 sm:right-3 sm:top-2.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRoomAllOn(r.room_id); }}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] hover:text-[var(--accent)]"
              >
                All On
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRoomAllOff(r.room_id); }}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
              >
                All Off
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSelectedId((id) => (id === r.room_id ? null : r.room_id))}
            className="w-full pr-28 text-left"
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{r.name}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {count} device{count === 1 ? '' : 's'}
              {showFloorInSubtitle && r.floor ? ` · ${r.floor}` : ''}
            </p>
          </button>
          <div className="absolute right-2 bottom-2 z-10 flex items-center gap-0.5 sm:right-3 sm:bottom-2.5">
            <button
              type="button"
              onClick={() => {
                setEditRoom(r);
                setEditName(r.name);
                setEditFloor(r.floor);
              }}
              title="Edit room"
              className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
            >
              <PencilIcon />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setDeleteRoom(r)}
                title="Delete room"
                className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
        {active && (
          <>
            {/* pointer-events-none so the page can scroll; panel below uses pointer-events-auto */}
            <div className="fixed inset-0 z-30 pointer-events-none" aria-hidden />
            <div
              className="pointer-events-auto absolute top-full z-40 mt-2"
              style={panelStyle ? { left: panelStyle.left, width: panelStyle.width } : { left: 0, right: 0 }}
            >
              {renderDevicePanel(r.room_id, r.name)}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRoomGrid = (roomList: Room[], showFloorInSubtitle: boolean) => (
    <div ref={gridRef} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {roomList.map((r) => renderRoomCard(r, showFloorInSubtitle))}
    </div>
  );

  if (loading && !rooms.length) {
    return <Spinner />;
  }

  return (
    <div className="min-h-full bg-[var(--bg-primary)] p-4 md:p-6">
      <PageHeader
        title="Rooms"
        subtitle={`${rooms.length} room${rooms.length === 1 ? '' : 's'}`}
        action={
          <button
            type="button"
            onClick={() => setAddRoomOpen(true)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            Add Room
          </button>
        }
      />

      <InlineError message={error} />

      {showFloorSections ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={floorIds} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-[var(--border)] [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
              {floorGroups.map(({ floorKey, rooms: group }) => {
                const isOpen = !collapsed[floorKey || '__empty'];
                return (
                  <SortableFloorSection
                    key={floorKey || '__empty'}
                    floorKey={floorKey || '__empty'}
                    render={(listeners) => (
                      <>
                        <div className="mb-3 flex w-full min-w-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            {...listeners}
                            className="shrink-0 cursor-grab touch-none rounded p-0.5 transition-colors hover:bg-[var(--bg-card-active)] active:cursor-grabbing"
                            title="Drag to reorder"
                          >
                            <DragHandle />
                          </button>
                          <div
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 pl-1 pr-1 -my-1 hover:bg-[var(--bg-card-active)]/35"
                            onClick={() => {
                              if (editingFloorKey === floorKey) return;
                              toggleCollapsed(floorKey || '__empty');
                            }}
                            onKeyDown={(e) => {
                              if (editingFloorKey === floorKey) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleCollapsed(floorKey || '__empty');
                              }
                            }}
                            tabIndex={0}
                            aria-expanded={isOpen}
                            aria-label={floorKey ? `Floor ${floorKey}` : 'Unassigned floor'}
                          >
                            <span className="shrink-0 text-[var(--text-muted)]" aria-hidden>
                              <ChevronIcon open={isOpen} />
                            </span>
                            {editingFloorKey === floorKey ? (
                              <input
                                ref={floorNameInputRef}
                                type="text"
                                value={floorRenameDraft}
                                onChange={(e) => setFloorRenameDraft(e.target.value)}
                                disabled={floorRenameBusy}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onBlur={() => void commitFloorRename(floorKey, group, floorRenameDraft)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setFloorRenameDraft(floorKey);
                                    setEditingFloorKey(null);
                                  }
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    (e.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                                placeholder={floorKey === '' ? 'No floor' : 'Floor name'}
                                className="min-w-[8rem] max-w-[min(22rem,55vw)] shrink border-0 border-b border-transparent bg-transparent py-0.5 text-base font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                              />
                            ) : (
                              <span className="max-w-[min(24rem,50vw)] shrink truncate text-base font-semibold text-[var(--text-primary)]">
                                {floorKey || 'No floor'}
                              </span>
                            )}
                            {canEditFloor && editingFloorKey !== floorKey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setEditingFloorKey(floorKey);
                                  setFloorRenameDraft(floorKey);
                                }}
                                title="Rename floor"
                                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-active)] hover:text-[var(--text-primary)]"
                              >
                                <PencilIcon />
                              </button>
                            )}
                            <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{group.length}</span>
                            <span className="min-h-[1.75rem] min-w-6 flex-1" aria-hidden />
                          </div>
                          <div className="shrink-0">
                            <AllOnOffButtons
                              onAllOn={() => handleFloorAllOn(floorKey)}
                              onAllOff={() => handleFloorAllOff(floorKey)}
                            />
                          </div>
                        </div>
                        {isOpen && renderRoomGrid(group, false)}
                      </>
                    )}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        renderRoomGrid(sortedRooms, true)
      )}

      {/* Modals */}
      {addRoomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-room-title"
        >
          <form
            onSubmit={createRoom}
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
          >
            <h2 id="add-room-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Add room
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                  placeholder="Living room"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Floor</label>
                <input
                  value={newFloor}
                  onChange={(e) => setNewFloor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                  placeholder="1"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddRoomOpen(false);
                  setNewName('');
                  setNewFloor('');
                }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {creating ? 'Adding…' : 'Add Room'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={saveEdit}
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Edit room</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-secondary)]">Floor</label>
                <input
                  value={editFloor}
                  onChange={(e) => setEditFloor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditRoom(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editBusy}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {editBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Delete room</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Delete &ldquo;{deleteRoom.name}&rdquo;? Devices in this room will become unassigned.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRoom(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
                className="rounded-lg bg-[var(--danger)] px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
