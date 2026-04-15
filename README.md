# Smart Home Hub

A local-first, privacy-focused smart home system supporting Matter, Zigbee, and Z-Wave protocols. No cloud dependency, no subscriptions.

## Quick Start

```bash
# Install all dependencies
npm run setup

# Start the hub (development mode with hot reload)
npm run dev
```

The hub starts on **http://localhost:3000**. On first launch, you'll be guided through a setup wizard to create your admin account, connect to WiFi, and configure the hub.

> **Production (Linux):** The setup script adds an iptables redirect from port 80 to 3000 so the hub is reachable at a clean URL like `http://home.local`.

## Architecture

- **Core Engine** — Device registry, state manager, automation engine, scene manager, undo/redo system, notification system
- **Protocol Adapters** — Pluggable adapter interface for Matter, Zigbee, Z-Wave (mock adapter included for development)
- **MQTT Bus** — Real-time pub/sub event bus. By default the hub runs a small **embedded** broker (TCP + WebSocket) so you do not need Mosquitto for local development. Set `network.mqtt.embedded_broker` to `false` in `config/system.json` if you use an external broker instead.
- **REST API** — Hono-based API server with session authentication
- **Web Dashboard** — React + Tailwind CSS with real-time MQTT updates

## Tech Stack

### Backend
- TypeScript, Hono (API), better-sqlite3 (persistence), MQTT.js

### Frontend
- React, TypeScript, Tailwind CSS, Zustand (real-time state), TanStack Query

## Project Structure

```
smart-home-system/
├── src/
│   ├── index.ts              # Entry point
│   ├── types.ts              # Shared types
│   ├── core/
│   │   ├── engine.ts         # Main engine
│   │   ├── device-registry.ts
│   │   ├── state-manager.ts
│   │   ├── automation-engine.ts
│   │   ├── scene-manager.ts
│   │   ├── undo-system.ts
│   │   ├── notification-system.ts
│   │   ├── wifi-manager.ts   # WiFi scan/connect/hotspot via nmcli
│   │   ├── onboarding.ts     # First-boot network check
│   │   └── hostname.ts       # mDNS hostname on Linux
│   ├── adapters/
│   │   ├── types.ts          # ProtocolAdapter interface
│   │   └── mock-adapter.ts
│   ├── mqtt/
│   │   └── bridge.ts
│   ├── api/
│   │   ├── server.ts
│   │   ├── auth.ts
│   │   └── routes/
│   └── db/
│       └── database.ts
├── dashboard/                # React frontend
├── config/
│   └── system.defaults.json
└── data/                     # SQLite databases (auto-created)
```

## Development

```bash
# Backend only (with hot reload)
npm run dev

# Dashboard dev server (with API proxy to backend)
cd dashboard && npm run dev

# Build everything for production
npm run build

# Start production
npm start
```

## Linux Setup (Ubuntu / Raspberry Pi / Jetson Nano)

The hub runs natively on Linux ARM64 and x86_64. A single setup script handles everything — system dependencies, networking, permissions, and npm install:

```bash
# One-time setup (run with sudo access)
./scripts/setup-linux.sh

# With BLE support for Matter Bluetooth commissioning
./scripts/setup-linux.sh --ble

# Build and run (no sudo needed after setup)
npm run build
npm start
```

That's it. The setup script configures sudoers, iptables, captive portal DNS, and mDNS so `npm start` works without root.

### Prerequisites (installed by the script)

| Package | Purpose |
|---------|---------|
| `build-essential`, `python3` | Compile native npm modules (`bcrypt`, `better-sqlite3`) |
| `avahi-daemon`, `avahi-utils`, `libnss-mdns` | mDNS discovery for Matter devices |
| `wireless-tools`, `network-manager` | WiFi onboarding hotspot, scanning, and connection (`nmcli`) |
| `iptables-persistent` | Persist port 80 → 3000 redirect across reboots |
| `bluetooth`, `bluez`, `libbluetooth-dev` | BLE commissioning (optional, use `--ble`) |
| Node.js 20+ | Runtime (installed via NodeSource if missing) |

### Security Model

The hub process never runs as root. A narrowly scoped sudoers file (installed by `setup-linux.sh`) allows exactly three commands without a password:

| Command | Purpose |
|---------|---------|
| `iptables` | Toggle port 80 → 3000 redirect for captive portal |
| `scripts/set-hostname.sh` | Apply mDNS hostname changes |
| `scripts/install-captive-conf.sh` | Install captive portal DNS config |

Everything else runs as the unprivileged `smarthub` user. The systemd service enforces additional hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`).

### Running as a systemd Service

A unit file is provided in `deploy/smart-home-system.service` for production use:

```bash
# Create a service user
sudo useradd -r -s /usr/sbin/nologin smarthub

# Copy the built project to /opt
sudo mkdir -p /opt/smart-home-system
sudo cp -r dist scripts config data package.json node_modules /opt/smart-home-system/
sudo chown -R smarthub:smarthub /opt/smart-home-system

# Install and start the service
sudo cp deploy/smart-home-system.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now smart-home-system

# Check status / logs
sudo systemctl status smart-home-system
sudo journalctl -u smart-home-system -f
```

### First-Boot WiFi Onboarding

When the hub boots with no network connection (no ethernet, no saved WiFi), it automatically creates an open WiFi hotspot named **Smart-Home-System**. Connect to it from your phone or laptop — a captive portal popup will open the setup wizard automatically. During setup, you'll pick your home WiFi network and enter the password. The hub joins your network and tears down the hotspot — the whole process takes about two minutes.

On macOS / Windows (development), the WiFi onboarding step is automatically skipped.

### Raspberry Pi / Jetson Nano Notes

- **RAM:** The hub with embedded MQTT broker uses ~100-150 MB. Fine for Pi 3 (1 GB) and Jetson Nano (4 GB). For very constrained setups, use an external Mosquitto broker by setting `network.mqtt.embedded_broker` to `false` in `config/system.json`.
- **ARM64:** All native npm dependencies (`bcrypt`, `better-sqlite3`, Matter) compile from source via node-gyp on ARM64. Ensure `build-essential` is installed.
- **BLE on Pi:** Requires BlueZ and `cap_net_raw` on the Node binary. Use `./scripts/setup-linux.sh --ble` to install everything.
- **GPU:** The hub does not use GPU compute — no CUDA/NVIDIA drivers needed on Jetson.

## Themes

Three built-in themes selectable from the user menu:
- **Midnight** — Dark with blue accents
- **Light** — Clean, bright, high readability
- **LCARS** — Orange/purple on black (Star Trek inspired)
