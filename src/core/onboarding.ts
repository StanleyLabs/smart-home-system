import { checkConnectivity, startHotspot, getHotspotSsid, getStatus } from "./wifi-manager.js";
import { isSetupComplete } from "../api/auth.js";

/**
 * Run at boot before the API server starts.
 * If there's no network and setup hasn't been completed, start an open
 * hotspot so the user can connect and go through the setup wizard.
 *
 * Returns true if the hotspot was started (caller should log the SSID).
 */
export async function ensureNetworkOrHotspot(): Promise<boolean> {
  if (process.platform !== "linux") {
    console.log("[onboarding] Skipping network check (not Linux)");
    return false;
  }

  const online = await checkConnectivity();
  if (online) {
    console.log("[onboarding] Network connectivity OK");
    return false;
  }

  const status = await getStatus();
  if (status.hotspot_active) {
    console.log(`[onboarding] Hotspot "${getHotspotSsid()}" already active`);
    return true;
  }

  const setupDone = isSetupComplete();
  console.log(
    `[onboarding] No network detected. Setup ${setupDone ? "complete" : "pending"} — starting hotspot...`
  );

  const result = await startHotspot();
  if (result.success) {
    console.log(`[onboarding] Connect to WiFi network "${getHotspotSsid()}" to set up your hub`);
    return true;
  }

  console.error("[onboarding] Failed to start hotspot:", result.message);
  return false;
}
