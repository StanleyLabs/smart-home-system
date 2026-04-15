#!/usr/bin/env bash
#
# Generate a self-signed TLS certificate for the hub, enable HTTPS in config/system.json,
# set public_url_port when Node stays on 3000 with iptables 443 -> 3000, and persist that rule.
#
# Run after ./scripts/setup-linux.sh (or ensure openssl, python3, and sudo for iptables).
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
FORCE=false
SKIP_IPTABLES=false
DRY_RUN=false

usage() {
  echo "Usage: $0 [options]"
  echo "  --api-port N   Hub listen port (default: 3000). Use 443 only if Node may bind to it (needs cap/setcap)."
  echo "  --force        Regenerate cert/key even if they already exist."
  echo "  --no-iptables  Do not add or persist the 443 -> api_port NAT rule."
  echo "  --dry-run      Print actions only; do not write files or run iptables."
  echo "  -h, --help     Show this help."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --api-port)
      API_PORT="${2:?}"
      shift 2
      ;;
    --force) FORCE=true; shift ;;
    --no-iptables) SKIP_IPTABLES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

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

HOSTNAME="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("network") or {}).get("hostname") or "homehub.local")' "$CONFIG_JSON")"
SHORT="${HOSTNAME%.local}"

if [ "$SHORT" != "$HOSTNAME" ]; then
  SAN="DNS:${HOSTNAME},DNS:${SHORT},DNS:localhost,IP:127.0.0.1"
else
  SAN="DNS:${HOSTNAME},DNS:localhost,IP:127.0.0.1"
fi

echo "==> Hub HTTPS setup"
echo "    Install dir:  $INSTALL_DIR"
echo "    Hostname:     $HOSTNAME (from config)"
echo "    Cert SAN:     $SAN"
echo "    API port:     $API_PORT"
echo "    Config file:  $CONFIG_JSON"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would create ${CERT_DIR}/{${CERT_FILE},${KEY_FILE}}"
  echo "[dry-run] Would set network.protocol=https, tls paths, api_port=${API_PORT}, public_url_port if needed"
  if [ "$SKIP_IPTABLES" != true ] && [ "$API_PORT" != 443 ]; then
    echo "[dry-run] Would iptables: 443 -> ${API_PORT} (PREROUTING NAT)"
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

echo "==> Updating ${CONFIG_JSON} (network.protocol, tls, api_port, public_url_port)..."
python3 - <<PY
import json
from pathlib import Path

path = Path("${CONFIG_JSON}")
api_port = int("${API_PORT}")
data = json.loads(path.read_text())
net = data.setdefault("network", {})
net["protocol"] = "https"
net["api_port"] = api_port
net["tls"] = {
    "cert_path": "${CERT_REL}",
    "key_path": "${KEY_REL}",
}
# Browsers use https://hostname/ (port 443) while Node listens on 3000 behind NAT.
if api_port == 3000:
    net["public_url_port"] = 443
else:
    net.pop("public_url_port", None)

path.write_text(json.dumps(data, indent=2) + "\n")
PY

if [ "$SKIP_IPTABLES" = true ]; then
  echo "==> Skipping iptables (--no-iptables)."
else
  if [ "$API_PORT" -eq 443 ]; then
    echo "==> api_port is 443; no 443->port NAT rule needed."
  else
    echo "==> iptables: redirect TCP 443 -> ${API_PORT} (same idea as port 80 -> 3000)..."
    RULE="-p tcp --dport 443 -j REDIRECT --to-port ${API_PORT}"
    sudo iptables -t nat -C PREROUTING ${RULE} 2>/dev/null \
      || sudo iptables -t nat -A PREROUTING ${RULE}
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
echo "  • Open the dashboard at the URL printed by the hub (see public_base_url in /api/system/wifi/status)."
echo "  • Typical URL: https://${HOSTNAME}/ (accept the browser warning on each device, or install your own CA)"
echo "  • Restart the hub: npm run build && npm start   (or systemctl restart your unit)"
echo ""
echo "To undo HTTPS: set network.protocol to \"http\", remove network.tls and network.public_url_port,"
echo "  delete certs/, and remove the iptables 443 redirect if you added it."
