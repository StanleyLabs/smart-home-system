#!/usr/bin/env bash
set -euo pipefail

# Detect that we're actually on a Debian/Ubuntu-based system
if ! command -v apt-get &>/dev/null; then
  echo "Error: This script requires apt-get (Debian/Ubuntu)." >&2
  exit 1
fi

INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENABLE_BLE=false
for arg in "$@"; do
  case "$arg" in
    --ble) ENABLE_BLE=true ;;
    --help|-h)
      echo "Usage: $0 [--ble]"
      echo "  --ble  Install Bluetooth/BLE packages for Matter BLE commissioning"
      exit 0
      ;;
  esac
done

echo "==> Installing build tools and core dependencies..."
sudo apt-get update || echo "  ⚠  apt-get update had errors (stale third-party repos?). Continuing anyway..."
sudo apt-get install -y \
  build-essential \
  python3 \
  git \
  curl \
  avahi-daemon \
  avahi-utils \
  libnss-mdns \
  wireless-tools \
  network-manager

# Node.js (v20+) via NodeSource if not already installed
if ! command -v node &>/dev/null || [ "$(node -e 'console.log(+process.versions.node.split(".")[0] >= 20)')" != "true" ]; then
  echo "==> Installing Node.js 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "==> Node.js $(node --version) already installed, skipping."
fi

if [ "$ENABLE_BLE" = true ]; then
  echo "==> Installing Bluetooth/BLE packages..."
  sudo apt-get install -y \
    bluetooth \
    bluez \
    libbluetooth-dev
fi

if [ "$ENABLE_BLE" = true ]; then
  NODE_BIN="$(which node)"
  echo "==> Granting BLE capability (cap_net_raw) to $NODE_BIN..."
  sudo setcap "cap_net_raw+eip" "$NODE_BIN"
  echo "    Done. Verify with: getcap $NODE_BIN"
fi

echo "==> Ensuring avahi-daemon is running..."
sudo systemctl enable --now avahi-daemon

echo "==> Installing captive portal DNS config..."
sudo mkdir -p /etc/NetworkManager/dnsmasq-shared.d
sudo cp "$(dirname "$0")/../deploy/shs-captive.conf" /etc/NetworkManager/dnsmasq-shared.d/

API_PORT="$(python3 -c 'import json; print(json.load(open("'"${INSTALL_DIR}"'/config/system.json")).get("network",{}).get("api_port",80))' 2>/dev/null || echo 80)"
if [ "$API_PORT" -ne 80 ]; then
  echo "==> Setting up port redirect (80 -> ${API_PORT})..."
  sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "$API_PORT" 2>/dev/null \
    || sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "$API_PORT"
else
  echo "==> Hub listens on port 80 directly; no 80->port redirect needed."
fi

if command -v iptables-save &>/dev/null; then
  sudo apt-get install -y iptables-persistent 2>/dev/null || true
  sudo sh -c "iptables-save > /etc/iptables/rules.v4"
  echo "    iptables rule persisted."
fi

echo "==> Configuring sudoers for hub process..."
SUDOERS_FILE="/etc/sudoers.d/smarthub"
CURRENT_USER="${SUDO_USER:-$USER}"
sudo tee "$SUDOERS_FILE" > /dev/null <<SUDOERS
# Smart Home System — allow the hub process to manage networking without full root.
# Only these specific commands are permitted.
smarthub ALL=(ALL) NOPASSWD: /usr/sbin/iptables
smarthub ALL=(ALL) NOPASSWD: ${INSTALL_DIR}/scripts/set-hostname.sh *
smarthub ALL=(ALL) NOPASSWD: ${INSTALL_DIR}/scripts/install-captive-conf.sh
${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/sbin/iptables
${CURRENT_USER} ALL=(ALL) NOPASSWD: ${INSTALL_DIR}/scripts/set-hostname.sh *
${CURRENT_USER} ALL=(ALL) NOPASSWD: ${INSTALL_DIR}/scripts/install-captive-conf.sh
SUDOERS
sudo chmod 0440 "$SUDOERS_FILE"
sudo visudo -c -f "$SUDOERS_FILE"
echo "    Sudoers installed for users: smarthub, $CURRENT_USER"

echo "==> Installing npm dependencies..."
npm run setup

echo ""
echo "Setup complete! Start the hub with:"
echo "  npm run dev     (development with auto-reload)"
echo "  npm run build && npm start   (production)"
echo ""
echo "Optional — HTTPS for mobile browsers (QR camera, etc.):"
echo "  ./scripts/setup-https-linux.sh"
