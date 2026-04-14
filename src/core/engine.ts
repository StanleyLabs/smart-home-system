import { v4 as uuid } from "uuid";
import { DeviceRegistry } from "./device-registry.js";
import { StateManager } from "./state-manager.js";
import { AutomationEngine } from "./automation-engine.js";
import { SceneManager } from "./scene-manager.js";
import { UndoSystem } from "./undo-system.js";
import { NotificationSystem } from "./notification-system.js";
import { SetupQueue } from "./setup-queue.js";
import type { ProtocolAdapter } from "../adapters/types.js";
import type {
  AdapterStatus,
  Device,
  DeviceState,
  DeviceType,
  DiscoveredDevice,
  MqttEnvelope,
  Protocol,
  SystemSettings,
} from "../types.js";

export type MqttPublisher = (topic: string, message: MqttEnvelope) => void;

export class Engine {
  readonly devices: DeviceRegistry;
  readonly state: StateManager;
  readonly automations: AutomationEngine;
  readonly scenes: SceneManager;
  readonly undo: UndoSystem;
  readonly notifications: NotificationSystem;
  readonly setupQueue: SetupQueue;

  private adapters = new Map<string, ProtocolAdapter>();
  private pendingDiscoveries = new Map<string, DiscoveredDevice>();
  private discoveryActive = false;
  private queueProcessing = new Set<string>();
  private queueDiscoveryTimer: ReturnType<typeof setInterval> | null = null;

  publish: MqttPublisher = () => {};

  constructor(settings: SystemSettings) {
    this.devices = new DeviceRegistry();
    this.state = new StateManager();
    this.automations = new AutomationEngine();
    this.scenes = new SceneManager();
    this.undo = new UndoSystem(settings.storage.undo_history_size);
    this.notifications = new NotificationSystem();
    this.setupQueue = new SetupQueue();

    this.automations.configure(
      settings.automations.global_rate_limit_per_device,
      settings.automations.rate_limit_window_seconds
    );
    this.notifications.configure(settings.notifications.grouping);

    this.automations.executeCommand = (deviceId, action, properties, source) =>
      this.handleCommand(deviceId, action, properties, source, false);
    this.automations.activateScene = (sceneId) =>
      this.activateScene(sceneId, "automation");
    this.automations.sendNotification = (channel, message) =>
      this.notifications.send({
        priority: "normal",
        title: "Automation",
        message,
        source: { type: "automation", id: "engine" },
        channels: [channel],
      });
    this.automations.publishEvent = (event, details) =>
      this.publishEvent(event, details);
    this.automations.getDeviceState = (deviceId) =>
      this.state.getState(deviceId);
    this.automations.getActiveScene = () =>
      this.scenes.getActiveSceneId();

    this.notifications.dispatch = (notification) => {
      this.publish(`home/notifications/all`, this.envelope("core", "event", {
        event: "notification",
        ...notification,
      }));
      for (const userId of notification.recipients) {
        this.publish(`home/notifications/${userId}`, this.envelope("core", "event", {
          event: "notification",
          ...notification,
        }));
      }
    };
  }

  registerAdapter(protocol: string, adapter: ProtocolAdapter) {
    adapter.onDeviceDiscovered = (discovered) => {
      this.pendingDiscoveries.set(discovered.temp_id, discovered);
      this.publishEvent("device_discovered", discovered);
      this.processAllWaiting();
    };
    adapter.onStateChange = (protocolId, properties) => {
      const device = this.devices.getByProtocolId(
        adapter.protocol,
        protocolId
      );
      if (!device) return;
      this.handleStateUpdate(device.device_id, properties);
    };
    adapter.onAvailabilityChange = (protocolId, online) => {
      const device = this.devices.getByProtocolId(
        adapter.protocol,
        protocolId
      );
      if (!device) return;
      this.devices.setAvailability(device.device_id, online);
      this.publish(
        `home/devices/${device.device_id}/availability`,
        this.envelope("core", "state", { device_id: device.device_id, online })
      );
      this.automations.onAvailabilityChange(device.device_id, online);
      if (!online) {
        this.notifications.send({
          priority: "high",
          title: "Device Offline",
          message: `${device.name} went offline`,
          source: { type: "device", id: device.device_id },
          device_id: device.device_id,
        });
      }
    };
    this.adapters.set(protocol, adapter);
  }

  async start() {
    this.devices.load();
    this.state.load();
    this.automations.load();
    this.scenes.load();
    this.undo.load();

    this.state.startPeriodicWrite(5);

    for (const [, adapter] of this.adapters) {
      try {
        await adapter.initialize();
      } catch (err) {
        console.error(`Adapter ${adapter.protocol} failed to start:`, err);
      }
    }

    this.publishEvent("hub_started", { timestamp: new Date().toISOString() });

    if (this.setupQueue.getWaiting().length > 0) {
      this.ensureQueueDiscovery();
    }
  }

  async shutdown() {
    this.stopQueueDiscovery();
    this.automations.shutdown();
    this.notifications.shutdown();
    this.state.stopPeriodicWrite();
    this.state.flush();

    for (const [, adapter] of this.adapters) {
      try {
        await adapter.shutdown();
      } catch (err) {
        console.error(`Adapter shutdown error:`, err);
      }
    }
  }

  async startDiscovery() {
    this.discoveryActive = true;
    for (const [, adapter] of this.adapters) {
      try {
        await adapter.startDiscovery();
      } catch (err) {
        console.error(`Discovery start failed for ${adapter.protocol}:`, err);
      }
    }
    this.publishEvent("discovery_started", {});
  }

  async stopDiscovery() {
    this.discoveryActive = false;
    for (const [, adapter] of this.adapters) {
      try {
        await adapter.stopDiscovery();
      } catch (err) {
        console.error(`Discovery stop failed for ${adapter.protocol}:`, err);
      }
    }
    this.publishEvent("discovery_stopped", {});
  }

  isDiscoveryActive() {
    return this.discoveryActive;
  }

  getPendingDiscoveries(): DiscoveredDevice[] {
    return Array.from(this.pendingDiscoveries.values());
  }

  getAdapterStatuses(): AdapterStatus[] {
    return Array.from(this.adapters.values()).map((a) => a.getStatus());
  }

  async handleCommand(
    deviceId: string,
    action: string,
    properties: Record<string, any>,
    source: string,
    userInitiated = true
  ) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error(`Device not found: ${deviceId}`);

    if (userInitiated) {
      const before = this.undo.snapshotState([deviceId], (id) =>
        this.state.getState(id)
      );
      this.undo.push({
        source,
        action_type: "device",
        changes: [
          { device_id: deviceId, before: before[deviceId], after: properties },
        ],
      });
    }

    const adapter = this.adapters.get(device.protocol);
    if (adapter) {
      try {
        await adapter.sendCommand(device.protocol_id, action, properties);
      } catch (err) {
        this.publishEvent("command_failed", {
          device_id: deviceId,
          error: String(err),
        });
        throw err;
      }
    }

    this.handleStateUpdate(deviceId, properties);
  }

  handleRoomCommand(
    roomId: string,
    action: string,
    properties: Record<string, any>,
    source: string,
    deviceTypes?: string[]
  ) {
    let devices = this.devices.getByRoom(roomId);
    if (deviceTypes) {
      devices = devices.filter((d) => deviceTypes.includes(d.device_type));
    }

    const beforeStates = this.undo.snapshotState(
      devices.map((d) => d.device_id),
      (id) => this.state.getState(id)
    );

    const changes = devices.map((d) => ({
      device_id: d.device_id,
      before: beforeStates[d.device_id],
      after: properties,
    }));

    this.undo.push({ source, action_type: "room", changes });

    for (const device of devices) {
      this.handleCommand(device.device_id, action, properties, source, false);
    }
  }

  handleGroupCommand(
    groupId: string,
    action: string,
    properties: Record<string, any>,
    source: string,
    deviceTypes?: string[]
  ) {
    let devices = this.devices.getByGroup(groupId);
    if (deviceTypes) {
      devices = devices.filter((d) => deviceTypes.includes(d.device_type));
    }

    const beforeStates = this.undo.snapshotState(
      devices.map((d) => d.device_id),
      (id) => this.state.getState(id)
    );

    const changes = devices.map((d) => ({
      device_id: d.device_id,
      before: beforeStates[d.device_id],
      after: properties,
    }));

    this.undo.push({ source, action_type: "group", changes });

    for (const device of devices) {
      this.handleCommand(device.device_id, action, properties, source, false);
    }
  }

  activateScene(sceneId: string, source: string) {
    const snapshot = this.scenes.activate(sceneId);
    if (!snapshot) return;

    const deviceIds = Object.keys(snapshot);
    const beforeStates = this.undo.snapshotState(deviceIds, (id) =>
      this.state.getState(id)
    );

    const changes = deviceIds.map((id) => ({
      device_id: id,
      before: beforeStates[id],
      after: snapshot[id],
    }));

    this.undo.push({ source, action_type: "scene", changes });

    for (const [deviceId, properties] of Object.entries(snapshot)) {
      this.handleCommand(deviceId, "set", properties, source, false);
    }

    this.publishEvent("scene_activated", { scene_id: sceneId });
  }

  handleUndo(source: string) {
    const entry = this.undo.undo();
    if (!entry) return;
    for (const change of entry.changes) {
      this.handleCommand(
        change.device_id,
        "set",
        change.before,
        source,
        false
      );
    }
  }

  handleRedo(source: string) {
    const entry = this.undo.redo();
    if (!entry) return;
    for (const change of entry.changes) {
      this.handleCommand(
        change.device_id,
        "set",
        change.after,
        source,
        false
      );
    }
  }

  async commission(tempId: string, credentials: any) {
    const pending = this.pendingDiscoveries.get(tempId);
    if (!pending) throw new Error(`No pending discovery: ${tempId}`);

    const adapter = this.adapters.get(pending.protocol);
    if (!adapter) throw new Error(`No adapter for: ${pending.protocol}`);

    return this.runCommission(adapter, tempId, credentials, {
      device_type: pending.device_type,
      protocol: pending.protocol as Protocol,
      manufacturer: pending.manufacturer,
      model: pending.model,
    });
  }

  async commissionManual(protocol: Protocol, credentials: any) {
    const adapter = this.adapters.get(protocol);
    if (!adapter) throw new Error(`No adapter for: ${protocol}`);

    const tempId = `manual-${Date.now()}`;
    return this.runCommission(adapter, tempId, credentials, {
      device_type: "unknown",
      protocol,
      manufacturer: "Unknown",
      model: "Matter Device",
    });
  }

  private async runCommission(
    adapter: ProtocolAdapter,
    tempId: string,
    credentials: any,
    info: { device_type: DeviceType; protocol: Protocol; manufacturer: string; model: string },
  ) {
    this.publishEvent("commissioning_progress", {
      temp_id: tempId,
      status: "pairing",
      error: null,
    });

    let protocolId: string;
    try {
      protocolId = await adapter.commission(tempId, credentials);
    } catch (err: any) {
      this.publishEvent("commissioning_progress", {
        temp_id: tempId,
        status: "failed",
        error: err.message ?? String(err),
      });
      throw err;
    }

    this.publishEvent("commissioning_progress", {
      temp_id: tempId,
      status: "configuring",
      error: null,
    });

    const defaultName = `${info.manufacturer} ${info.model}`;
    const device = this.devices.register({
      device_type: info.device_type,
      protocol: info.protocol,
      protocol_id: protocolId,
      name: defaultName,
      manufacturer: info.manufacturer,
      model: info.model,
      supports: [],
    });

    this.pendingDiscoveries.delete(tempId);

    this.publishEvent("commissioning_progress", {
      temp_id: tempId,
      status: "complete",
      error: null,
    });

    this.publishEvent("commissioning_complete", {
      device_id: device.device_id,
      protocol: device.protocol,
      protocol_id: device.protocol_id,
      device_type: device.device_type,
      manufacturer: device.manufacturer,
      model: device.model,
      supports: device.supports,
      needs_setup: true,
    });

    return device;
  }

  setupDevice(
    deviceId: string,
    name: string,
    roomId?: string
  ) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error(`Device not found: ${deviceId}`);

    this.devices.update(deviceId, {
      name,
      room_id: roomId ?? null,
    });

    this.publishEvent("device_ready", {
      device_id: deviceId,
      name,
      room_id: roomId ?? null,
    });

    return this.devices.get(deviceId);
  }

  async removeDevice(deviceId: string) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    const adapter = this.adapters.get(device.protocol);
    if (adapter) {
      try {
        await adapter.decommission(device.protocol_id);
      } catch (err) {
        console.error(`Decommission error:`, err);
      }
    }

    this.state.removeDevice(deviceId);
    this.scenes.removeDeviceFromScenes(deviceId);
    this.automations.removeDeviceFromRules(deviceId);
    this.devices.remove(deviceId);

    this.publishEvent("device_removed", { device_id: deviceId });
  }

  publishSetupQueueEvent(event: string, data: Record<string, any>) {
    this.publishEvent(`setup_queue_${event}`, data);
  }

  /** Start discovery polling if there are waiting queue entries. */
  ensureQueueDiscovery() {
    if (this.queueDiscoveryTimer) return;
    const waiting = this.setupQueue.getWaiting();
    if (waiting.length === 0) return;

    if (!this.discoveryActive) {
      this.startDiscovery().catch(() => {});
    }

    this.queueDiscoveryTimer = setInterval(() => {
      const stillWaiting = this.setupQueue.getWaiting();
      if (stillWaiting.length === 0) {
        this.stopQueueDiscovery();
        return;
      }
      this.processAllWaiting();
    }, 30_000);
  }

  private stopQueueDiscovery() {
    if (this.queueDiscoveryTimer) {
      clearInterval(this.queueDiscoveryTimer);
      this.queueDiscoveryTimer = null;
    }
  }

  /** Attempt to commission a single queue entry. */
  async processQueueEntry(entryId: string) {
    const entry = this.setupQueue.get(entryId);
    if (!entry || entry.status === "online" || this.queueProcessing.has(entryId)) return;

    this.queueProcessing.add(entryId);
    this.setupQueue.updateStatus(entryId, "connecting");
    this.publishSetupQueueEvent("entry_updated", { ...entry, status: "connecting" });

    try {
      const device = await this.commissionManual(
        entry.protocol,
        { setup_code: entry.setup_payload }
      );

      this.setupDevice(device.device_id, entry.name, entry.room_id ?? undefined);

      this.setupQueue.updateStatus(entryId, "online", { device_id: device.device_id });
      const updated = this.setupQueue.get(entryId)!;
      this.publishSetupQueueEvent("entry_updated", updated);

      this.notifications.send({
        priority: "normal",
        title: "Device Ready",
        message: `${entry.name} is ready`,
        source: { type: "device", id: device.device_id },
        device_id: device.device_id,
      });
    } catch (err: any) {
      this.setupQueue.updateStatus(entryId, "failed", {
        error: err.message ?? String(err),
      });
      const updated = this.setupQueue.get(entryId)!;
      this.publishSetupQueueEvent("entry_updated", updated);
    } finally {
      this.queueProcessing.delete(entryId);
    }
  }

  /** Attempt all waiting queue entries. */
  processAllWaiting() {
    const waiting = this.setupQueue.getWaiting();
    for (const entry of waiting) {
      this.processQueueEntry(entry.entry_id);
    }
  }

  private handleStateUpdate(deviceId: string, properties: Record<string, any>) {
    const newState = this.state.updateState(deviceId, properties);

    this.publish(
      `home/devices/${deviceId}/state`,
      this.envelope("core", "state", {
        device_id: deviceId,
        properties: newState,
      })
    );

    for (const [prop, value] of Object.entries(properties)) {
      this.automations.onDeviceStateChange(deviceId, prop, value);
    }
  }

  private publishEvent(event: string, details: Record<string, any>) {
    this.publish(
      "home/system/events",
      this.envelope("core", "event", { event, ...details })
    );
  }

  private envelope(
    source: string,
    type: MqttEnvelope["type"],
    payload: Record<string, any>
  ): MqttEnvelope {
    return {
      id: uuid(),
      timestamp: new Date().toISOString(),
      source,
      type,
      payload,
    };
  }
}
