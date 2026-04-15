import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "../../db/database.js";
import type { Engine } from "../../core/engine.js";
import type { SystemSettings } from "../../types.js";
import { applyHostname } from "../../core/hostname.js";
import { connectToWifi } from "../../core/wifi-manager.js";
import {
  hashPassword,
  hashPin,
  isSetupComplete,
  markSetupComplete,
  createSession,
} from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../../../config/system.json");

export function setupRoutes(engine: Engine, settings: SystemSettings) {
  const app = new Hono();

  app.get("/status", (c) => {
    const complete = isSetupComplete();
    const db = getDb();
    const stepRow = db
      .prepare("SELECT value FROM setup_state WHERE key = 'current_step'")
      .get() as any;
    return c.json({
      complete,
      current_step: stepRow ? parseInt(stepRow.value) : 1,
    });
  });

  app.post("/step/:number", async (c) => {
    if (isSetupComplete()) {
      return c.json({ error: "Setup already complete" }, 400);
    }

    const stepNum = parseInt(c.req.param("number"));
    const body = await c.req.json();
    const db = getDb();

    switch (stepNum) {
      case 1: {
        if (body.language) {
          settings.hub.language = body.language;
        }
        break;
      }
      case 2: {
        const { username, display_name, password, pin } = body;
        if (!username || !password || !pin) {
          return c.json({ error: "username, password, and pin required" }, 400);
        }
        if (password.length < (settings.security.min_admin_password_length || 12)) {
          return c.json({ error: `Password must be at least ${settings.security.min_admin_password_length} characters` }, 400);
        }
        if (pin.length < (settings.security.min_pin_length || 6)) {
          return c.json({ error: `PIN must be at least ${settings.security.min_pin_length} digits` }, 400);
        }

        const password_hash = await hashPassword(password);
        const pin_hash = await hashPin(pin);
        const user_id = `user_${uuid().slice(0, 8)}`;

        db.prepare(
          `INSERT OR REPLACE INTO users (user_id, username, display_name, role, password_hash, pin_hash, notification_preferences, created_at)
           VALUES (?, ?, ?, 'admin', ?, ?, '{}', ?)`
        ).run(user_id, username, display_name || username, password_hash, pin_hash, new Date().toISOString());
        break;
      }
      case 3: {
        if (body.hub_name) settings.hub.name = body.hub_name;
        if (body.timezone) settings.hub.location.timezone = body.timezone;
        if (body.units) settings.hub.units = body.units;
        break;
      }
      case 4: {
        if (body.hostname) {
          settings.network.hostname = body.hostname;
          await applyHostname(body.hostname);
        }
        break;
      }
      case 5: {
        if (body.ssid) {
          settings.network.wifi = { ssid: body.ssid, configured: true };
        }
        break;
      }
      case 6: {
        if (body.matter !== undefined) settings.protocols.matter = body.matter;
        if (body.zigbee !== undefined) settings.protocols.zigbee = body.zigbee;
        if (body.zwave !== undefined) settings.protocols.zwave = body.zwave;
        break;
      }
      case 7: {
        if (body.rooms && Array.isArray(body.rooms)) {
          for (const room of body.rooms) {
            const room_id = `room_${uuid().slice(0, 8)}`;
            db.prepare(
              "INSERT INTO rooms (room_id, name, floor) VALUES (?, ?, ?)"
            ).run(room_id, room.name, room.floor || "");
          }
        }
        break;
      }
    }

    db.prepare(
      "INSERT OR REPLACE INTO setup_state (key, value) VALUES ('current_step', ?)"
    ).run(String(stepNum + 1));

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));

    return c.json({ step: stepNum, success: true, next_step: stepNum + 1 });
  });

  app.post("/captive", async (c) => {
    if (isSetupComplete()) {
      return c.json({ error: "Setup already complete" }, 400);
    }

    const { ssid, password, hostname } = await c.req.json();
    const resolvedHostname = (hostname || "smarthome").replace(/\.local$/, "");

    settings.network.hostname = `${resolvedHostname}.local`;
    if (ssid) {
      settings.network.wifi = { ssid, configured: true };
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));

    // Respond immediately so the phone receives the response before we
    // tear down the hotspot.  The delayed task connects to WiFi (which
    // stops the hotspot) and applies the hostname.
    setTimeout(async () => {
      try {
        if (ssid) {
          console.log(`[setup] Connecting to WiFi "${ssid}"...`);
          await connectToWifi(ssid, password || undefined);
        }
        console.log(`[setup] Applying hostname "${resolvedHostname}.local"...`);
        await applyHostname(`${resolvedHostname}.local`);
        console.log("[setup] Network handoff complete — waiting for Phase 2 setup");
      } catch (err: any) {
        console.error("[setup] Network handoff failed:", err.message);
      }
    }, 3000);

    return c.json({
      success: true,
      hostname: `${resolvedHostname}.local`,
      message: `Hub will connect to "${ssid}" and be available at http://${resolvedHostname}.local`,
    });
  });

  app.post("/complete", async (c) => {
    if (isSetupComplete()) {
      return c.json({ error: "Setup already complete" }, 400);
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));
    markSetupComplete();
    engine.devices.rebuildSystemGroups();

    const db = getDb();
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get() as any;
    if (admin) {
      const session = createSession(admin.user_id, "dashboard");
      return c.json({
        complete: true,
        token: session.token,
        user: {
          user_id: admin.user_id,
          username: admin.username,
          display_name: admin.display_name,
          role: admin.role,
        },
      });
    }

    return c.json({ complete: true });
  });

  return app;
}
