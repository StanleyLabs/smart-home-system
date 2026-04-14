import { Hono } from "hono";
import crypto from "crypto";
import { getDb } from "../../db/database.js";
import type { Engine } from "../../core/engine.js";

export function colorPresetRoutes(_engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT preset_id, name, hue, saturation, sort_order, created_at FROM color_presets ORDER BY sort_order ASC, created_at ASC"
      )
      .all();
    return c.json(rows);
  });

  app.post("/", async (c) => {
    const body = await c.req.json<{
      name?: string;
      hue: number;
      saturation: number;
    }>();

    const hue = Math.round(Math.max(0, Math.min(360, body.hue ?? 0)));
    const saturation = Math.round(
      Math.max(0, Math.min(100, body.saturation ?? 100))
    );
    const name = (body.name ?? "").trim();
    const presetId = crypto.randomUUID();
    const now = new Date().toISOString();

    const db = getDb();
    const maxOrder = (
      db
        .prepare("SELECT MAX(sort_order) as m FROM color_presets")
        .get() as { m: number | null }
    )?.m ?? -1;

    db.prepare(
      "INSERT INTO color_presets (preset_id, name, hue, saturation, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(presetId, name, hue, saturation, maxOrder + 1, now);

    return c.json(
      { preset_id: presetId, name, hue, saturation, sort_order: maxOrder + 1, created_at: now },
      201
    );
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const result = db
      .prepare("DELETE FROM color_presets WHERE preset_id = ?")
      .run(id);
    if (result.changes === 0) return c.json({ error: "Not found" }, 404);
    return c.json({ deleted: true });
  });

  return app;
}
