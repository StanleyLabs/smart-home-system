import { Hono } from "hono";
import type { Engine } from "../../core/engine.js";

export function sceneRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    const scenes = engine.scenes.getAll();
    return c.json({
      scenes,
      active_scene_id: engine.scenes.getActiveSceneId(),
    });
  });

  app.get("/:id", (c) => {
    const scene = engine.scenes.get(c.req.param("id"));
    if (!scene) return c.json({ error: "Not found" }, 404);
    return c.json(scene);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const scene = engine.scenes.create(body);
    return c.json(scene, 201);
  });

  app.put("/:id", async (c) => {
    const body = await c.req.json();
    const scene = engine.scenes.update(c.req.param("id"), body);
    if (!scene) return c.json({ error: "Not found" }, 404);
    return c.json(scene);
  });

  app.delete("/:id", async (c) => {
    const removed = engine.scenes.remove(c.req.param("id"));
    if (!removed) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  });

  app.post("/:id/activate", async (c) => {
    engine.activateScene(c.req.param("id"), "api");
    return c.json({ success: true });
  });

  app.post("/capture", async (c) => {
    const body = await c.req.json();
    const { name, icon, scope, transition_seconds } = body;

    let deviceIds: string[];
    if (scope?.room_id) {
      deviceIds = engine.devices.getByRoom(scope.room_id).map((d) => d.device_id);
    } else if (scope?.group_id) {
      deviceIds = engine.devices.getByGroup(scope.group_id).map((d) => d.device_id);
    } else if (scope?.device_ids) {
      deviceIds = scope.device_ids;
    } else {
      deviceIds = engine.devices.getAll().map((d) => d.device_id);
    }

    const snapshot: Record<string, any> = {};
    for (const id of deviceIds) {
      snapshot[id] = { ...engine.state.getState(id) };
    }

    const scene = engine.scenes.create({
      name,
      icon,
      snapshot,
      transition_seconds: transition_seconds || 0,
    });
    return c.json(scene, 201);
  });

  return app;
}
