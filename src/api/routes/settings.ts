import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Engine } from "../../core/engine.js";
import type { SystemSettings } from "../../types.js";
import { applyHostname } from "../../core/hostname.js";
import { requireRole } from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../../../config/system.json");
const DEFAULTS_PATH = path.join(__dirname, "../../../config/system.defaults.json");

const RESETTABLE_SECTIONS = [
  "hub", "network", "protocols", "automations",
  "notifications", "updates", "security", "storage", "backup",
];

export function settingsRoutes(engine: Engine, settings: SystemSettings) {
  const app = new Hono();

  app.get("/", requireRole("admin"), (c) => {
    return c.json(settings);
  });

  app.get("/:section", requireRole("admin"), (c) => {
    const section = c.req.param("section") as keyof SystemSettings;
    if (!(section in settings)) return c.json({ error: "Unknown section" }, 404);
    return c.json(settings[section]);
  });

  app.put("/:section", requireRole("admin"), async (c) => {
    const section = c.req.param("section") as keyof SystemSettings;
    if (!(section in settings)) return c.json({ error: "Unknown section" }, 404);

    const body = await c.req.json();
    const oldHostname = settings.network.hostname;
    (settings as any)[section] = { ...(settings as any)[section], ...body };
    saveSettings(settings);

    if (section === "network" && body.hostname && body.hostname !== oldHostname) {
      await applyHostname(body.hostname);
    }

    return c.json(settings[section]);
  });

  app.post("/:section/reset", requireRole("admin"), (c) => {
    const section = c.req.param("section")!;
    if (!RESETTABLE_SECTIONS.includes(section)) {
      return c.json({ error: "Section not resettable" }, 400);
    }

    const defaults = loadDefaults();
    if (!defaults[section as keyof SystemSettings]) {
      return c.json({ error: "No defaults for section" }, 400);
    }

    (settings as any)[section] = (defaults as any)[section];
    saveSettings(settings);
    return c.json({
      section,
      reset_to_default: true,
      values: (settings as any)[section],
    });
  });

  app.post("/reset", requireRole("admin"), (c) => {
    const defaults = loadDefaults();
    Object.assign(settings, defaults);
    saveSettings(settings);
    return c.json({ reset: true });
  });

  return app;
}

function saveSettings(settings: SystemSettings) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));
}

function loadDefaults(): SystemSettings {
  return JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf-8"));
}
