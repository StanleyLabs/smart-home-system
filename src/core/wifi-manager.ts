import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startCaptiveDns, stopCaptiveDns, getCaptiveDnsPort } from "./captive-dns.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOTSPOT_SSID = "Smart-Home-System";
const HOTSPOT_CON_NAME = "shs-hotspot";
const DNSMASQ_CONF_PATH = "/etc/NetworkManager/dnsmasq-shared.d/shs-captive.conf";
const CAPTIVE_CONF_SCRIPT = path.resolve(__dirname, "../../scripts/install-captive-conf.sh");
const DEFAULT_HOTSPOT_IP = "10.42.0.1";

let hotspotActive = false;
let hotspotIp = DEFAULT_HOTSPOT_IP;
let hotspotIface: string | null = null;
let cachedNetworks: WifiNetwork[] = [];

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

  // In hotspot mode the radio can't scan; return the pre-hotspot cache
  if (hotspotActive) {
    console.log(`[wifi] In hotspot mode — returning ${cachedNetworks.length} cached networks`);
    return cachedNetworks;
  }

  return doScan();
}

async function doScan(): Promise<WifiNetwork[]> {
  try {
    await run("nmcli device wifi rescan").catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
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

    // Scan while the radio is still in station mode so the setup wizard
    // can show nearby networks even after we switch to AP mode.
    console.log("[wifi] Pre-scanning networks before hotspot...");
    cachedNetworks = await doScan();
    console.log(`[wifi] Cached ${cachedNetworks.length} networks`);

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

    // Detect the IP that NM assigned to the hotspot interface
    hotspotIface = iface;
    hotspotIp = await detectInterfaceIp(iface);
    console.log(`[wifi] Hotspot interface ${iface} has IP ${hotspotIp}`);

    // Start the in-process DNS responder (answers all queries with our IP)
    startCaptiveDns(hotspotIp);

    // Redirect HTTP (80 → 3000) and DNS (53 → captive DNS port) on this interface
    await ensureCaptivePortalRedirect(iface);
    await ensureDnsRedirect(iface);

    hotspotActive = true;
    console.log(`[wifi] Hotspot "${HOTSPOT_SSID}" started on ${iface} (open network, captive portal enabled)`);
    return { success: true, message: `Hotspot "${HOTSPOT_SSID}" started on ${hotspotIp}` };
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
    stopCaptiveDns();
    if (hotspotIface) {
      await removeDnsRedirect(hotspotIface);
    }
    await removeCaptivePortalRedirect();
    await run(`nmcli connection down ${HOTSPOT_CON_NAME}`);
    await run(`nmcli connection delete ${HOTSPOT_CON_NAME}`).catch(() => {});
    hotspotActive = false;
    hotspotIface = null;
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

export function getHotspotIp(): string {
  return hotspotIp;
}

export function isHotspotMode(): boolean {
  return hotspotActive;
}

async function detectInterfaceIp(iface: string): Promise<string> {
  try {
    await new Promise((r) => setTimeout(r, 1000));
    const out = await run(
      `nmcli -g IP4.ADDRESS connection show ${HOTSPOT_CON_NAME}`
    );
    const ip = out.split("/")[0].trim();
    if (ip) return ip;
  } catch {}
  return DEFAULT_HOTSPOT_IP;
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

async function ensureCaptivePortalRedirect(iface?: string): Promise<void> {
  const ifPart = iface ? `-i ${iface} ` : "";
  const rule = `${ifPart}-p tcp --dport 80 -j REDIRECT --to-port 3000`;
  try {
    await run(
      `sudo iptables -t nat -C PREROUTING ${rule} 2>/dev/null` +
      ` || sudo iptables -t nat -A PREROUTING ${rule}`
    );
    console.log(`[wifi] Port 80 → 3000 redirect active${iface ? ` (${iface})` : ""}`);
  } catch (err: any) {
    console.warn("[wifi] Could not set up HTTP redirect:", err.message);
  }
}

async function removeCaptivePortalRedirect(): Promise<void> {
  // Remove both interface-specific and global rules (best effort)
  const rules = [
    hotspotIface
      ? `-i ${hotspotIface} -p tcp --dport 80 -j REDIRECT --to-port 3000`
      : null,
    "-p tcp --dport 80 -j REDIRECT --to-port 3000",
  ].filter(Boolean);
  for (const rule of rules) {
    try {
      await run(`sudo iptables -t nat -D PREROUTING ${rule}`);
    } catch {}
  }
}

async function ensureDnsRedirect(iface: string): Promise<void> {
  const dnsPort = getCaptiveDnsPort();
  const rule = `-i ${iface} -p udp --dport 53 -j REDIRECT --to-port ${dnsPort}`;
  try {
    await run(
      `sudo iptables -t nat -C PREROUTING ${rule} 2>/dev/null` +
      ` || sudo iptables -t nat -A PREROUTING ${rule}`
    );
    console.log(`[wifi] DNS redirect active on ${iface} (53 → ${dnsPort})`);
  } catch (err: any) {
    console.warn("[wifi] Could not set up DNS redirect:", err.message);
  }
}

async function removeDnsRedirect(iface: string): Promise<void> {
  const dnsPort = getCaptiveDnsPort();
  try {
    await run(
      `sudo iptables -t nat -D PREROUTING -i ${iface} -p udp --dport 53 -j REDIRECT --to-port ${dnsPort}`
    );
  } catch {}
}
