import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SystemSettings } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Project root (directory containing `config/`). */
const PROJECT_ROOT = path.join(__dirname, "../..");

function resolveHubPath(relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(PROJECT_ROOT, relOrAbs);
}

export function getTlsCredentials(
  network: SystemSettings["network"]
): { key: Buffer; cert: Buffer } | null {
  const tls = network.tls;
  if (!tls?.cert_path || !tls?.key_path) return null;
  const certPath = resolveHubPath(tls.cert_path);
  const keyPath = resolveHubPath(tls.key_path);
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return null;
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}

/**
 * Ensures `network.protocol` and `network.tls` stay in sync: HTTPS requires
 * readable PEM files; TLS paths must not be set unless serving HTTPS.
 */
export function validateHubTlsConfig(network: SystemSettings["network"]): void {
  const creds = getTlsCredentials(network);
  if (network.protocol === "https") {
    if (!creds) {
      console.error(
        'network.protocol is "https" but TLS PEM files are missing or unreadable. ' +
          "Set network.tls.cert_path and network.tls.key_path (paths relative to the hub " +
          "install directory or absolute), then restart."
      );
      process.exit(1);
    }
    const httpsPort = network.https_listen_port ?? network.api_port + 1;
    if (httpsPort === network.api_port) {
      console.error(
        "When TLS is enabled, https_listen_port must differ from api_port: HTTP stays on api_port " +
          "(captive portal); HTTPS uses https_listen_port (default api_port + 1)."
      );
      process.exit(1);
    }
    return;
  }
  if (creds) {
    console.error(
      "network.tls is set and certificate files were found, but network.protocol is not " +
        '"https". Set network.protocol to "https" or remove tls paths.'
    );
    process.exit(1);
  }
}
