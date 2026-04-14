import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOTSPOT_SSID = "Smart-Home-System";
const HOTSPOT_CON_NAME = "shs-hotspot";
const DNSMASQ_CONF_PATH = "/etc/NetworkManager/dnsmasq-shared.d/shs-captive.conf";
const CAPTIVE_CONF_SCRIPT = path.resolve(__dirname, "../../scripts/install-captive-conf.sh");

let hotspotActive = false;

export interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
}

export interface WifiStatus {
  connected: boolean;
  ssid: string | null;
  hotspot_active: boolean;
  ip: string | null;
  platform_supported: boolean;
}

export interface WifiResult {
  success: boolean;
  message: string;
}

function run(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout.trim());
    });
  });
}

function notLinux(action: string): void {
  console.log(`[wifi] ${action} skipped (${process.platform}): only supported on Linux`);
}

async function findWifiInterface(): Promise<string | null> {
  try {
    const output = await run("nmcli -t -f device,type device status");
    for (const line of output.split("\n")) {
      const [device, type] = line.split(":");
      if (type === "wifi") return device;
    }
  } catch {}
  return null;
}

export async function scanNetworks(): Promise<WifiNetwork[]> {
  if (process.platform !== "linux") {
    notLinux("scan");
    return [];
  }

  try {
    await run("nmcli device wifi rescan").catch(() => {});
    const output = await run("nmcli -t -f ssid,signal,security device wifi list");
    const seen = new Set<string>();
    const networks: WifiNetwork[] = [];

    for (const line of output.split("\n")) {
      if (!line) continue;
      const parts = line.split(":");
      const ssid = parts[0];
      if (!ssid || seen.has(ssid) || ssid === HOTSPOT_SSID) continue;
      seen.add(ssid);
      networks.push({
        ssid,
        signal: parseInt(parts[1]) || 0,
        security: parts.slice(2).join(":") || "Open",
      });
    }

    return networks.sort((a, b) => b.signal - a.signal);
  } catch (err) {
    console.error("[wifi] scan failed:", err);
    return [];
  }
}

export async function connectToWifi(ssid: string, password?: string): Promise<WifiResult> {
  if (process.platform !== "linux") {
    notLinux("connect");
    return { success: false, message: `WiFi connect skipped (${process.platform})` };
  }

  try {
    const iface = await findWifiInterface();
    const ifPart = iface ? ` ifname ${iface}` : "";
    const cmd = password
      ? `nmcli device wifi connect "${ssid}" password "${password}"${ifPart}`
      : `nmcli device wifi connect "${ssid}"${ifPart}`;
    await run(cmd);

    await stopHotspot().catch(() => {});

    return { success: true, message: `Connected to ${ssid}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function startHotspot(): Promise<WifiResult> {
  if (process.platform !== "linux") {
    notLinux("hotspot");
    return { success: false, message: `Hotspot skipped (${process.platform})` };
  }

  try {
    const status = await getStatus();
    if (status.hotspot_active) {
      hotspotActive = true;
      return { success: true, message: "Hotspot already active" };
    }

    const iface = await findWifiInterface();
    if (!iface) {
      return { success: false, message: "No WiFi interface found" };
    }

    await run(`nmcli connection delete ${HOTSPOT_CON_NAME}`).catch(() => {});

    await run([
      "nmcli connection add type wifi",
      `con-name ${HOTSPOT_CON_NAME}`,
      `ifname ${iface}`,
      `ssid "${HOTSPOT_SSID}"`,
      "autoconnect no",
      "wifi.mode ap",
      "wifi.band bg",
      "ipv4.method shared",
      "ipv6.method disabled",
    ].join(" "));

    await ensureCaptivePortalDns();

    await run(`nmcli connection up ${HOTSPOT_CON_NAME}`);

    await ensureCaptivePortalRedirect();

    hotspotActive = true;
    console.log(`[wifi] Hotspot "${HOTSPOT_SSID}" started on ${iface} (open network, captive portal enabled)`);
    return { success: true, message: `Hotspot "${HOTSPOT_SSID}" started` };
  } catch (err: any) {
    console.error("[wifi] hotspot start failed:", err.message);
    return { success: false, message: err.message };
  }
}

export async function stopHotspot(): Promise<WifiResult> {
  if (process.platform !== "linux") {
    notLinux("stopHotspot");
    return { success: false, message: `Stop hotspot skipped (${process.platform})` };
  }

  try {
    await run(`nmcli connection down ${HOTSPOT_CON_NAME}`);
    await run(`nmcli connection delete ${HOTSPOT_CON_NAME}`).catch(() => {});
    await removeCaptivePortalRedirect();
    hotspotActive = false;
    console.log("[wifi] Hotspot stopped");
    return { success: true, message: "Hotspot stopped" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function getStatus(): Promise<WifiStatus> {
  if (process.platform !== "linux") {
    return {
      connected: true,
      ssid: null,
      hotspot_active: false,
      ip: "127.0.0.1",
      platform_supported: false,
    };
  }

  try {
    const output = await run("nmcli -t -f type,name,device connection show --active");
    let connected = false;
    let ssid: string | null = null;
    let hotspot_active = false;

    for (const line of output.split("\n")) {
      const [type, name] = line.split(":");
      if (type === "802-11-wireless") {
        if (name === HOTSPOT_CON_NAME) {
          hotspot_active = true;
        } else {
          connected = true;
          ssid = name;
        }
      }
      if (type === "802-3-ethernet") {
        connected = true;
      }
    }

    let ip: string | null = null;
    if (connected || hotspot_active) {
      try {
        const ipOut = await run("hostname -I");
        ip = ipOut.split(" ")[0] || null;
      } catch {}
    }

    return { connected, ssid, hotspot_active, ip, platform_supported: true };
  } catch {
    return { connected: false, ssid: null, hotspot_active: false, ip: null, platform_supported: true };
  }
}

export async function checkConnectivity(): Promise<boolean> {
  if (process.platform !== "linux") {
    return true;
  }

  try {
    const output = await run("nmcli networking connectivity check");
    return output === "full" || output === "limited";
  } catch {
    return false;
  }
}

export function getHotspotSsid(): string {
  return HOTSPOT_SSID;
}

export function isHotspotMode(): boolean {
  return hotspotActive;
}

async function ensureCaptivePortalDns(): Promise<void> {
  try {
    if (!fs.existsSync(DNSMASQ_CONF_PATH)) {
      await run(`sudo "${CAPTIVE_CONF_SCRIPT}"`);
    }
  } catch (err: any) {
    console.warn("[wifi] Could not install captive portal DNS config:", err.message);
  }
}

async function ensureCaptivePortalRedirect(): Promise<void> {
  try {
    await run(
      "sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000 2>/dev/null" +
      " || sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000"
    );
    console.log("[wifi] Port 80 → 3000 redirect active");
  } catch (err: any) {
    console.warn("[wifi] Could not set up port redirect:", err.message);
  }
}

async function removeCaptivePortalRedirect(): Promise<void> {
  try {
    await run(
      "sudo iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000"
    );
  } catch {}
}
