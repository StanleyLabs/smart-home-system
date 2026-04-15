import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SystemSettings } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../..");

function resolveHubPath(relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(PROJECT_ROOT, relOrAbs);
}

/**
 * Writes a self-signed PEM for the current `network.hostname` (SAN includes hostname, short name, localhost).
 * Used when the hostname changes or HTTPS is first enabled from settings.
 */
export async function regenerateHubTlsCertificate(
  network: SystemSettings["network"]
): Promise<{ ok: boolean; message: string }> {
  if (network.protocol !== "https" || !network.tls?.cert_path || !network.tls?.key_path) {
    return { ok: false, message: "HTTPS or tls paths not configured" };
  }

  let hostname = network.hostname.trim();
  if (!hostname.endsWith(".local")) {
    hostname = `${hostname.replace(/\.local$/i, "")}.local`;
  }
  const short = hostname.replace(/\.local$/i, "");
  const san = `DNS:${hostname},DNS:${short},DNS:localhost,IP:127.0.0.1`;

  const certAbs = resolveHubPath(network.tls.cert_path);
  const keyAbs = resolveHubPath(network.tls.key_path);
  fs.mkdirSync(path.dirname(certAbs), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    execFile(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        keyAbs,
        "-out",
        certAbs,
        "-days",
        "3650",
        "-subj",
        `/CN=${hostname}`,
        "-addext",
        `subjectAltName=${san}`,
      ],
      (err, _out, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      }
    );
  });

  try {
    fs.chmodSync(keyAbs, 0o600);
    fs.chmodSync(certAbs, 0o644);
  } catch {
    /* best-effort */
  }

  return { ok: true, message: `TLS certificate updated for ${hostname}` };
}
