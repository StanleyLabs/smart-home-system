import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database.js";
import type { Engine } from "../../core/engine.js";
import { requireRole } from "../auth.js";

export function groupRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    const db = getDb();
    const groups = db.prepare("SELECT * FROM groups").all();
    return c.json(groups);
  });

  app.get("/:id", (c) => {
    const db = getDb();
    const group = db
      .prepare("SELECT * FROM groups WHERE group_id = ?")
      .get(c.req.param("id"));
    if (!group) return c.json({ error: "Not found" }, 404);

    const devices = engine.devices.getByGroup(c.req.param("id"));
    return c.json({ ...group, devices });
  });

  app.post("/", requireRole("admin", "member"), async (c) => {
    const db = getDb();
    const body = await c.req.json();
    const group_id = `group_${uuid().slice(0, 8)}`;
    db.prepare(
      "INSERT INTO groups (group_id, name, system) VALUES (?, ?, 0)"
    ).run(group_id, body.name);
    return c.json({ group_id, name: body.name, system: false }, 201);
  });

  app.put("/:id", requireRole("admin", "member"), async (c) => {
    const db = getDb();
    const body = await c.req.json();
    const id = c.req.param("id");
    const group = db.prepare("SELECT * FROM groups WHERE group_id = ?").get(id) as any;
    if (group?.system) return c.json({ error: "Cannot edit system groups" }, 400);
    db.prepare("UPDATE groups SET name = ? WHERE group_id = ?").run(body.name, id);
    return c.json({ group_id: id, ...body });
  });

  app.delete("/:id", requireRole("admin"), async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const group = db.prepare("SELECT * FROM groups WHERE group_id = ?").get(id) as any;
    if (group?.system) return c.json({ error: "Cannot delete system groups" }, 400);
    db.prepare("DELETE FROM groups WHERE group_id = ?").run(id);
    return c.json({ success: true });
  });

  app.post("/:id/command", async (c) => {
    const groupId = c.req.param("id");
    const body = await c.req.json();
    const { action = "set", properties = {}, device_types } = body;
    engine.handleGroupCommand(groupId, action, properties, "api", device_types);
    return c.json({ success: true });
  });

  return app;
}
