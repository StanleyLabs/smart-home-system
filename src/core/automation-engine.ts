import { getDb } from "../db/database.js";
import { v4 as uuid } from "uuid";
import cron from "node-cron";
import type {
  AutomationRule,
  Trigger,
  Condition,
  Action,
  DeviceState,
} from "../types.js";

export type CommandExecutor = (
  deviceId: string,
  action: string,
  properties: Record<string, any>,
  source: string
) => Promise<void>;

export type SceneActivator = (sceneId: string) => void;
export type NotificationSender = (channel: string, message: string) => void;
export type EventPublisher = (event: string, details: Record<string, any>) => void;
export type StateGetter = (deviceId: string) => DeviceState;
export type ActiveSceneGetter = () => string | null;

export class AutomationEngine {
  private rules = new Map<string, AutomationRule>();
  private cronJobs = new Map<string, cron.ScheduledTask>();
  private runningRules = new Set<string>();
  private lastTriggered = new Map<string, number>();
  private pendingDelays = new Map<string, ReturnType<typeof setTimeout>>();
  private rateLimit = new Map<string, number[]>();

  executeCommand: CommandExecutor = async () => {};
  activateScene: SceneActivator = () => {};
  sendNotification: NotificationSender = () => {};
  publishEvent: EventPublisher = () => {};
  getDeviceState: StateGetter = () => ({});
  getActiveScene: ActiveSceneGetter = () => null;

  private rateLimitPerDevice = 10;
  private rateLimitWindowMs = 1000;

  load() {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM automations").all() as any[];
    for (const row of rows) {
      const rule: AutomationRule = {
        rule_id: row.rule_id,
        name: row.name,
        enabled: !!row.enabled,
        retrigger: JSON.parse(row.retrigger),
        trigger: JSON.parse(row.trigger_def),
        conditions: JSON.parse(row.conditions),
        actions: JSON.parse(row.actions),
        condition_logic: row.condition_logic || "all",
      };
      this.rules.set(rule.rule_id, rule);
    }
    this.setupCronJobs();
  }

  configure(rateLimitPerDevice: number, rateLimitWindowSeconds: number) {
    this.rateLimitPerDevice = rateLimitPerDevice;
    this.rateLimitWindowMs = rateLimitWindowSeconds * 1000;
  }

  getAll(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  get(ruleId: string): AutomationRule | undefined {
    return this.rules.get(ruleId);
  }

  create(data: Omit<AutomationRule, "rule_id">): AutomationRule {
    const db = getDb();
    const rule_id = uuid();
    const rule: AutomationRule = { rule_id, ...data };

    db.prepare(
      `INSERT INTO automations (rule_id, name, enabled, retrigger, trigger_def, conditions, actions, condition_logic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rule_id,
      rule.name,
      rule.enabled ? 1 : 0,
      JSON.stringify(rule.retrigger),
      JSON.stringify(rule.trigger),
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      rule.condition_logic
    );

    this.rules.set(rule_id, rule);
    this.setupCronForRule(rule);
    return rule;
  }

  update(ruleId: string, updates: Partial<Omit<AutomationRule, "rule_id">>): AutomationRule | undefined {
    const rule = this.rules.get(ruleId);
    if (!rule) return;

    Object.assign(rule, updates);

    const db = getDb();
    db.prepare(
      `UPDATE automations SET name = ?, enabled = ?, retrigger = ?, trigger_def = ?, conditions = ?, actions = ?, condition_logic = ?
       WHERE rule_id = ?`
    ).run(
      rule.name,
      rule.enabled ? 1 : 0,
      JSON.stringify(rule.retrigger),
      JSON.stringify(rule.trigger),
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      rule.condition_logic,
      ruleId
    );

    this.clearCronForRule(ruleId);
    this.setupCronForRule(rule);
    return rule;
  }

  remove(ruleId: string): boolean {
    const db = getDb();
    db.prepare("DELETE FROM automations WHERE rule_id = ?").run(ruleId);
    this.clearCronForRule(ruleId);
    return this.rules.delete(ruleId);
  }

  onDeviceStateChange(deviceId: string, property: string, value: any) {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      const trigger = rule.trigger as any;
      if (
        trigger.type === "device_state" &&
        trigger.device_id === deviceId &&
        trigger.property === property &&
        trigger.to === value
      ) {
        this.tryExecuteRule(rule);
      }
    }
  }

  onAvailabilityChange(deviceId: string, online: boolean) {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      const trigger = rule.trigger as any;
      if (
        trigger.type === "availability" &&
        trigger.device_id === deviceId &&
        trigger.to === (online ? "online" : "offline")
      ) {
        this.tryExecuteRule(rule);
      }
    }
  }

  removeDeviceFromRules(deviceId: string) {
    const db = getDb();
    for (const rule of this.rules.values()) {
      const trigger = rule.trigger as any;
      if (trigger.device_id === deviceId) {
        rule.enabled = false;
        db.prepare("UPDATE automations SET enabled = 0 WHERE rule_id = ?").run(
          rule.rule_id
        );
      }
    }
  }

  private tryExecuteRule(rule: AutomationRule) {
    const now = Date.now();
    const lastTrigger = this.lastTriggered.get(rule.rule_id) || 0;
    if (rule.retrigger.cooldown_seconds > 0 &&
        now - lastTrigger < rule.retrigger.cooldown_seconds * 1000) {
      return;
    }

    if (this.runningRules.has(rule.rule_id)) {
      switch (rule.retrigger.behavior) {
        case "ignore":
          return;
        case "restart":
          this.cancelRunningRule(rule.rule_id);
          break;
        case "queue":
          return;
      }
    }

    if (!this.checkConditions(rule)) return;

    this.lastTriggered.set(rule.rule_id, now);
    this.executeActions(rule);
  }

  private checkConditions(rule: AutomationRule): boolean {
    if (rule.conditions.length === 0) return true;

    const results = rule.conditions.map((c) => this.evaluateCondition(c));
    return rule.condition_logic === "all"
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  private evaluateCondition(condition: Condition): boolean {
    switch (condition.type) {
      case "time_range": {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentMinutes = hours * 60 + minutes;
        const [afterH, afterM] = condition.after.split(":").map(Number);
        const [beforeH, beforeM] = condition.before.split(":").map(Number);
        const afterMinutes = afterH * 60 + afterM;
        const beforeMinutes = beforeH * 60 + beforeM;

        if (afterMinutes > beforeMinutes) {
          return currentMinutes >= afterMinutes || currentMinutes < beforeMinutes;
        }
        return currentMinutes >= afterMinutes && currentMinutes < beforeMinutes;
      }
      case "device_state": {
        const state = this.getDeviceState(condition.device_id);
        return state[condition.property] === condition.equals;
      }
      case "scene_active": {
        return this.getActiveScene() === condition.scene_id;
      }
      default:
        return true;
    }
  }

  private async executeActions(rule: AutomationRule) {
    this.runningRules.add(rule.rule_id);
    try {
      for (const action of rule.actions) {
        if (!this.runningRules.has(rule.rule_id)) break;
        await this.executeAction(action, rule.rule_id);
      }
    } catch (err) {
      console.error(`Automation ${rule.rule_id} error:`, err);
      this.publishEvent("command_failed", {
        rule_id: rule.rule_id,
        error: String(err),
      });
    } finally {
      this.runningRules.delete(rule.rule_id);
    }
  }

  private async executeAction(action: Action, ruleId: string): Promise<void> {
    switch (action.type) {
      case "device_command":
        if (this.checkRateLimit(action.device_id)) {
          await this.executeCommand(
            action.device_id,
            action.action,
            action.properties,
            `automation:${ruleId}`
          );
        }
        break;
      case "activate_scene":
        this.activateScene(action.scene_id);
        break;
      case "delay":
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, action.seconds * 1000);
          this.pendingDelays.set(ruleId, timer);
        });
        this.pendingDelays.delete(ruleId);
        break;
      case "notify":
        this.sendNotification(action.channel, action.message);
        break;
      case "publish_event":
        this.publishEvent(action.event, action.details);
        break;
    }
  }

  private checkRateLimit(deviceId: string): boolean {
    const now = Date.now();
    const timestamps = this.rateLimit.get(deviceId) || [];
    const recent = timestamps.filter((t) => now - t < this.rateLimitWindowMs);
    if (recent.length >= this.rateLimitPerDevice) return false;
    recent.push(now);
    this.rateLimit.set(deviceId, recent);
    return true;
  }

  private cancelRunningRule(ruleId: string) {
    this.runningRules.delete(ruleId);
    const timer = this.pendingDelays.get(ruleId);
    if (timer) {
      clearTimeout(timer);
      this.pendingDelays.delete(ruleId);
    }
  }

  private setupCronJobs() {
    for (const rule of this.rules.values()) {
      this.setupCronForRule(rule);
    }
  }

  private setupCronForRule(rule: AutomationRule) {
    if (!rule.enabled) return;
    const trigger = rule.trigger as any;
    if (trigger.type === "schedule" && trigger.cron) {
      const job = cron.schedule(trigger.cron, () => {
        this.tryExecuteRule(rule);
      });
      this.cronJobs.set(rule.rule_id, job);
    }
  }

  private clearCronForRule(ruleId: string) {
    const job = this.cronJobs.get(ruleId);
    if (job) {
      job.stop();
      this.cronJobs.delete(ruleId);
    }
  }

  shutdown() {
    for (const job of this.cronJobs.values()) job.stop();
    this.cronJobs.clear();
    for (const timer of this.pendingDelays.values()) clearTimeout(timer);
    this.pendingDelays.clear();
  }
}
