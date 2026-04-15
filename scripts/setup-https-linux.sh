#!/usr/bin/env bash
#
# Generate a self-signed TLS certificate for the hub, enable HTTPS in config/system.json,
# and persist iptables PREROUTING 443 -> (api_port + 1) where the TLS listener runs.
# Plain HTTP stays on api_port (default 3000) for the captive portal.
#
# Run after ./scripts/setup-linux.sh (or ensure openssl + python3 + sudo for iptables).
# Trust the cert on each client (browser warning) or replace certs/ with your own PEM files.
#
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_JSON="${INSTALL_DIR}/config/system.json"
CERT_DIR="${INSTALL_DIR}/certs"
CERT_FILE="hub.pem"
KEY_FILE="hub.key"
CERT_REL="certs/${CERT_FILE}"
KEY_REL="certs/${KEY_FILE}"
API_PORT=3000
HOST_OVERRIDE=""
FORCE=false
SKIP_IPTABLES=false
DRY_RUN=false

usage() {
  echo "Usage: $0 [options]"
  echo "  --api-port N     Plain HTTP / captive port (default: 3000). HTTPS uses N+1 unless set in config."
  echo "  --hostname NAME  Use this mDNS name for the cert SAN and update config (e.g. kitchen.local)."
  echo "                   If omitted, uses network.hostname from config (default smarthome.local)."
  echo "  --force          Regenerate cert/key even if they already exist."
  echo "  --no-iptables    Do not add or persist the 443 -> HTTPS listener NAT rule."
  echo "  --dry-run        Print actions only; do not write files or run iptables."
  echo "  -h, --help       Show this help."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --api-port)
      API_PORT="${2:?}"
      shift 2
      ;;
    --hostname)
      HOST_OVERRIDE="${2:?}"
      shift 2
      ;;
    --force) FORCE=true; shift ;;
    --no-iptables) SKIP_IPTABLES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

HTTPS_LISTEN=$((API_PORT + 1))

if ! command -v openssl &>/dev/null; then
  echo "Error: openssl is required. Install with: sudo apt-get install -y openssl" >&2
  exit 1
fi
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required." >&2
  exit 1
fi

if [ ! -f "$CONFIG_JSON" ]; then
  echo "Error: Config not found: $CONFIG_JSON" >&2
  exit 1
fi

if [ -n "$HOST_OVERRIDE" ]; then
  HOSTNAME="$HOST_OVERRIDE"
  case "$HOSTNAME" in
    *.local) ;;
    *) HOSTNAME="${HOSTNAME}.local" ;;
  esac
  HOST_SRC="--hostname flag"
else
  HOSTNAME="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("network") or {}).get("hostname") or "smarthome.local")' "$CONFIG_JSON")"
  HOST_SRC="config"
fi

SHORT="${HOSTNAME%.local}"

if [ "$SHORT" != "$HOSTNAME" ]; then
  SAN="DNS:${HOSTNAME},DNS:${SHORT},DNS:localhost,IP:127.0.0.1"
else
  SAN="DNS:${HOSTNAME},DNS:localhost,IP:127.0.0.1"
fi

echo "==> Hub HTTPS setup"
echo "    Install dir:     $INSTALL_DIR"
echo "    Hostname:        $HOSTNAME ($HOST_SRC)"
echo "    Cert SAN:        $SAN"
echo "    HTTP (captive):  $API_PORT"
echo "    HTTPS listener:  $HTTPS_LISTEN"
echo "    Config file:     $CONFIG_JSON"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would create ${CERT_DIR}/{${CERT_FILE},${KEY_FILE}}"
  echo "[dry-run] Would set network.protocol=https, tls, api_port, https_listen_port, public_url_port if needed"
  if [ "$SKIP_IPTABLES" != true ] && [ "$HTTPS_LISTEN" != 443 ]; then
    echo "[dry-run] Would iptables: 443 -> ${HTTPS_LISTEN} (PREROUTING NAT)"
  fi
  exit 0
fi

if [ -f "${CERT_DIR}/${CERT_FILE}" ] || [ -f "${CERT_DIR}/${KEY_FILE}" ]; then
  if [ "$FORCE" != true ]; then
    echo "Certificate files already exist under ${CERT_DIR}/" >&2
    echo "  Re-run with --force to replace them, or remove them first." >&2
    exit 1
  fi
fi

mkdir -p "$CERT_DIR"

echo "==> Generating self-signed certificate (${CERT_FILE}, ${KEY_FILE})..."
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "${CERT_DIR}/${KEY_FILE}" \
  -out "${CERT_DIR}/${CERT_FILE}" \
  -days 3650 \
  -subj "/CN=${HOSTNAME}" \
  -addext "subjectAltName=${SAN}"

chmod 600 "${CERT_DIR}/${KEY_FILE}"
chmod 644 "${CERT_DIR}/${CERT_FILE}"

echo "==> Updating ${CONFIG_JSON} (network.protocol, tls, ports, hostname)..."
export CONFIG_JSON_PATH="$CONFIG_JSON"
export API_PORT="$API_PORT"
export HTTPS_LISTEN="$HTTPS_LISTEN"
export CERT_REL="$CERT_REL"
export KEY_REL="$KEY_REL"
export CERT_HOSTNAME="$HOSTNAME"
python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["CONFIG_JSON_PATH"])
api_port = int(os.environ["API_PORT"])
https_listen = int(os.environ["HTTPS_LISTEN"])
cert_rel = os.environ["CERT_REL"]
key_rel = os.environ["KEY_REL"]

data = json.loads(path.read_text())
net = data.setdefault("network", {})
net["protocol"] = "https"
net["api_port"] = api_port
net["https_listen_port"] = https_listen
net["hostname"] = os.environ["CERT_HOSTNAME"].strip()
net["tls"] = {"cert_path": cert_rel, "key_path": key_rel}
if api_port == 3000:
    net["public_url_port"] = 443
else:
    net.pop("public_url_port", None)

path.write_text(json.dumps(data, indent=2) + "\n")
PY

if [ "$SKIP_IPTABLES" = true ]; then
  echo "==> Skipping iptables (--no-iptables)."
else
  if [ "$HTTPS_LISTEN" -eq 443 ]; then
    echo "==> HTTPS listens on 443; no 443→port NAT rule needed."
  else
    echo "==> iptables: remove legacy 443 -> 3000 (if any), then set 443 -> ${HTTPS_LISTEN}..."
    while sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 3000 2>/dev/null; do
      echo "    removed legacy 443 -> 3000"
    done
    while sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j REDIRECT --to-port "${HTTPS_LISTEN}" 2>/dev/null; do
      true
    done
    RULE="-p tcp --dport 443 -j REDIRECT --to-port ${HTTPS_LISTEN}"
    sudo iptables -t nat -A PREROUTING ${RULE}
    if command -v iptables-save &>/dev/null; then
      sudo apt-get install -y iptables-persistent 2>/dev/null || true
      if [ -d /etc/iptables ]; then
        sudo sh -c "iptables-save > /etc/iptables/rules.v4"
        echo "    Saved to /etc/iptables/rules.v4"
      fi
    fi
  fi
fi

echo ""
echo "Done."
echo "  • PEM files: ${CERT_DIR}/"
echo "  • HTTP (captive): port ${API_PORT}  —  HTTPS: port ${HTTPS_LISTEN}  —  browsers use https://hostname/ (port 443 → ${HTTPS_LISTEN})"
echo "  • The hub also syncs these iptables rules on startup (no manual iptables steps)."
echo "  • Restart the hub: npm run build && npm start   (or systemctl restart your unit)"
echo ""
echo "To undo HTTPS: set network.protocol to \"http\", remove network.tls, https_listen_port, public_url_port,"
echo "  delete certs/, and adjust iptables."
