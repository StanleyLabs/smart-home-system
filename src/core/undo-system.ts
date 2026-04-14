import { getDb } from "../db/database.js";
import { v4 as uuid } from "uuid";
import type { HistoryEntry, DeviceState } from "../types.js";

export class UndoSystem {
  private history: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  load() {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM command_history ORDER BY timestamp ASC")
      .all() as any[];
    this.history = rows.map((row) => ({
      history_id: row.history_id,
      timestamp: row.timestamp,
      source: row.source,
      action_type: row.action_type,
      changes: JSON.parse(row.changes || "[]"),
    }));
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
    }
  }

  push(entry: Omit<HistoryEntry, "history_id" | "timestamp">) {
    const db = getDb();
    const historyEntry: HistoryEntry = {
      history_id: uuid(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.history.push(historyEntry);
    this.redoStack = [];

    if (this.history.length > this.maxSize) {
      const removed = this.history.shift()!;
      db.prepare("DELETE FROM command_history WHERE history_id = ?").run(
        removed.history_id
      );
    }

    db.prepare(
      `INSERT INTO command_history (history_id, timestamp, source, action_type, changes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      historyEntry.history_id,
      historyEntry.timestamp,
      historyEntry.source,
      historyEntry.action_type,
      JSON.stringify(historyEntry.changes)
    );
  }

  undo(): HistoryEntry | null {
    const entry = this.history.pop();
    if (!entry) return null;

    this.redoStack.push(entry);

    const db = getDb();
    db.prepare("DELETE FROM command_history WHERE history_id = ?").run(
      entry.history_id
    );

    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.history.push(entry);

    const db = getDb();
    db.prepare(
      `INSERT INTO command_history (history_id, timestamp, source, action_type, changes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      entry.history_id,
      entry.timestamp,
      entry.source,
      entry.action_type,
      JSON.stringify(entry.changes)
    );

    return entry;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  snapshotState(
    deviceIds: string[],
    getState: (deviceId: string) => DeviceState
  ): Record<string, DeviceState> {
    const snapshot: Record<string, DeviceState> = {};
    for (const id of deviceIds) {
      snapshot[id] = { ...getState(id) };
    }
    return snapshot;
  }
}
