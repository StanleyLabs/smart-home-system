import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data/hub.db");
const EVENT_DB_PATH = path.join(__dirname, "../../data/events.db");

let db: Database.Database;
let eventDb: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

export function getEventDb(): Database.Database {
  if (!eventDb) {
    eventDb = new Database(EVENT_DB_PATH);
    eventDb.pragma("journal_mode = WAL");
    initEventSchema(eventDb);
  }
  return eventDb;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      device_type TEXT NOT NULL,
      protocol TEXT NOT NULL,
      protocol_id TEXT NOT NULL,
      name TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(room_id) ON DELETE SET NULL,
      manufacturer TEXT DEFAULT '',
      model TEXT DEFAULT '',
      firmware TEXT DEFAULT '',
      commissioned_at TEXT NOT NULL,
      supports TEXT NOT NULL DEFAULT '[]',
      config TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS device_state (
      device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      property TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (device_id, property)
    );

    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      floor TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS groups (
      group_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS device_groups (
      device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
      PRIMARY KEY (device_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS automations (
      rule_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      retrigger TEXT NOT NULL DEFAULT '{"behavior":"restart","cooldown_seconds":0}',
      trigger_def TEXT NOT NULL DEFAULT '{}',
      conditions TEXT NOT NULL DEFAULT '[]',
      actions TEXT NOT NULL DEFAULT '[]',
      condition_logic TEXT NOT NULL DEFAULT 'all'
    );

    CREATE TABLE IF NOT EXISTS scenes (
      scene_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      snapshot TEXT NOT NULL DEFAULT '{}',
      transition_seconds INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT,
      pin_hash TEXT NOT NULL,
      guest_config TEXT,
      notification_preferences TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      interface TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_history (
      history_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      action_type TEXT NOT NULL,
      changes TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS setup_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS setup_queue (
      entry_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(room_id) ON DELETE SET NULL,
      device_type TEXT NOT NULL DEFAULT 'unknown',
      protocol TEXT NOT NULL DEFAULT 'matter',
      setup_payload TEXT NOT NULL,
      manufacturer TEXT DEFAULT '',
      model TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      device_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS color_presets (
      preset_id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      hue INTEGER NOT NULL,
      saturation INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

function initEventSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      audit INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      priority TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      device_id TEXT,
      channels TEXT NOT NULL DEFAULT '[]',
      recipients TEXT NOT NULL DEFAULT '[]',
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);
  `);
}

export function closeDb() {
  if (db) db.close();
  if (eventDb) eventDb.close();
}
