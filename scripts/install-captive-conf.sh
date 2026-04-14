#!/usr/bin/env bash
set -euo pipefail

# Installs the dnsmasq config that makes the hotspot act as a captive portal.
# Must be run as root (via sudo).

CONF_DIR="/etc/NetworkManager/dnsmasq-shared.d"
CONF_FILE="$CONF_DIR/shs-captive.conf"
HOTSPOT_IP="${1:-10.42.0.1}"

mkdir -p "$CONF_DIR"
echo "address=/#/$HOTSPOT_IP" > "$CONF_FILE"
echo "Captive portal DNS config installed ($CONF_FILE)"
