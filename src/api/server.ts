import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Engine } from "../core/engine.js";
import { getBaseUrl, type SystemSettings } from "../types.js";
import { authMiddleware, configureAuth } from "./auth.js";
import { isHotspotMode, getHotspotIp } from "../core/wifi-manager.js";
import { deviceRoutes } from "./routes/devices.js";
import { roomRoutes } from "./routes/rooms.js";
import { groupRoutes } from "./routes/groups.js";
import { automationRoutes } from "./routes/automations.js";
import { sceneRoutes } from "./routes/scenes.js";
import { userRoutes } from "./routes/users.js";
import { settingsRoutes } from "./routes/settings.js";
import { setupRoutes } from "./routes/setup.js";
import { notificationRoutes } from "./routes/notifications.js";
import { systemRoutes } from "./routes/system.js";
import { setupQueueRoutes } from "./routes/setup-queue.js";
import { colorPresetRoutes } from "./routes/color-presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = path.resolve(__dirname, "../../dashboard/dist");

export function createServer(engine: Engine, settings: SystemSettings) {
  const app = new Hono();

  configureAuth(settings.security);

  const CAPTIVE_PORTAL_PATHS = new Set([
    "/generate_204",
    "/gen_204",
    "/hotspot-detect.html",
    "/library/test/success.html",
    "/connecttest.txt",
    "/ncsi.txt",
    "/canonical.html",
    "/success.txt",
  ]);

  app.use("*", async (c, next) => {
    if (!isHotspotMode()) return next();

    const portalUrl = `http://${getHotspotIp()}/`;

    if (CAPTIVE_PORTAL_PATHS.has(c.req.path)) {
      return c.redirect(portalUrl, 302);
    }

    const host = c.req.header("host") || "";
    const isLocal =
      host.startsWith("localhost") ||
      host.startsWith("127.") ||
      host.startsWith("10.42.0.") ||
      host.startsWith("192.168.");
    if (!isLocal && host && !host.includes(".local")) {
      return c.redirect(portalUrl, 302);
    }

    return next();
  });

  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));

  app.use("*", authMiddleware());

  app.route("/api/devices", deviceRoutes(engine));
  app.route("/api/rooms", roomRoutes(engine));
  app.route("/api/groups", groupRoutes(engine));
  app.route("/api/automations", automationRoutes(engine));
  app.route("/api/scenes", sceneRoutes(engine));
  app.route("/api/users", userRoutes(engine));
  app.route("/api/auth", userRoutes(engine));
  app.route("/api/settings", settingsRoutes(engine, settings));
  app.route("/api/setup", setupRoutes(engine, settings));
  app.route("/api/notifications", notificationRoutes(engine));
  app.route("/api/system", systemRoutes(engine, settings));
  app.route("/api/setup-queue", setupQueueRoutes(engine));
  app.route("/api/color-presets", colorPresetRoutes(engine));

  app.get("/assets/*", async (c) => {
    const filePath = path.join(DASHBOARD_DIR, c.req.path);
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const types: Record<string, string> = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };
      return new Response(content, {
        headers: { "Content-Type": types[ext] || "application/octet-stream" },
      });
    } catch {
      return c.notFound();
    }
  });

  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    try {
      const html = fs.readFileSync(path.join(DASHBOARD_DIR, "index.html"), "utf-8");
      return c.html(html);
    } catch {
      return c.text("Dashboard not built. Run: cd dashboard && npm run build", 500);
    }
  });

  return app;
}

export function startServer(
  engine: Engine,
  settings: SystemSettings
): ReturnType<typeof serve> {
  const app = createServer(engine, settings);
  const port = settings.network.api_port;

  const server = serve({
    fetch: app.fetch,
    port,
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const hint = process.platform === "linux"
        ? `\`fuser -k ${port}/tcp\` or \`ss -tlnp sport = :${port}\``
        : `\`lsof -ti :${port} | xargs kill -9\``;
      console.error(
        `Port ${port} is already in use. Stop the other process (e.g. ${hint}) or set a different network.api_port in config/system.json.`
      );
      process.exit(1);
    }
    throw err;
  });

  console.log(`API server listening on ${getBaseUrl(settings.network)}`);
  return server;
}
