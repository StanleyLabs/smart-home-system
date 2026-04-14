import { getDb } from "../db/database.js";
import { v4 as uuid } from "uuid";
import type { Device, DeviceType, Protocol } from "../types.js";
import { SYSTEM_GROUPS } from "../types.js";

export class DeviceRegistry {
  private devices = new Map<string, Device>();

  load() {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM devices").all() as any[];
    for (const row of rows) {
      const device: Device = {
        ...row,
        online: false,
        last_seen: row.commissioned_at,
        supports: JSON.parse(row.supports || "[]"),
        config: JSON.parse(row.config || "{}"),
        groups: [],
      };
      const groupRows = db
        .prepare("SELECT group_id FROM device_groups WHERE device_id = ?")
        .all(row.device_id) as any[];
      device.groups = groupRows.map((g) => g.group_id);
      this.devices.set(device.device_id, device);
    }
  }

  getAll(): Device[] {
    return Array.from(this.devices.values());
  }

  get(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  getByRoom(roomId: string): Device[] {
    return this.getAll().filter((d) => d.room_id === roomId);
  }

  getByGroup(groupId: string): Device[] {
    return this.getAll().filter((d) => d.groups.includes(groupId));
  }

  getByProtocol(protocol: Protocol): Device[] {
    return this.getAll().filter((d) => d.protocol === protocol);
  }

  getByProtocolId(protocol: Protocol, protocolId: string): Device | undefined {
    return this.getAll().find(
      (d) => d.protocol === protocol && d.protocol_id === protocolId
    );
  }

  register(data: {
    device_type: DeviceType;
    protocol: Protocol;
    protocol_id: string;
    name: string;
    room_id?: string;
    manufacturer: string;
    model: string;
    supports: string[];
  }): Device {
    const db = getDb();
    const device_id = `${data.device_type}_${uuid().slice(0, 8)}`;
    const now = new Date().toISOString();

    const device: Device = {
      device_id,
      device_type: data.device_type,
      protocol: data.protocol,
      protocol_id: data.protocol_id,
      name: data.name,
      room_id: data.room_id || null,
      groups: [],
      manufacturer: data.manufacturer,
      model: data.model,
      firmware: "",
      online: true,
      last_seen: now,
      commissioned_at: now,
      supports: data.supports,
      config: {},
    };

    db.prepare(
      `INSERT INTO devices (device_id, device_type, protocol, protocol_id, name, room_id, manufacturer, model, firmware, commissioned_at, supports, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      device.device_id,
      device.device_type,
      device.protocol,
      device.protocol_id,
      device.name,
      device.room_id,
      device.manufacturer,
      device.model,
      device.firmware,
      device.commissioned_at,
      JSON.stringify(device.supports),
      JSON.stringify(device.config)
    );

    this.devices.set(device_id, device);
    this.rebuildSystemGroups();
    return device;
  }

  update(deviceId: string, updates: Partial<Pick<Device, "name" | "room_id" | "config">>) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    const db = getDb();
    if (updates.name !== undefined) {
      device.name = updates.name;
      db.prepare("UPDATE devices SET name = ? WHERE device_id = ?").run(updates.name, deviceId);
    }
    if (updates.room_id !== undefined) {
      device.room_id = updates.room_id;
      db.prepare("UPDATE devices SET room_id = ? WHERE device_id = ?").run(updates.room_id, deviceId);
    }
    if (updates.config !== undefined) {
      device.config = updates.config;
      db.prepare("UPDATE devices SET config = ? WHERE device_id = ?").run(
        JSON.stringify(updates.config),
        deviceId
      );
    }
  }

  remove(deviceId: string): Device | undefined {
    const device = this.devices.get(deviceId);
    if (!device) return;

    const db = getDb();
    db.prepare("DELETE FROM devices WHERE device_id = ?").run(deviceId);
    this.devices.delete(deviceId);
    this.rebuildSystemGroups();
    return device;
  }

  setAvailability(deviceId: string, online: boolean) {
    const device = this.devices.get(deviceId);
    if (!device) return;
    device.online = online;
    device.last_seen = new Date().toISOString();
  }

  addToGroup(deviceId: string, groupId: string) {
    const device = this.devices.get(deviceId);
    if (!device || device.groups.includes(groupId)) return;

    const db = getDb();
    db.prepare(
      "INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)"
    ).run(deviceId, groupId);
    device.groups.push(groupId);
  }

  removeFromGroup(deviceId: string, groupId: string) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    const db = getDb();
    db.prepare(
      "DELETE FROM device_groups WHERE device_id = ? AND group_id = ?"
    ).run(deviceId, groupId);
    device.groups = device.groups.filter((g) => g !== groupId);
  }

  rebuildSystemGroups() {
    const db = getDb();

    for (const [groupId, config] of Object.entries(SYSTEM_GROUPS)) {
      db.prepare(
        "INSERT OR IGNORE INTO groups (group_id, name, system) VALUES (?, ?, 1)"
      ).run(groupId, config.name);

      db.prepare(
        "DELETE FROM device_groups WHERE group_id = ?"
      ).run(groupId);

      const devices = config.device_types
        ? this.getAll().filter((d) => config.device_types!.includes(d.device_type))
        : this.getAll();

      const insert = db.prepare(
        "INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)"
      );
      for (const device of devices) {
        insert.run(device.device_id, groupId);
        if (!device.groups.includes(groupId)) {
          device.groups.push(groupId);
        }
      }
    }
  }
}
