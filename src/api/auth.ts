import { getDb } from "../db/database.js";
import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import type { Context, Next } from "hono";
import type { User, UserPreferences, Session, SystemSettings } from "../types.js";

const SALT_ROUNDS = 10;

let securitySettings: {
  session_expiry_hours: number;
  pin_lockout_attempts: number;
  pin_lockout_minutes: number;
  min_admin_password_length: number;
  min_pin_length: number;
};

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function configureAuth(settings: SystemSettings["security"]) {
  securitySettings = settings;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export function createSession(userId: string, iface: string): Session {
  const db = getDb();
  const token = uuid();
  const now = new Date();
  const expires = new Date(
    now.getTime() + (securitySettings?.session_expiry_hours || 24) * 60 * 60 * 1000
  );

  const session: Session = {
    token,
    user_id: userId,
    interface: iface,
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };

  db.prepare(
    `INSERT INTO sessions (token, user_id, interface, issued_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(token, userId, iface, session.issued_at, session.expires_at);

  return session;
}

export function validateSession(token: string): Session | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM sessions WHERE token = ?")
    .get(token) as any;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return row as Session;
}

export function revokeSession(token: string) {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function parseUserPreferences(json: string): UserPreferences {
  let raw: unknown;
  try {
    raw = JSON.parse(json || "{}");
  } catch {
    raw = {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { notifications: {}, dashboard: {} };
  }
  const o = raw as Record<string, unknown>;
  const notifications =
    o.notifications && typeof o.notifications === "object" && !Array.isArray(o.notifications)
      ? (o.notifications as Record<string, unknown>)
      : {};
  const dashboard =
    o.dashboard && typeof o.dashboard === "object" && !Array.isArray(o.dashboard)
      ? (o.dashboard as Record<string, unknown>)
      : {};
  return { notifications, dashboard };
}

export function getUser(userId: string): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE user_id = ?").get(userId) as any;
  if (!row) return null;
  return {
    ...row,
    guest_config: row.guest_config ? JSON.parse(row.guest_config) : null,
    user_preferences: parseUserPreferences(row.user_preferences || "{}"),
  };
}

export function getUserByUsername(username: string): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!row) return null;
  return {
    ...row,
    guest_config: row.guest_config ? JSON.parse(row.guest_config) : null,
    user_preferences: parseUserPreferences(row.user_preferences || "{}"),
  };
}

export function checkPinLockout(username: string): boolean {
  const record = failedAttempts.get(username);
  if (!record) return false;
  if (record.lockedUntil > Date.now()) return true;
  failedAttempts.delete(username);
  return false;
}

export function recordFailedAttempt(username: string) {
  const record = failedAttempts.get(username) || { count: 0, lockedUntil: 0 };
  record.count++;
  if (record.count >= (securitySettings?.pin_lockout_attempts || 5)) {
    record.lockedUntil =
      Date.now() + (securitySettings?.pin_lockout_minutes || 15) * 60 * 1000;
    record.count = 0;
  }
  failedAttempts.set(username, record);
}

export function isSetupComplete(): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM setup_state WHERE key = 'complete'")
    .get() as any;
  return row?.value === "true";
}

export function markSetupComplete() {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO setup_state (key, value) VALUES ('complete', 'true')"
  ).run();
}

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const path = c.req.path;

    if (
      (path.startsWith("/api/setup") && !path.startsWith("/api/setup-queue")) ||
      path.startsWith("/api/auth") ||
      path === "/api/system/status" ||
      path === "/api/system/ca-cert" ||
      path.startsWith("/api/system/wifi") ||
      !path.startsWith("/api/")
    ) {
      return next();
    }

    if (!isSetupComplete()) {
      return c.json({ error: "Setup not complete" }, 403);
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);
    const session = validateSession(token);
    if (!session) {
      return c.json({ error: "Invalid or expired session" }, 401);
    }

    const user = getUser(session.user_id);
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    c.set("user", user);
    c.set("session", session);
    return next();
  };
}

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = (c as any).get("user") as User;
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  };
}
