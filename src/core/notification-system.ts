import { getEventDb } from "../db/database.js";
import { v4 as uuid } from "uuid";
import type { Notification, User } from "../types.js";

export type NotificationDispatcher = (notification: Notification) => void;

export class NotificationSystem {
  private buffer: Notification[] = [];
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;
  private groupingEnabled = true;
  private groupingWindowMs = 5000;
  private maxGroupSize = 20;

  dispatch: NotificationDispatcher = () => {};

  configure(settings: { enabled: boolean; window_seconds: number; max_group_size: number }) {
    this.groupingEnabled = settings.enabled;
    this.groupingWindowMs = settings.window_seconds * 1000;
    this.maxGroupSize = settings.max_group_size;
  }

  send(data: {
    priority: Notification["priority"];
    title: string;
    message: string;
    source: Notification["source"];
    device_id?: string;
    channels?: string[];
    recipients?: string[];
  }) {
    const notification: Notification = {
      notification_id: uuid(),
      timestamp: new Date().toISOString(),
      priority: data.priority,
      title: data.title,
      message: data.message,
      source: data.source,
      device_id: data.device_id,
      channels: data.channels || ["dashboard"],
      recipients: data.recipients || [],
      acknowledged: false,
    };

    if (data.priority === "critical" || !this.groupingEnabled) {
      this.store(notification);
      this.dispatch(notification);
      return;
    }

    this.buffer.push(notification);
    if (!this.bufferTimer) {
      this.bufferTimer = setTimeout(() => this.flushBuffer(), this.groupingWindowMs);
    }
  }

  acknowledge(notificationId: string) {
    const db = getEventDb();
    db.prepare(
      "UPDATE notifications SET acknowledged = 1 WHERE notification_id = ?"
    ).run(notificationId);
  }

  acknowledgeAll(userId: string) {
    const db = getEventDb();
    db.prepare(
      `UPDATE notifications SET acknowledged = 1
       WHERE acknowledged = 0 AND recipients LIKE ?`
    ).run(`%${userId}%`);
  }

  getRecent(limit = 50): Notification[] {
    const db = getEventDb();
    const rows = db
      .prepare(
        "SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?"
      )
      .all(limit) as any[];
    return rows.map(this.rowToNotification);
  }

  getUnacknowledged(): Notification[] {
    const db = getEventDb();
    const rows = db
      .prepare(
        "SELECT * FROM notifications WHERE acknowledged = 0 ORDER BY timestamp DESC"
      )
      .all() as any[];
    return rows.map(this.rowToNotification);
  }

  private flushBuffer() {
    this.bufferTimer = null;
    if (this.buffer.length === 0) return;

    const grouped = new Map<string, Notification[]>();
    for (const n of this.buffer) {
      const key = `${n.source.type}:${n.title}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(n);
    }

    for (const [, notifications] of grouped) {
      if (notifications.length === 1) {
        this.store(notifications[0]);
        this.dispatch(notifications[0]);
      } else {
        const merged: Notification = {
          ...notifications[0],
          notification_id: uuid(),
          message: notifications.map((n) => n.message).join(", "),
          grouped: true,
          group_count: Math.min(notifications.length, this.maxGroupSize),
        };
        this.store(merged);
        this.dispatch(merged);
      }
    }

    this.buffer = [];
  }

  private store(notification: Notification) {
    const db = getEventDb();
    db.prepare(
      `INSERT INTO notifications (notification_id, timestamp, priority, title, message, source_type, source_id, device_id, channels, recipients, acknowledged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      notification.notification_id,
      notification.timestamp,
      notification.priority,
      notification.title,
      notification.message,
      notification.source.type,
      notification.source.id,
      notification.device_id || null,
      JSON.stringify(notification.channels),
      JSON.stringify(notification.recipients),
      0
    );
  }

  private rowToNotification(row: any): Notification {
    return {
      notification_id: row.notification_id,
      timestamp: row.timestamp,
      priority: row.priority,
      title: row.title,
      message: row.message,
      source: { type: row.source_type, id: row.source_id },
      device_id: row.device_id,
      channels: JSON.parse(row.channels || "[]"),
      recipients: JSON.parse(row.recipients || "[]"),
      acknowledged: !!row.acknowledged,
    };
  }

  shutdown() {
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.flushBuffer();
    }
  }
}
