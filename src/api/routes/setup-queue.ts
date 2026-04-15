import { Hono } from "hono";
import type { Engine } from "../../core/engine.js";
import { requireRole } from "../auth.js";

export function setupQueueRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json(engine.setupQueue.getAll());
  });

  app.post("/", requireRole("admin"), async (c) => {
    const body = await c.req.json();
    const { name, room_id, device_type, protocol, setup_payload, manufacturer, model } = body;

    if (!setup_payload) {
      return c.json({ error: "setup_payload is required" }, 400);
    }

    const duplicate = engine.setupQueue.findBySetupPayloadKey(setup_payload);
    if (duplicate) {
      return c.json(duplicate, 200);
    }

    const entry = engine.setupQueue.add({
      name: name || "New Device",
      room_id,
      device_type,
      protocol,
      setup_payload,
      manufacturer,
      model,
    });

    engine.publishSetupQueueEvent("entry_added", entry);

    if (engine.setupQueue.getWaiting().length > 0) {
      engine.ensureQueueDiscovery();
    }

    return c.json(entry, 201);
  });

  app.put("/:id", requireRole("admin"), async (c) => {
    const entryId = c.req.param("id") as string;
    const body = await c.req.json();
    const { name, room_id, device_type } = body;

    const updated = engine.setupQueue.update(entryId, { name, room_id, device_type });
    if (!updated) {
      return c.json({ error: "Entry not found" }, 404);
    }

    engine.publishSetupQueueEvent("entry_updated", updated);
    return c.json(updated);
  });

  app.delete("/:id", requireRole("admin"), async (c) => {
    const entryId = c.req.param("id") as string;
    const removed = engine.setupQueue.remove(entryId);
    if (!removed) {
      return c.json({ error: "Entry not found" }, 404);
    }

    engine.publishSetupQueueEvent("entry_removed", { entry_id: entryId });
    return c.json({ success: true });
  });

  app.post("/clear-completed", requireRole("admin"), (c) => {
    const count = engine.setupQueue.clearCompleted();
    return c.json({ cleared: count });
  });

  app.post("/:id/cancel", requireRole("admin"), (c) => {
    const entryId = c.req.param("id") as string;
    const updated = engine.cancelSetupQueueConnect(entryId);
    if (!updated) {
      return c.json({ error: "Entry not found or not connecting" }, 404);
    }
    return c.json(updated);
  });

  app.post("/:id/retry", requireRole("admin"), async (c) => {
    const entryId = c.req.param("id") as string;
    const entry = engine.setupQueue.get(entryId);
    if (!entry) {
      return c.json({ error: "Entry not found" }, 404);
    }
    if (entry.status === "online") {
      return c.json({ error: "Device is already online" }, 400);
    }

    engine.resetQueueRetries(entryId);
    engine.setupQueue.updateStatus(entryId, "waiting", { error: undefined });
    const updated = engine.setupQueue.get(entryId)!;
    engine.publishSetupQueueEvent("entry_updated", updated);

    engine.processQueueEntry(entryId);
    return c.json(updated);
  });

  app.post("/process", requireRole("admin"), async (c) => {
    engine.processAllWaiting();
    return c.json({ success: true, message: "Processing started" });
  });

  return app;
}
