import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database.js";
import type { Engine } from "../../core/engine.js";
import { requireRole } from "../auth.js";

export function roomRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    const db = getDb();
    const rooms = db.prepare("SELECT * FROM rooms").all();
    return c.json(rooms);
  });

  app.get("/:id", (c) => {
    const db = getDb();
    const room = db
      .prepare("SELECT * FROM rooms WHERE room_id = ?")
      .get(c.req.param("id"));
    if (!room) return c.json({ error: "Not found" }, 404);

    const devices = engine.devices.getByRoom(c.req.param("id"));
    return c.json({ ...room, devices });
  });

  app.post("/", requireRole("admin", "member"), async (c) => {
    const db = getDb();
    const body = await c.req.json();
    const room_id = `room_${uuid().slice(0, 8)}`;
    db.prepare(
      "INSERT INTO rooms (room_id, name, floor) VALUES (?, ?, ?)"
    ).run(room_id, body.name, body.floor || "");
    return c.json({ room_id, name: body.name, floor: body.floor || "" }, 201);
  });

  app.put("/:id", requireRole("admin", "member"), async (c) => {
    const db = getDb();
    const body = await c.req.json();
    const id = c.req.param("id");
    db.prepare("UPDATE rooms SET name = ?, floor = ? WHERE room_id = ?").run(
      body.name,
      body.floor || "",
      id
    );
    return c.json({ room_id: id, ...body });
  });

  app.delete("/:id", requireRole("admin"), async (c) => {
    const db = getDb();
    db.prepare("DELETE FROM rooms WHERE room_id = ?").run(c.req.param("id"));
    return c.json({ success: true });
  });

  app.post("/:id/command", async (c) => {
    const roomId = c.req.param("id");
    const body = await c.req.json();
    const { action = "set", properties = {}, device_types } = body;
    engine.handleRoomCommand(roomId, action, properties, "api", device_types);
    return c.json({ success: true });
  });

  return app;
}
