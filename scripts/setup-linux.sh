#!/usr/bin/env bash
set -euo pipefail

# Detect that we're actually on a Debian/Ubuntu-based system
if ! command -v apt-get &>/dev/null; then
  echo "Error: This script requires apt-get (Debian/Ubuntu)." >&2
  exit 1
fi

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
sudo apt-get update
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

NODE_BIN="$(which node)"
CAPS="cap_net_bind_service"
if [ "$ENABLE_BLE" = true ]; then
  CAPS="cap_net_bind_service,cap_net_raw"
fi
echo "==> Granting capabilities ($CAPS) to $NODE_BIN..."
sudo setcap "${CAPS}+eip" "$NODE_BIN"
echo "    Done. Verify with: getcap $NODE_BIN"

echo "==> Ensuring avahi-daemon is running..."
sudo systemctl enable --now avahi-daemon

echo "==> Installing npm dependencies..."
npm run setup

echo ""
echo "Setup complete! Start the hub with:"
echo "  npm run dev     (development with auto-reload)"
echo "  npm run build && npm start   (production)"
