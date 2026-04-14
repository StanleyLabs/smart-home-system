import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "../../scripts/set-hostname.sh");

export interface HostnameResult {
  applied: boolean;
  message: string;
}

/**
 * Applies the mDNS hostname on supported platforms (Linux only).
 * On macOS / Windows this is a safe no-op so dev machines are never affected.
 */
export function applyHostname(hostname: string): Promise<HostnameResult> {
  if (process.platform !== "linux") {
    const msg = `Hostname change skipped (${process.platform}): would set "${hostname}" on a Linux hub`;
    console.log(`[hostname] ${msg}`);
    return Promise.resolve({ applied: false, message: msg });
  }

  return new Promise((resolve) => {
    execFile("sudo", [SCRIPT, hostname], (err, stdout, stderr) => {
      const output = (stdout + stderr).trim();
      if (err) {
        console.error(`[hostname] Failed to apply "${hostname}":`, output);
        resolve({ applied: false, message: output || err.message });
        return;
      }
      console.log(`[hostname] ${output}`);
      resolve({ applied: true, message: output });
    });
  });
}
