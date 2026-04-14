export interface Device {
  device_id: string;
  device_type: DeviceType;
  protocol: Protocol;
  protocol_id: string;
  name: string;
  room_id: string | null;
  groups: string[];
  manufacturer: string;
  model: string;
  firmware: string;
  online: boolean;
  last_seen: string;
  commissioned_at: string;
  supports: string[];
  config: Record<string, any>;
}

export type DeviceType =
  | "light"
  | "switch"
  | "contact_sensor"
  | "motion_sensor"
  | "thermostat"
  | "lock"
  | "environment_sensor"
  | "blinds"
  | "camera"
  | "fan"
  | "garage_door"
  | "doorbell"
  | "unknown";

export type Protocol = "matter" | "zigbee" | "zwave";

export interface DeviceState {
  [property: string]: any;
}

export interface Room {
  room_id: string;
  name: string;
  floor: string;
}

export interface Group {
  group_id: string;
  name: string;
  system?: boolean;
}

export interface Scene {
  scene_id: string;
  name: string;
  icon: string;
  snapshot: Record<string, DeviceState>;
  transition_seconds: number;
}

export interface AutomationRule {
  rule_id: string;
  name: string;
  enabled: boolean;
  retrigger: {
    behavior: "restart" | "ignore" | "queue";
    cooldown_seconds: number;
  };
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  condition_logic: "all" | "any";
}

export type Trigger =
  | DeviceStateTrigger
  | ScheduleTrigger
  | TimeTrigger
  | AvailabilityTrigger;

export interface DeviceStateTrigger {
  type: "device_state";
  device_id: string;
  property: string;
  to: any;
}

export interface ScheduleTrigger {
  type: "schedule";
  cron: string;
}

export interface TimeTrigger {
  type: "time";
  at: string;
  offset_minutes?: number;
}

export interface AvailabilityTrigger {
  type: "availability";
  device_id: string;
  to: "online" | "offline";
}

export type Condition =
  | TimeRangeCondition
  | DeviceStateCondition
  | SceneActiveCondition;

export interface TimeRangeCondition {
  type: "time_range";
  after: string;
  before: string;
}

export interface DeviceStateCondition {
  type: "device_state";
  device_id: string;
  property: string;
  equals: any;
}

export interface SceneActiveCondition {
  type: "scene_active";
  scene_id: string;
}

export type Action =
  | DeviceCommandAction
  | ActivateSceneAction
  | DelayAction
  | NotifyAction
  | PublishEventAction;

export interface DeviceCommandAction {
  type: "device_command";
  device_id: string;
  action: string;
  properties: Record<string, any>;
}

export interface ActivateSceneAction {
  type: "activate_scene";
  scene_id: string;
}

export interface DelayAction {
  type: "delay";
  seconds: number;
}

export interface NotifyAction {
  type: "notify";
  channel: string;
  message: string;
}

export interface PublishEventAction {
  type: "publish_event";
  event: string;
  details: Record<string, any>;
}

export interface MqttEnvelope {
  id: string;
  timestamp: string;
  source: string;
  type: "state" | "command" | "event" | "response";
  payload: Record<string, any>;
}

export interface HistoryEntry {
  history_id: string;
  timestamp: string;
  source: string;
  action_type: "device" | "room" | "group" | "scene";
  changes: {
    device_id: string;
    before: DeviceState;
    after: DeviceState;
  }[];
}

export interface Notification {
  notification_id: string;
  timestamp: string;
  priority: "critical" | "high" | "normal" | "low";
  title: string;
  message: string;
  source: {
    type: "automation" | "device" | "system";
    id: string;
  };
  device_id?: string;
  channels: string[];
  recipients: string[];
  acknowledged: boolean;
  grouped?: boolean;
  group_count?: number;
}

export interface User {
  user_id: string;
  username: string;
  display_name: string;
  role: "admin" | "member" | "guest";
  password_hash: string | null;
  pin_hash: string;
  guest_config: {
    allowed_rooms?: string[];
    expires_at?: string;
  } | null;
  notification_preferences: Record<string, any>;
  created_at: string;
}

export interface Session {
  token: string;
  user_id: string;
  interface: string;
  issued_at: string;
  expires_at: string;
}

export interface AdapterStatus {
  protocol: Protocol;
  running: boolean;
  device_count: number;
  error?: string;
  capabilities?: Record<string, boolean>;
}

export interface DiscoveredDevice {
  temp_id: string;
  protocol: Protocol;
  device_type: DeviceType;
  manufacturer: string;
  model: string;
  requires_code: boolean;
}

export type SetupQueueStatus = "waiting" | "connecting" | "online" | "failed";

export interface SetupQueueEntry {
  entry_id: string;
  name: string;
  room_id: string | null;
  device_type: DeviceType;
  protocol: Protocol;
  setup_payload: string;
  manufacturer: string;
  model: string;
  status: SetupQueueStatus;
  device_id: string | null;
  error: string | null;
  created_at: string;
}

export interface SystemSettings {
  hub: {
    name: string;
    location: { latitude: number; longitude: number; timezone: string };
    units: { temperature: string; distance: string };
    language: string;
  };
  network: {
    hostname: string;
    api_port: number;
    protocol: string;
    mqtt: {
      broker_host: string;
      broker_port: number;
      websocket_port: number;
      websocket_protocol: string;
      require_auth: boolean;
      /** When true (default), hub runs an in-process broker so Mosquitto is not required. */
      embedded_broker?: boolean;
    };
    remote_access: { enabled: boolean };
    wifi?: { ssid: string; configured: boolean };
  };
  protocols: Record<string, any>;
  automations: {
    global_rate_limit_per_device: number;
    rate_limit_window_seconds: number;
  };
  notifications: {
    grouping: {
      enabled: boolean;
      window_seconds: number;
      max_group_size: number;
    };
  };
  updates: Record<string, any>;
  security: {
    session_expiry_hours: number;
    pin_lockout_attempts: number;
    pin_lockout_minutes: number;
    min_admin_password_length: number;
    min_pin_length: number;
  };
  storage: {
    event_log_retention_days: number;
    undo_history_size: number;
    state_write_interval_seconds: number;
  };
  backup: Record<string, any>;
}

export const SYSTEM_GROUPS: Record<string, { name: string; device_types: DeviceType[] | null }> = {
  system_all: { name: "All Devices", device_types: null },
  system_all_lights: { name: "All Lights", device_types: ["light"] },
  system_all_switches: { name: "All Switches", device_types: ["switch"] },
  system_all_locks: { name: "All Locks", device_types: ["lock"] },
  system_all_sensors: {
    name: "All Sensors",
    device_types: ["contact_sensor", "motion_sensor", "environment_sensor"],
  },
  system_all_blinds: { name: "All Blinds", device_types: ["blinds"] },
  system_all_thermostats: { name: "All Thermostats", device_types: ["thermostat"] },
  system_all_cameras: { name: "All Cameras", device_types: ["camera"] },
  system_all_fans: { name: "All Fans", device_types: ["fan"] },
  system_all_garage_doors: { name: "All Garage Doors", device_types: ["garage_door"] },
  system_all_doorbells: { name: "All Doorbells", device_types: ["doorbell"] },
};

export function getBaseUrl(network: SystemSettings["network"]): string {
  const { protocol, hostname, api_port } = network;
  const isDefaultPort =
    (protocol === "http" && api_port === 80) ||
    (protocol === "https" && api_port === 443);
  return `${protocol}://${hostname}${isDefaultPort ? "" : `:${api_port}`}`;
}
