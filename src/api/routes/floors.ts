import { Hono } from "hono";
import { getDb } from "../../db/database.js";
import type { Engine } from "../../core/engine.js";
import { requireRole } from "../auth.js";

export function floorRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/order", (c) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT floor_name, sort_index FROM floor_order ORDER BY sort_index")
      .all() as { floor_name: string; sort_index: number }[];
    return c.json(rows);
  });

  app.put("/order", requireRole("admin", "member"), async (c) => {
    const db = getDb();
    const body: string[] = await c.req.json();
    const upsert = db.prepare(
      "INSERT INTO floor_order (floor_name, sort_index) VALUES (?, ?) ON CONFLICT(floor_name) DO UPDATE SET sort_index = excluded.sort_index"
    );
    const run = db.transaction(() => {
      for (let i = 0; i < body.length; i++) {
        upsert.run(body[i], i);
      }
    });
    run();
    return c.json({ success: true });
  });

  app.post("/:floor/command", async (c) => {
    const floorName = decodeURIComponent(c.req.param("floor"));
    const body = await c.req.json();
    const { action = "set", properties = {}, device_types } = body;

    const db = getDb();
    const rooms = db
      .prepare("SELECT room_id FROM rooms WHERE floor = ?")
      .all(floorName) as { room_id: string }[];

    for (const { room_id } of rooms) {
      engine.handleRoomCommand(room_id, action, properties, "api", device_types);
    }
    return c.json({ success: true });
  });

  return app;
}
