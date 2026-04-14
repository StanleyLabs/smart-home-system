import mqtt from "mqtt";
import { v4 as uuid } from "uuid";
import type { Engine } from "../core/engine.js";
import type { MqttEnvelope, SystemSettings } from "../types.js";

export class MqttBridge {
  private client: mqtt.MqttClient | null = null;
  private engine: Engine;
  private settings: SystemSettings;
  private connected = false;

  constructor(engine: Engine, settings: SystemSettings) {
    this.engine = engine;
    this.settings = settings;
  }

  async connect() {
    const { broker_host, broker_port } = this.settings.network.mqtt;
    const url = `mqtt://${broker_host}:${broker_port}`;

    try {
      this.client = mqtt.connect(url, {
        clientId: `hub-core-${uuid().slice(0, 8)}`,
        clean: true,
        reconnectPeriod: 5000,
      });

      this.client.on("connect", () => {
        this.connected = true;
        console.log("MQTT connected");
        this.subscribe();
      });

      this.client.on("error", (err) => {
        const msg =
          err && typeof err === "object" && "message" in err && (err as Error).message
            ? (err as Error).message
            : String(err);
        const code =
          err && typeof err === "object" && "code" in err
            ? ` (${String((err as { code?: unknown }).code)})`
            : "";
        console.error(`MQTT client error:${code} ${msg || "(no message)"}`);
      });

      this.client.on("close", () => {
        this.connected = false;
      });

      this.client.on("message", (topic, payload) => {
        try {
          const message: MqttEnvelope = JSON.parse(payload.toString());
          if (message.source === "core") return;
          this.handleMessage(topic, message);
        } catch {
          // ignore malformed messages
        }
      });

      this.engine.publish = (topic, message) => {
        if (this.client && this.connected) {
          this.client.publish(topic, JSON.stringify(message), { qos: 1 });
        }
      };
    } catch (err) {
      console.warn("MQTT broker not available, running without MQTT:", (err as Error).message);
      this.engine.publish = () => {};
    }
  }

  private subscribe() {
    if (!this.client) return;
    this.client.subscribe([
      "home/devices/+/command",
      "home/rooms/+/command",
      "home/groups/+/command",
      "home/scenes/activate",
      "home/system/undo",
      "home/system/redo",
      "home/system/discovery",
    ]);
  }

  private handleMessage(topic: string, message: MqttEnvelope) {
    const parts = topic.split("/");

    if (parts[1] === "devices" && parts[3] === "command") {
      const deviceId = parts[2];
      const { action, properties } = message.payload;
      this.engine.handleCommand(
        deviceId,
        action || "set",
        properties || {},
        message.source,
        true
      );
    }

    if (parts[1] === "rooms" && parts[3] === "command") {
      const roomId = parts[2];
      const { action, properties, device_types } = message.payload;
      this.engine.handleRoomCommand(
        roomId,
        action || "set",
        properties || {},
        message.source,
        device_types
      );
    }

    if (parts[1] === "groups" && parts[3] === "command") {
      const groupId = parts[2];
      const { action, properties, device_types } = message.payload;
      this.engine.handleGroupCommand(
        groupId,
        action || "set",
        properties || {},
        message.source,
        device_types
      );
    }

    if (topic === "home/scenes/activate") {
      const { scene_id } = message.payload;
      this.engine.activateScene(scene_id, message.source);
    }

    if (topic === "home/system/undo") {
      this.engine.handleUndo(message.source);
    }

    if (topic === "home/system/redo") {
      this.engine.handleRedo(message.source);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}
