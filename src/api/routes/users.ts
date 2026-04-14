import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database.js";
import type { Engine } from "../../core/engine.js";
import type { User, Session } from "../../types.js";
import {
  hashPassword,
  hashPin,
  verifyPassword,
  verifyPin,
  createSession,
  revokeSession,
  getUserByUsername,
  requireRole,
  checkPinLockout,
  recordFailedAttempt,
} from "../auth.js";

export function userRoutes(engine: Engine) {
  const app = new Hono();

  app.post("/login", async (c) => {
    const body = await c.req.json();
    const { username, password, pin } = body;

    if (checkPinLockout(username)) {
      return c.json({ error: "Account locked. Try again later." }, 429);
    }

    const user = getUserByUsername(username);
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    if (user.role === "admin") {
      if (!password || !user.password_hash) {
        return c.json({ error: "Password required for admin" }, 401);
      }
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        recordFailedAttempt(username);
        return c.json({ error: "Invalid credentials" }, 401);
      }
    } else {
      if (!pin) {
        return c.json({ error: "PIN required" }, 401);
      }
      const valid = await verifyPin(pin, user.pin_hash);
      if (!valid) {
        recordFailedAttempt(username);
        return c.json({ error: "Invalid credentials" }, 401);
      }
    }

    const session = createSession(user.user_id, body.interface || "dashboard");
    return c.json({
      token: session.token,
      user: {
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
      },
      expires_at: session.expires_at,
    });
  });

  app.post("/logout", (c) => {
    const session = (c as any).get("session") as Session | undefined;
    if (session) revokeSession(session.token);
    return c.json({ success: true });
  });

  app.get("/me", (c) => {
    const user = (c as any).get("user") as User;
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    return c.json({
      user_id: user.user_id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      notification_preferences: user.notification_preferences,
      guest_config: user.guest_config,
    });
  });

  app.get("/", requireRole("admin"), (c) => {
    const db = getDb();
    const users = db.prepare("SELECT * FROM users").all() as any[];
    return c.json(
      users.map((u) => ({
        user_id: u.user_id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        created_at: u.created_at,
        guest_config: u.guest_config ? JSON.parse(u.guest_config) : null,
      }))
    );
  });

  app.post("/", requireRole("admin"), async (c) => {
    const db = getDb();
    const body = await c.req.json();
    const user_id = `user_${uuid().slice(0, 8)}`;
    const pin_hash = await hashPin(body.pin);
    const password_hash = body.password ? await hashPassword(body.password) : null;

    db.prepare(
      `INSERT INTO users (user_id, username, display_name, role, password_hash, pin_hash, guest_config, notification_preferences, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user_id,
      body.username,
      body.display_name || body.username,
      body.role || "member",
      password_hash,
      pin_hash,
      body.guest_config ? JSON.stringify(body.guest_config) : null,
      JSON.stringify(body.notification_preferences || {}),
      new Date().toISOString()
    );

    return c.json({ user_id, username: body.username, role: body.role || "member" }, 201);
  });

  app.put("/:id", requireRole("admin"), async (c) => {
    const db = getDb();
    const userId = c.req.param("id");
    const body = await c.req.json();

    if (body.display_name) {
      db.prepare("UPDATE users SET display_name = ? WHERE user_id = ?").run(
        body.display_name,
        userId
      );
    }
    if (body.role) {
      db.prepare("UPDATE users SET role = ? WHERE user_id = ?").run(body.role, userId);
    }
    if (body.notification_preferences) {
      db.prepare("UPDATE users SET notification_preferences = ? WHERE user_id = ?").run(
        JSON.stringify(body.notification_preferences),
        userId
      );
    }
    if (body.guest_config !== undefined) {
      db.prepare("UPDATE users SET guest_config = ? WHERE user_id = ?").run(
        body.guest_config ? JSON.stringify(body.guest_config) : null,
        userId
      );
    }

    return c.json({ success: true });
  });

  app.delete("/:id", requireRole("admin"), (c) => {
    const db = getDb();
    db.prepare("DELETE FROM users WHERE user_id = ?").run(c.req.param("id"));
    return c.json({ success: true });
  });

  app.get("/sessions", requireRole("admin"), (c) => {
    const db = getDb();
    const sessions = db.prepare("SELECT * FROM sessions").all();
    return c.json(sessions);
  });

  app.delete("/sessions/:token", requireRole("admin"), (c) => {
    revokeSession(c.req.param("token")!);
    return c.json({ success: true });
  });

  return app;
}
