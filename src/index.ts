import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Engine } from "./core/engine.js";
import { MqttBridge } from "./mqtt/bridge.js";
import { startEmbeddedBroker } from "./mqtt/embedded-broker.js";
import { startServer } from "./api/server.js";
import { MatterAdapter } from "./adapters/matter-adapter.js";
import { closeDb } from "./db/database.js";
import { seedMockDevices } from "./core/seed-devices.js";
import { getBaseUrl, type SystemSettings } from "./types.js";
import { ensureNetworkOrHotspot } from "./core/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../config/system.json");
const DEFAULTS_PATH = path.join(__dirname, "../config/system.defaults.json");
const DATA_DIR = path.join(__dirname, "../data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let settings: SystemSettings;
if (fs.existsSync(CONFIG_PATH)) {
  settings = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
} else {
  settings = JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf-8"));
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));
}

const engine = new Engine(settings);

const matterAdapter = new MatterAdapter();
engine.registerAdapter("matter", matterAdapter);

async function main() {
  const hotspotStarted = await ensureNetworkOrHotspot();

  await engine.start();
  seedMockDevices(engine);

  let stopEmbedded: (() => Promise<void>) | undefined;
  const mqttSection = settings.network.mqtt;
  const brokerIsLocal =
    mqttSection.broker_host === "localhost" ||
    mqttSection.broker_host === "127.0.0.1";
  const useEmbedded =
    mqttSection.embedded_broker !== false && brokerIsLocal;

  if (useEmbedded) {
    try {
      stopEmbedded = await startEmbeddedBroker({
        tcpPort: mqttSection.broker_port,
        wsPort: mqttSection.websocket_port,
      });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as NodeJS.ErrnoException).code)
          : "";
      console.error(
        `Failed to start embedded MQTT broker${code ? ` (${code})` : ""}:`,
        err
      );
      console.error(
        "Set network.mqtt.embedded_broker to false in config/system.json if you run Mosquitto (or another broker) yourself, or free ports",
        mqttSection.broker_port,
        "and",
        mqttSection.websocket_port
      );
      process.exit(1);
    }
  }

  const mqtt = new MqttBridge(engine, settings);
  await mqtt.connect();

  startServer(engine, settings);

  console.log("Smart Home Hub is running");
  if (hotspotStarted) {
    console.log("  WiFi: Connect to \"Smart-Home-System\" to set up");
    console.log("  API: http://192.168.4.1");
  } else {
    console.log(`  API: ${getBaseUrl(settings.network)}`);
  }
  console.log(
    `  MQTT: ${settings.network.mqtt.broker_host}:${settings.network.mqtt.broker_port}` +
      (useEmbedded ? " (embedded broker)" : "")
  );

  const shutdown = async () => {
    console.log("\nShutting down...");
    await engine.shutdown();
    await mqtt.disconnect();
    if (stopEmbedded) await stopEmbedded();
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
