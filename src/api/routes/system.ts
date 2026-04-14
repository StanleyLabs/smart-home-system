import { exec } from "child_process";
import { Hono } from "hono";
import type { Engine } from "../../core/engine.js";
import type { SystemSettings } from "../../types.js";
import { requireRole } from "../auth.js";
import {
  scanNetworks,
  connectToWifi,
  startHotspot,
  stopHotspot,
  getStatus as getWifiStatus,
  getHotspotSsid,
} from "../../core/wifi-manager.js";

export function systemRoutes(engine: Engine, settings: SystemSettings) {
  const app = new Hono();
  const startTime = Date.now();

  app.get("/status", (c) => {
    return c.json({
      status: "running",
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      hub_name: settings.hub.name,
      device_count: engine.devices.getAll().length,
      online_count: engine.devices.getAll().filter((d) => d.online).length,
      adapters: engine.getAdapterStatuses(),
    });
  });

  app.post("/undo", (c) => {
    if (!engine.undo.canUndo()) {
      return c.json({ error: "Nothing to undo" }, 400);
    }
    engine.handleUndo("api");
    return c.json({ success: true, can_undo: engine.undo.canUndo(), can_redo: engine.undo.canRedo() });
  });

  app.post("/redo", (c) => {
    if (!engine.undo.canRedo()) {
      return c.json({ error: "Nothing to redo" }, 400);
    }
    engine.handleRedo("api");
    return c.json({ success: true, can_undo: engine.undo.canUndo(), can_redo: engine.undo.canRedo() });
  });

  app.get("/undo-status", (c) => {
    return c.json({
      can_undo: engine.undo.canUndo(),
      can_redo: engine.undo.canRedo(),
    });
  });

  app.post("/discovery/start", requireRole("admin"), async (c) => {
    await engine.startDiscovery();
    return c.json({ success: true, message: "Discovery started" });
  });

  app.post("/discovery/stop", requireRole("admin"), async (c) => {
    await engine.stopDiscovery();
    return c.json({ success: true, message: "Discovery stopped" });
  });

  app.get("/discoveries", requireRole("admin"), (c) => {
    return c.json(engine.getPendingDiscoveries());
  });

  app.post("/commission", requireRole("admin"), async (c) => {
    const body = await c.req.json();
    const { temp_id, protocol, credentials } = body;
    try {
      const device = temp_id
        ? await engine.commission(temp_id, credentials)
        : await engine.commissionManual(protocol ?? "matter", credentials);
      return c.json(device, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.get("/wifi", async (c) => {
    try {
      const ssid = await detectWifiSsid();
      return c.json({ ssid });
    } catch {
      return c.json({ ssid: null });
    }
  });

  app.get("/wifi/status", async (c) => {
    const status = await getWifiStatus();
    return c.json({ ...status, hotspot_ssid: getHotspotSsid() });
  });

  app.get("/wifi/scan", async (c) => {
    const networks = await scanNetworks();
    return c.json(networks);
  });

  app.post("/wifi/connect", async (c) => {
    const { ssid, password } = await c.req.json();
    if (!ssid) return c.json({ error: "ssid is required" }, 400);

    const result = await connectToWifi(ssid, password);
    if (result.success) {
      settings.network.wifi = { ssid, configured: true };
    }
    return c.json(result, result.success ? 200 : 500);
  });

  app.post("/wifi/hotspot", async (c) => {
    const { action } = await c.req.json();
    if (action === "start") {
      const result = await startHotspot();
      return c.json(result, result.success ? 200 : 500);
    }
    if (action === "stop") {
      const result = await stopHotspot();
      return c.json(result, result.success ? 200 : 500);
    }
    return c.json({ error: 'action must be "start" or "stop"' }, 400);
  });

  app.post("/setup-device", requireRole("admin"), async (c) => {
    const body = await c.req.json();
    const { device_id, name, room_id } = body;
    try {
      const device = engine.setupDevice(device_id, name, room_id);
      return c.json(device);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  return app;
}

function detectWifiSsid(): Promise<string> {
  if (process.platform === "darwin") {
    return runCmd("networksetup -getairportnetwork en0").then((output) => {
      const match = output.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match?.[1]) return match[1].trim();
      throw new Error("Not connected to Wi-Fi");
    });
  }

  if (process.platform === "linux") {
    return runCmd("iwgetid -r").catch(() =>
      runCmd("nmcli -t -f active,ssid dev wifi").then((output) => {
        for (const line of output.split("\n")) {
          if (line.startsWith("yes:")) return line.slice(4);
        }
        throw new Error("Not connected to Wi-Fi");
      })
    );
  }

  return Promise.reject(new Error("Unsupported platform"));
}

function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout) => {
      if (err) return reject(err);
      const output = stdout.trim();
      if (!output) return reject(new Error("Empty output"));
      resolve(output);
    });
  });
}
