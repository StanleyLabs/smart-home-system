/**
 * Fallback mDNS resolver using the OS `dns-sd` (macOS) or `avahi-browse` (Linux)
 * command-line tools. These use the platform's mDNS responder and work even when
 * Node.js raw UDP multicast is broken (a known macOS issue after BLE operations).
 */

import { spawn, type ChildProcess } from "child_process";

export interface ResolvedAddress {
  ip: string;
  port: number;
}

export interface OperationalWatcher {
  ready: Promise<void>;
  waitForNew(timeoutMs?: number): Promise<string | null>;
  resolve(instanceName: string): Promise<ResolvedAddress | null>;
  stop(): void;
}

/**
 * Start watching for `_matter._tcp` operational devices via the OS mDNS responder.
 * The first ~3 seconds of results are treated as "already known"; anything appearing
 * after that is considered a newly-commissioned device.
 */
export function watchOperationalDevices(): OperationalWatcher {
  const known = new Set<string>();
  const pending: string[] = [];
  let settled = false;
  let listener: ((instance: string) => void) | null = null;
  let proc: ChildProcess | null = null;

  const readyPromise = new Promise<void>((resolveReady) => {
    if (process.platform === "darwin") {
      proc = spawn("dns-sd", ["-B", "_matter._tcp", "local."], { stdio: ["ignore", "pipe", "ignore"] });
    } else {
      proc = spawn("avahi-browse", ["-p", "-r", "_matter._tcp", "local"], { stdio: ["ignore", "pipe", "ignore"] });
    }

    const settleTimer = setTimeout(() => {
      settled = true;
      resolveReady();
    }, 3000);

    proc.stdout!.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        let instance: string | undefined;

        if (process.platform === "darwin") {
          const m = line.match(/\s+Add\s+\d+\s+\d+\s+\S+\s+_matter\._tcp\.\s+(\S+)/);
          if (m) instance = m[1];
        } else {
          const m = line.match(/^\+;.*;_matter\._tcp;.*;(.+)$/);
          if (m) instance = m[1].trim();
        }

        if (!instance) continue;

        if (!settled) {
          known.add(instance);
        } else if (!known.has(instance)) {
          known.add(instance);
          pending.push(instance);
          listener?.(instance);
        }
      }
    });

    proc.on("error", () => {
      clearTimeout(settleTimer);
      settled = true;
      resolveReady();
    });
  });

  return {
    ready: readyPromise,

    waitForNew(timeoutMs = 120_000): Promise<string | null> {
      if (pending.length > 0) return Promise.resolve(pending.shift()!);

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          listener = null;
          resolve(null);
        }, timeoutMs);

        listener = (inst) => {
          clearTimeout(timer);
          listener = null;
          resolve(inst);
        };
      });
    },

    async resolve(instanceName: string): Promise<ResolvedAddress | null> {
      const service = await lookupService(instanceName);
      if (!service) return null;
      const ip = await resolveHostname(service.hostname);
      if (!ip) return null;
      return { ip, port: service.port };
    },

    stop() {
      listener = null;
      proc?.kill();
      proc = null;
    },
  };
}

function lookupService(instanceName: string): Promise<{ hostname: string; port: number } | null> {
  if (process.platform === "darwin") {
    return dnsSdLookup(instanceName);
  }
  return avahiLookup(instanceName);
}

function dnsSdLookup(instanceName: string): Promise<{ hostname: string; port: number } | null> {
  return new Promise((resolve) => {
    const proc = spawn("dns-sd", ["-L", instanceName, "_matter._tcp", "local."], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const timer = setTimeout(() => { proc.kill(); resolve(null); }, 10_000);
    let buf = "";
    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const m = buf.match(/can be reached at\s+(\S+?):(\d+)/);
      if (m) {
        clearTimeout(timer);
        proc.kill();
        resolve({ hostname: m[1], port: parseInt(m[2], 10) });
      }
    });
    proc.on("close", () => { clearTimeout(timer); resolve(null); });
    proc.on("error", () => { clearTimeout(timer); resolve(null); });
  });
}

function avahiLookup(instanceName: string): Promise<{ hostname: string; port: number } | null> {
  return new Promise((resolve) => {
    const proc = spawn("avahi-browse", ["-rpt", "_matter._tcp", "local"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const timer = setTimeout(() => { proc.kill(); resolve(null); }, 10_000);
    let buf = "";
    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      // avahi-browse -rpt output: "=;iface;protocol;name;type;domain;hostname;address;port;txt"
      for (const line of buf.split("\n")) {
        if (!line.startsWith("=")) continue;
        const fields = line.split(";");
        if (fields.length >= 9 && fields[3] === instanceName) {
          clearTimeout(timer);
          proc.kill();
          resolve({ hostname: fields[6], port: parseInt(fields[8], 10) });
          return;
        }
      }
    });
    proc.on("close", () => { clearTimeout(timer); resolve(null); });
    proc.on("error", () => { clearTimeout(timer); resolve(null); });
  });
}

function resolveHostname(hostname: string): Promise<string | null> {
  if (process.platform === "darwin") {
    return dnsSdResolveHost(hostname);
  }
  return avahiResolveHost(hostname);
}

function dnsSdResolveHost(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("dns-sd", ["-G", "v4", hostname], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const timer = setTimeout(() => { proc.kill(); resolve(null); }, 10_000);
    let buf = "";
    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const m = buf.match(/\s(\d+\.\d+\.\d+\.\d+)\s/);
      if (m) {
        clearTimeout(timer);
        proc.kill();
        resolve(m[1]);
      }
    });
    proc.on("close", () => { clearTimeout(timer); resolve(null); });
    proc.on("error", () => { clearTimeout(timer); resolve(null); });
  });
}

function avahiResolveHost(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("avahi-resolve", ["-4", "--name", hostname], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const timer = setTimeout(() => { proc.kill(); resolve(null); }, 10_000);
    let buf = "";
    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const m = buf.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (m) {
        clearTimeout(timer);
        proc.kill();
        resolve(m[1]);
      }
    });
    proc.on("close", () => { clearTimeout(timer); resolve(null); });
    proc.on("error", () => { clearTimeout(timer); resolve(null); });
  });
}

/**
 * Quick test: can Node.js send UDP multicast? Returns false on macOS when the
 * Wi-Fi radio is in a degraded state (common after BLE operations).
 */
export function testMulticastWorks(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (ok: boolean) => { if (!resolved) { resolved = true; resolve(ok); } };

    try {
      const dgram = require("dgram") as typeof import("dgram");
      const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
      s.on("error", () => { s.close(); done(false); });
      s.bind(0, () => {
        const buf = Buffer.from("mcast-test");
        s.send(buf, 0, buf.length, 5353, "224.0.0.251", (err) => {
          s.close();
          done(!err);
        });
      });
      setTimeout(() => done(false), 3000);
    } catch {
      done(false);
    }
  });
}
