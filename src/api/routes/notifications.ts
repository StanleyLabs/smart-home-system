import { Hono } from "hono";
import type { Engine } from "../../core/engine.js";
import type { User } from "../../types.js";

export function notificationRoutes(engine: Engine) {
  const app = new Hono();

  app.get("/", (c) => {
    const limit = parseInt(c.req.query("limit") || "50");
    return c.json(engine.notifications.getRecent(limit));
  });

  app.get("/unread", (c) => {
    return c.json(engine.notifications.getUnacknowledged());
  });

  app.post("/:id/acknowledge", (c) => {
    engine.notifications.acknowledge(c.req.param("id"));
    return c.json({ success: true });
  });

  app.post("/acknowledge-all", (c) => {
    const user = (c as any).get("user") as User;
    engine.notifications.acknowledgeAll(user?.user_id || "");
    return c.json({ success: true });
  });

  return app;
}
