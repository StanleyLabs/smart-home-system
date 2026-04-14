import { create } from 'zustand';

interface DeviceState {
  [property: string]: any;
}

interface DeviceStoreState {
  states: Record<string, DeviceState>;
  availability: Record<string, boolean>;
  notifications: any[];
  canUndo: boolean;
  canRedo: boolean;
  mqttConnected: boolean;

  updateDeviceState: (deviceId: string, properties: Record<string, unknown>) => void;
  setAvailability: (deviceId: string, online: boolean) => void;
  addNotification: (notification: any) => void;
  clearNotifications: () => void;
  setUndoRedo: (canUndo: boolean, canRedo: boolean) => void;
  setMqttConnected: (connected: boolean) => void;
  setInitialStates: (states: Record<string, DeviceState>) => void;
}

export const useDeviceStore = create<DeviceStoreState>((set) => ({
  states: {},
  availability: {},
  notifications: [],
  canUndo: false,
  canRedo: false,
  mqttConnected: false,

  updateDeviceState: (deviceId, properties) =>
    set((s) => ({
      states: {
        ...s.states,
        [deviceId]: { ...s.states[deviceId], ...properties },
      },
    })),

  setAvailability: (deviceId, online) =>
    set((s) => ({
      availability: { ...s.availability, [deviceId]: online },
    })),

  addNotification: (notification) =>
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 100),
    })),

  clearNotifications: () => set({ notifications: [] }),

  setUndoRedo: (canUndo, canRedo) => set({ canUndo, canRedo }),

  setMqttConnected: (connected) => set({ mqttConnected: connected }),

  setInitialStates: (states) => set({ states }),
}));
