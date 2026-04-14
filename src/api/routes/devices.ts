import { Hono } from "hono";
import type { Engine } from "../../core/engine.js";
import { requireRole } from "../auth.js";

export function deviceRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    const devices = engine.devices.getAll();
    const result = devices.map((d) => ({
      ...d,
      state: engine.state.getState(d.device_id),
    }));
    return c.json(result);
  });

  app.get("/:id", (c) => {
    const device = engine.devices.get(c.req.param("id"));
    if (!device) return c.json({ error: "Not found" }, 404);
    return c.json({
      ...device,
      state: engine.state.getState(device.device_id),
    });
  });

  app.post("/:id/command", async (c) => {
    const deviceId = c.req.param("id");
    const body = await c.req.json();
    const { action = "set", properties = {} } = body;
    try {
      await engine.handleCommand(deviceId, action, properties, "api", true);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.put("/:id", async (c) => {
    const deviceId = c.req.param("id");
    const body = await c.req.json();
    engine.devices.update(deviceId, body);
    const device = engine.devices.get(deviceId);
    return c.json(device);
  });

  app.delete("/:id", requireRole("admin"), async (c) => {
    const deviceId = c.req.param("id")!;
    await engine.removeDevice(deviceId);
    return c.json({ success: true });
  });

  app.post("/:id/groups", async (c) => {
    const deviceId = c.req.param("id");
    const { group_id } = await c.req.json();
    engine.devices.addToGroup(deviceId, group_id);
    return c.json({ success: true });
  });

  app.delete("/:id/groups/:groupId", async (c) => {
    const deviceId = c.req.param("id");
    const groupId = c.req.param("groupId");
    engine.devices.removeFromGroup(deviceId, groupId);
    return c.json({ success: true });
  });

  return app;
}
