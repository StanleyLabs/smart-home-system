import { Hono } from "hono";
import type { Engine } from "../../core/engine.js";
import { requireRole } from "../auth.js";

export function automationRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json(engine.automations.getAll());
  });

  app.get("/:id", (c) => {
    const rule = engine.automations.get(c.req.param("id"));
    if (!rule) return c.json({ error: "Not found" }, 404);
    return c.json(rule);
  });

  app.post("/", requireRole("admin", "member"), async (c) => {
    const body = await c.req.json();
    const rule = engine.automations.create(body);
    return c.json(rule, 201);
  });

  app.put("/:id", requireRole("admin", "member"), async (c) => {
    const body = await c.req.json();
    const rule = engine.automations.update(c.req.param("id")!, body);
    if (!rule) return c.json({ error: "Not found" }, 404);
    return c.json(rule);
  });

  app.delete("/:id", requireRole("admin"), async (c) => {
    const removed = engine.automations.remove(c.req.param("id")!);
    if (!removed) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  });

  app.post("/:id/toggle", requireRole("admin", "member"), async (c) => {
    const rule = engine.automations.get(c.req.param("id")!);
    if (!rule) return c.json({ error: "Not found" }, 404);
    const updated = engine.automations.update(c.req.param("id")!, {
      enabled: !rule.enabled,
    });
    return c.json(updated);
  });

  app.post("/:id/run", requireRole("admin", "member"), async (c) => {
    const id = c.req.param("id")!;
    const result = await engine.automations.runManually(id);
    if (result === "not_found") return c.json({ error: "Not found" }, 404);
    if (result === "already_running")
      return c.json({ error: "Automation is already running" }, 409);
    return c.json({ success: true });
  });

  return app;
}
