import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SystemSettings } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../..");

const DEFAULT_CA_PATH = "certs/ca.pem";
const DEFAULT_CA_KEY_PATH = "certs/ca.key";

function resolveHubPath(relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(PROJECT_ROOT, relOrAbs);
}

function runOpenssl(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("openssl", args, (err, _out, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

/**
 * Ensures a local CA exists at `certs/ca.pem` + `certs/ca.key`.
 * Reuses the existing CA if present so client trust is preserved across hostname changes.
 */
async function ensureLocalCA(short: string): Promise<{ caAbs: string; caKeyAbs: string }> {
  const caAbs = resolveHubPath(DEFAULT_CA_PATH);
  const caKeyAbs = resolveHubPath(DEFAULT_CA_KEY_PATH);
  fs.mkdirSync(path.dirname(caAbs), { recursive: true });

  if (fs.existsSync(caAbs) && fs.existsSync(caKeyAbs)) {
    return { caAbs, caKeyAbs };
  }

  await runOpenssl([
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", caKeyAbs,
    "-out", caAbs,
    "-days", "3650",
    "-subj", `/CN=${short} Hub CA`,
  ]);

  try {
    fs.chmodSync(caKeyAbs, 0o600);
    fs.chmodSync(caAbs, 0o644);
  } catch { /* best-effort */ }

  return { caAbs, caKeyAbs };
}

/**
 * Generates a CA-signed PEM for the current `network.hostname`.
 * The local CA is created on first use and reused thereafter so that client
 * devices that have installed it stay trusted across hostname changes.
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
  const csrAbs = certAbs.replace(/\.pem$/, ".csr");
  fs.mkdirSync(path.dirname(certAbs), { recursive: true });

  const { caAbs, caKeyAbs } = await ensureLocalCA(short);

  await runOpenssl([
    "req", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyAbs,
    "-out", csrAbs,
    "-subj", `/CN=${hostname}`,
    "-addext", `subjectAltName=${san}`,
  ]);

  await runOpenssl([
    "x509", "-req",
    "-in", csrAbs,
    "-CA", caAbs, "-CAkey", caKeyAbs, "-CAcreateserial",
    "-out", certAbs,
    "-days", "3650",
    "-copy_extensions", "copyall",
  ]);

  try { fs.unlinkSync(csrAbs); } catch { /* best-effort */ }

  try {
    fs.chmodSync(keyAbs, 0o600);
    fs.chmodSync(certAbs, 0o644);
  } catch { /* best-effort */ }

  if (!network.tls.ca_path) {
    network.tls.ca_path = DEFAULT_CA_PATH;
  }

  return { ok: true, message: `TLS certificate updated for ${hostname} (CA-signed)` };
}
