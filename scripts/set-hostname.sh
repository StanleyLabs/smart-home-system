#!/usr/bin/env bash
set -euo pipefail

# Applies an mDNS hostname on Linux (Raspberry Pi, Jetson, etc.).
# Safe to call on any platform — exits cleanly on non-Linux.

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "SKIP: Not Linux ($(uname -s)), hostname unchanged."
  exit 0
fi

NEW_HOSTNAME="${1:-}"
if [[ -z "$NEW_HOSTNAME" ]]; then
  echo "Usage: set-hostname.sh <hostname>" >&2
  exit 1
fi

# Strip .local suffix if provided — hostnamectl wants the short name
SHORT_NAME="${NEW_HOSTNAME%.local}"

if [[ "$SHORT_NAME" =~ [^a-zA-Z0-9-] ]]; then
  echo "ERROR: Hostname may only contain letters, digits, and hyphens." >&2
  exit 1
fi

CURRENT="$(hostnamectl --static 2>/dev/null || hostname)"
if [[ "$CURRENT" == "$SHORT_NAME" ]]; then
  echo "OK: Hostname already set to $SHORT_NAME"
  exit 0
fi

echo "Setting hostname: $CURRENT -> $SHORT_NAME"

hostnamectl set-hostname "$SHORT_NAME"

# Update /etc/hosts so the name resolves locally
if grep -q "127\.0\.1\.1" /etc/hosts; then
  sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$SHORT_NAME/" /etc/hosts
else
  echo -e "127.0.1.1\t$SHORT_NAME" >> /etc/hosts
fi

# Restart Avahi so the .local name is advertised immediately
if command -v systemctl &>/dev/null && systemctl is-active --quiet avahi-daemon; then
  systemctl restart avahi-daemon
fi

echo "OK: Hostname set to $SHORT_NAME ($SHORT_NAME.local via mDNS)"
