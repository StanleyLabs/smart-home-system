import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Engine } from "../../core/engine.js";
import type { SystemSettings } from "../../types.js";
import { applyHostname } from "../../core/hostname.js";
import { regenerateHubTlsCertificate } from "../../core/hub-tls-cert.js";
import { syncHttpsLanPortForwarding } from "../../core/wifi-manager.js";
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
    const oldProtocol = settings.network.protocol;
    let hubRestartRecommended = false;

    if (section === "network") {
      const merged = { ...settings.network, ...body } as SystemSettings["network"];
      if (merged.protocol === "http") {
        merged.api_port = 80;
        delete merged.tls;
        delete merged.https_listen_port;
        delete merged.public_url_port;
      } else if (merged.protocol === "https") {
        merged.api_port = 3000;
        if (!merged.tls) {
          merged.tls = { cert_path: "certs/hub.pem", key_path: "certs/hub.key", ca_path: "certs/ca.pem" };
        }
        if (merged.https_listen_port == null) merged.https_listen_port = 3001;
        if (merged.public_url_port == null) merged.public_url_port = 443;
      }
      settings.network = merged;
      saveSettings(settings);

      const hostChanged = body.hostname != null && body.hostname !== oldHostname;
      const protoChanged = body.protocol != null && body.protocol !== oldProtocol;

      if (body.hostname && body.hostname !== oldHostname) {
        await applyHostname(body.hostname);
      }

      if (settings.network.protocol === "https" && settings.network.tls) {
        const needCert =
          hostChanged ||
          protoChanged ||
          (oldProtocol !== "https" && settings.network.protocol === "https");
        if (needCert) {
          hubRestartRecommended = true;
          try {
            const r = await regenerateHubTlsCertificate(settings.network);
            if (r.ok) console.log(`[settings] ${r.message}`);
            else console.warn(`[settings] ${r.message}`);
          } catch (err: any) {
            console.error("[settings] TLS certificate generation failed:", err?.message || err);
          }
          await syncHttpsLanPortForwarding(settings.network);
        }
      }

      return c.json({
        ...settings.network,
        __hub_restart_recommended: hubRestartRecommended,
      });
    }

    (settings as any)[section] = { ...(settings as any)[section], ...body };
    saveSettings(settings);

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
