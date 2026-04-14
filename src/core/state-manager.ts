import { getDb } from "../db/database.js";
import type { DeviceState } from "../types.js";

export class StateManager {
  private state = new Map<string, DeviceState>();
  private dirty = new Set<string>();
  private writeTimer: ReturnType<typeof setInterval> | null = null;

  load() {
    const db = getDb();
    const rows = db
      .prepare("SELECT device_id, property, value FROM device_state")
      .all() as any[];

    for (const row of rows) {
      if (!this.state.has(row.device_id)) {
        this.state.set(row.device_id, {});
      }
      const deviceState = this.state.get(row.device_id)!;
      try {
        deviceState[row.property] = JSON.parse(row.value);
      } catch {
        deviceState[row.property] = row.value;
      }
    }
  }

  startPeriodicWrite(intervalSeconds: number) {
    this.writeTimer = setInterval(() => this.flush(), intervalSeconds * 1000);
  }

  stopPeriodicWrite() {
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
      this.writeTimer = null;
    }
  }

  getState(deviceId: string): DeviceState {
    return this.state.get(deviceId) || {};
  }

  getAllStates(): Map<string, DeviceState> {
    return new Map(this.state);
  }

  updateState(deviceId: string, properties: Record<string, any>): DeviceState {
    if (!this.state.has(deviceId)) {
      this.state.set(deviceId, {});
    }
    const deviceState = this.state.get(deviceId)!;
    Object.assign(deviceState, properties);
    this.dirty.add(deviceId);
    return { ...deviceState };
  }

  removeDevice(deviceId: string) {
    this.state.delete(deviceId);
    this.dirty.delete(deviceId);
    const db = getDb();
    db.prepare("DELETE FROM device_state WHERE device_id = ?").run(deviceId);
  }

  flush() {
    if (this.dirty.size === 0) return;

    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO device_state (device_id, property, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id, property) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      for (const deviceId of this.dirty) {
        const deviceState = this.state.get(deviceId);
        if (!deviceState) continue;
        for (const [property, value] of Object.entries(deviceState)) {
          upsert.run(deviceId, property, JSON.stringify(value), now);
        }
      }
    });

    transaction();
    this.dirty.clear();
  }
}
