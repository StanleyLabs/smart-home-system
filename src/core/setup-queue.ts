import { getDb } from "../db/database.js";
import { v4 as uuid } from "uuid";
import type {
  SetupQueueEntry,
  SetupQueueStatus,
  DeviceType,
  Protocol,
} from "../types.js";
import { setupPayloadIdentityKey } from "./setup-payload-key.js";

export class SetupQueue {
  getAll(): SetupQueueEntry[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM setup_queue ORDER BY created_at ASC")
      .all() as SetupQueueEntry[];
  }

  get(entryId: string): SetupQueueEntry | undefined {
    const db = getDb();
    return db
      .prepare("SELECT * FROM setup_queue WHERE entry_id = ?")
      .get(entryId) as SetupQueueEntry | undefined;
  }

  /** Same physical device / setup string as an existing row (normalized). */
  findBySetupPayloadKey(setupPayload: string): SetupQueueEntry | undefined {
    const key = setupPayloadIdentityKey(setupPayload);
    for (const row of this.getAll()) {
      if (setupPayloadIdentityKey(row.setup_payload) === key) return row;
    }
    return undefined;
  }

  add(data: {
    name: string;
    room_id?: string | null;
    device_type?: DeviceType;
    protocol?: Protocol;
    setup_payload: string;
    manufacturer?: string;
    model?: string;
  }): SetupQueueEntry {
    const db = getDb();
    const entry: SetupQueueEntry = {
      entry_id: `sq_${uuid().slice(0, 8)}`,
      name: data.name,
      room_id: data.room_id ?? null,
      device_type: data.device_type ?? "unknown",
      protocol: data.protocol ?? "matter",
      setup_payload: data.setup_payload,
      manufacturer: data.manufacturer ?? "",
      model: data.model ?? "",
      status: "waiting",
      device_id: null,
      error: null,
      created_at: new Date().toISOString(),
    };

    db.prepare(
      `INSERT INTO setup_queue
       (entry_id, name, room_id, device_type, protocol, setup_payload, manufacturer, model, status, device_id, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.entry_id,
      entry.name,
      entry.room_id,
      entry.device_type,
      entry.protocol,
      entry.setup_payload,
      entry.manufacturer,
      entry.model,
      entry.status,
      entry.device_id,
      entry.error,
      entry.created_at
    );

    return entry;
  }

  update(
    entryId: string,
    updates: Partial<Pick<SetupQueueEntry, "name" | "room_id" | "device_type">>
  ): SetupQueueEntry | undefined {
    const db = getDb();
    const entry = this.get(entryId);
    if (!entry) return undefined;

    if (updates.name !== undefined) {
      db.prepare("UPDATE setup_queue SET name = ? WHERE entry_id = ?").run(
        updates.name,
        entryId
      );
    }
    if (updates.room_id !== undefined) {
      db.prepare("UPDATE setup_queue SET room_id = ? WHERE entry_id = ?").run(
        updates.room_id,
        entryId
      );
    }
    if (updates.device_type !== undefined) {
      db.prepare(
        "UPDATE setup_queue SET device_type = ? WHERE entry_id = ?"
      ).run(updates.device_type, entryId);
    }

    return this.get(entryId);
  }

  updateStatus(
    entryId: string,
    status: SetupQueueStatus,
    extra?: { device_id?: string; error?: string }
  ) {
    const db = getDb();
    db.prepare(
      "UPDATE setup_queue SET status = ?, device_id = COALESCE(?, device_id), error = ? WHERE entry_id = ?"
    ).run(status, extra?.device_id ?? null, extra?.error ?? null, entryId);
  }

  remove(entryId: string): boolean {
    const db = getDb();
    const result = db
      .prepare("DELETE FROM setup_queue WHERE entry_id = ?")
      .run(entryId);
    return result.changes > 0;
  }

  clearCompleted(): number {
    const db = getDb();
    const result = db
      .prepare("DELETE FROM setup_queue WHERE status = 'online'")
      .run();
    return result.changes;
  }

  getWaiting(): SetupQueueEntry[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM setup_queue WHERE status = 'waiting' ORDER BY created_at ASC"
      )
      .all() as SetupQueueEntry[];
  }

  getFailed(): SetupQueueEntry[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM setup_queue WHERE status = 'failed' ORDER BY created_at ASC"
      )
      .all() as SetupQueueEntry[];
  }
}
