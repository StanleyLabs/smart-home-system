import { getDb } from "../db/database.js";
import { v4 as uuid } from "uuid";
import type { Scene, DeviceState } from "../types.js";

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private activeSceneId: string | null = null;

  load() {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM scenes").all() as any[];
    for (const row of rows) {
      const scene: Scene = {
        scene_id: row.scene_id,
        name: row.name,
        icon: row.icon || "",
        snapshot: JSON.parse(row.snapshot || "{}"),
        transition_seconds: row.transition_seconds || 0,
      };
      this.scenes.set(scene.scene_id, scene);
    }
  }

  getAll(): Scene[] {
    return Array.from(this.scenes.values());
  }

  get(sceneId: string): Scene | undefined {
    return this.scenes.get(sceneId);
  }

  getActiveSceneId(): string | null {
    return this.activeSceneId;
  }

  create(data: {
    name: string;
    icon?: string;
    snapshot: Record<string, DeviceState>;
    transition_seconds?: number;
  }): Scene {
    const db = getDb();
    const scene_id = `scene_${uuid().slice(0, 8)}`;
    const scene: Scene = {
      scene_id,
      name: data.name,
      icon: data.icon || "",
      snapshot: data.snapshot,
      transition_seconds: data.transition_seconds || 0,
    };

    db.prepare(
      `INSERT INTO scenes (scene_id, name, icon, snapshot, transition_seconds)
       VALUES (?, ?, ?, ?, ?)`
    ).run(scene_id, scene.name, scene.icon, JSON.stringify(scene.snapshot), scene.transition_seconds);

    this.scenes.set(scene_id, scene);
    return scene;
  }

  update(sceneId: string, updates: Partial<Omit<Scene, "scene_id">>): Scene | undefined {
    const scene = this.scenes.get(sceneId);
    if (!scene) return;

    const db = getDb();
    if (updates.name !== undefined) scene.name = updates.name;
    if (updates.icon !== undefined) scene.icon = updates.icon;
    if (updates.snapshot !== undefined) scene.snapshot = updates.snapshot;
    if (updates.transition_seconds !== undefined)
      scene.transition_seconds = updates.transition_seconds;

    db.prepare(
      `UPDATE scenes SET name = ?, icon = ?, snapshot = ?, transition_seconds = ? WHERE scene_id = ?`
    ).run(scene.name, scene.icon, JSON.stringify(scene.snapshot), scene.transition_seconds, sceneId);

    return scene;
  }

  remove(sceneId: string): boolean {
    const db = getDb();
    db.prepare("DELETE FROM scenes WHERE scene_id = ?").run(sceneId);
    return this.scenes.delete(sceneId);
  }

  activate(sceneId: string): Record<string, DeviceState> | undefined {
    const scene = this.scenes.get(sceneId);
    if (!scene) return;
    this.activeSceneId = sceneId;
    return scene.snapshot;
  }

  removeDeviceFromScenes(deviceId: string) {
    const db = getDb();
    for (const scene of this.scenes.values()) {
      if (scene.snapshot[deviceId]) {
        delete scene.snapshot[deviceId];
        db.prepare("UPDATE scenes SET snapshot = ? WHERE scene_id = ?").run(
          JSON.stringify(scene.snapshot),
          scene.scene_id
        );
      }
    }
  }
}
