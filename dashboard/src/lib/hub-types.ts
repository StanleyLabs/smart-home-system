/** Minimal room reference for components that only need id + name. */
export type RoomListItem = {
  room_id: string;
  name: string;
};

/** Full room as returned by the /rooms API. */
export type Room = RoomListItem & {
  floor: string;
};

/** Device as returned by the /devices API. */
export type HubDevice = {
  device_id: string;
  device_type: string;
  protocol: string;
  name: string;
  room_id: string | null;
  online: boolean;
  manufacturer?: string;
  model?: string;
  supports?: string[];
  state: Record<string, unknown>;
};
