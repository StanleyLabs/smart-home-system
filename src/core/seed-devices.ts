import { getDb } from "../db/database.js";
import type { Engine } from "./engine.js";

interface SeedRoom {
  room_id: string;
  name: string;
  floor: string;
}

interface SeedDevice {
  device_id: string;
  device_type: string;
  protocol: string;
  protocol_id: string;
  name: string;
  room_id: string | null;
  manufacturer: string;
  model: string;
  firmware: string;
  supports: string[];
  online: boolean;
  state: Record<string, any>;
}

const ROOMS: SeedRoom[] = [
  { room_id: "room_living", name: "Living Room", floor: "1st Floor" },
  { room_id: "room_kitchen", name: "Kitchen", floor: "1st Floor" },
  { room_id: "room_bedroom", name: "Master Bedroom", floor: "2nd Floor" },
  { room_id: "room_office", name: "Office", floor: "2nd Floor" },
  { room_id: "room_bathroom", name: "Bathroom", floor: "2nd Floor" },
  { room_id: "room_garage", name: "Garage", floor: "1st Floor" },
  { room_id: "room_porch", name: "Front Porch", floor: "Exterior" },
  { room_id: "room_hallway", name: "Hallway", floor: "1st Floor" },
];

function buildDevices(): SeedDevice[] {
  const recentMotion = new Date(Date.now() - 5 * 60_000).toISOString();
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  return [
    // ── Lights ──────────────────────────────────────────────────

    // Dimmable only (warm white)
    {
      device_id: "light_ceiling01",
      device_type: "light",
      protocol: "zigbee",
      protocol_id: "zb-light-001",
      name: "Ceiling Light",
      room_id: "room_living",
      manufacturer: "Lutron",
      model: "Caseta Dimmer ELV+",
      firmware: "3.2.1",
      supports: ["brightness"],
      online: true,
      state: { on: true, brightness: 80 },
    },

    // Dimmable + color temperature (white ambiance)
    {
      device_id: "light_island01",
      device_type: "light",
      protocol: "zigbee",
      protocol_id: "zb-light-002",
      name: "Island Pendants",
      room_id: "room_kitchen",
      manufacturer: "IKEA",
      model: "TRADFRI LED 1000lm",
      firmware: "2.3.093",
      supports: ["brightness", "color_temp"],
      online: true,
      state: { on: true, brightness: 100, color_temp: 250 },
    },

    // Full RGB
    {
      device_id: "light_strip01",
      device_type: "light",
      protocol: "zigbee",
      protocol_id: "zb-light-003",
      name: "LED Strip",
      room_id: "room_bedroom",
      manufacturer: "Philips",
      model: "Hue Lightstrip Plus V4",
      firmware: "1.104.2",
      supports: ["brightness", "color_temp", "color"],
      online: true,
      state: {
        on: false,
        brightness: 50,
        color_temp: 350,
        color_hue: 240,
        color_saturation: 80,
      },
    },

    // Full RGB (second instance, different room)
    {
      device_id: "light_desk01",
      device_type: "light",
      protocol: "zwave",
      protocol_id: "zw-light-001",
      name: "Desk Lamp",
      room_id: "room_office",
      manufacturer: "LIFX",
      model: "A19 Color",
      firmware: "3.70",
      supports: ["brightness", "color_temp", "color"],
      online: true,
      state: {
        on: true,
        brightness: 70,
        color_temp: 200,
        color_hue: 30,
        color_saturation: 40,
      },
    },

    // Dimmable only (bathroom vanity)
    {
      device_id: "light_vanity01",
      device_type: "light",
      protocol: "zwave",
      protocol_id: "zw-light-002",
      name: "Vanity Light",
      room_id: "room_bathroom",
      manufacturer: "GE",
      model: "C by GE Dimmer",
      firmware: "1.8.0",
      supports: ["brightness"],
      online: true,
      state: { on: true, brightness: 60 },
    },

    // ── Switches ────────────────────────────────────────────────

    {
      device_id: "switch_coffee01",
      device_type: "switch",
      protocol: "zigbee",
      protocol_id: "zb-switch-001",
      name: "Coffee Machine",
      room_id: "room_kitchen",
      manufacturer: "TP-Link",
      model: "Kasa KP115",
      firmware: "1.0.18",
      supports: ["power_monitoring"],
      online: true,
      state: { on: true, power_w: 1200 },
    },
    {
      device_id: "switch_tv01",
      device_type: "switch",
      protocol: "zwave",
      protocol_id: "zw-switch-001",
      name: "Entertainment Center",
      room_id: "room_living",
      manufacturer: "Aeotec",
      model: "Smart Switch 7",
      firmware: "2.1",
      supports: ["power_monitoring"],
      online: true,
      state: { on: true, power_w: 85 },
    },

    // ── Locks ───────────────────────────────────────────────────

    {
      device_id: "lock_front01",
      device_type: "lock",
      protocol: "zwave",
      protocol_id: "zw-lock-001",
      name: "Front Door Lock",
      room_id: "room_hallway",
      manufacturer: "Schlage",
      model: "Encode Plus",
      firmware: "10.2",
      supports: ["battery"],
      online: true,
      state: { locked: true, battery: 78, last_action: "Locked via keypad" },
    },
    {
      device_id: "lock_back01",
      device_type: "lock",
      protocol: "zwave",
      protocol_id: "zw-lock-002",
      name: "Back Door Lock",
      room_id: "room_kitchen",
      manufacturer: "Yale",
      model: "Assure Lock 2",
      firmware: "1.60.0",
      supports: ["battery"],
      online: true,
      state: { locked: false, battery: 45, last_action: "Unlocked by Kenny" },
    },

    // ── Cameras ─────────────────────────────────────────────────

    {
      device_id: "camera_porch01",
      device_type: "camera",
      protocol: "zigbee",
      protocol_id: "zb-cam-001",
      name: "Porch Camera",
      room_id: "room_porch",
      manufacturer: "Reolink",
      model: "Argus 3 Pro",
      firmware: "2.0.0.4",
      supports: ["motion_detection", "night_vision", "two_way_audio", "battery"],
      online: true,
      state: {
        streaming: false,
        recording: true,
        motion_detected: false,
        night_vision: true,
        battery: 63,
        last_motion: hourAgo,
      },
    },
    {
      device_id: "camera_garage01",
      device_type: "camera",
      protocol: "zigbee",
      protocol_id: "zb-cam-002",
      name: "Garage Camera",
      room_id: "room_garage",
      manufacturer: "Wyze",
      model: "Cam v3",
      firmware: "4.36.11",
      supports: ["motion_detection", "night_vision"],
      online: true,
      state: {
        streaming: false,
        recording: true,
        motion_detected: false,
        night_vision: true,
      },
    },

    // ── Motion Sensors ──────────────────────────────────────────

    {
      device_id: "motion_sensor_hall01",
      device_type: "motion_sensor",
      protocol: "zigbee",
      protocol_id: "zb-motion-001",
      name: "Hallway Motion",
      room_id: "room_hallway",
      manufacturer: "Aqara",
      model: "Motion Sensor P1",
      firmware: "1.0.1",
      supports: ["battery", "illuminance"],
      online: true,
      state: {
        motion: false,
        last_motion: recentMotion,
        battery: 92,
        illuminance: 45,
      },
    },
    {
      device_id: "motion_sensor_bath01",
      device_type: "motion_sensor",
      protocol: "zigbee",
      protocol_id: "zb-motion-002",
      name: "Bathroom Motion",
      room_id: "room_bathroom",
      manufacturer: "Philips",
      model: "Hue Motion Sensor",
      firmware: "1.1.28",
      supports: ["battery", "illuminance", "temperature"],
      online: true,
      state: {
        motion: true,
        last_motion: new Date().toISOString(),
        battery: 65,
        illuminance: 120,
        temperature: 72.1,
      },
    },

    // ── Contact Sensors (door sensors) ──────────────────────────

    {
      device_id: "contact_sensor_front01",
      device_type: "contact_sensor",
      protocol: "zigbee",
      protocol_id: "zb-contact-001",
      name: "Front Door",
      room_id: "room_hallway",
      manufacturer: "Aqara",
      model: "Door & Window Sensor",
      firmware: "1.0.2",
      supports: ["battery"],
      online: true,
      state: { open: false, battery: 88 },
    },
    {
      device_id: "contact_sensor_garage01",
      device_type: "contact_sensor",
      protocol: "zwave",
      protocol_id: "zw-contact-001",
      name: "Garage Door Sensor",
      room_id: "room_garage",
      manufacturer: "Ecolink",
      model: "DWZWAVE25",
      firmware: "3.0",
      supports: ["battery"],
      online: true,
      state: { open: true, battery: 72 },
    },
    {
      device_id: "contact_sensor_window01",
      device_type: "contact_sensor",
      protocol: "zigbee",
      protocol_id: "zb-contact-002",
      name: "Office Window",
      room_id: "room_office",
      manufacturer: "Sonoff",
      model: "SNZB-04",
      firmware: "1.0.4",
      supports: ["battery"],
      online: true,
      state: { open: false, battery: 95 },
    },

    // ── Thermostat ──────────────────────────────────────────────

    {
      device_id: "thermostat_living01",
      device_type: "thermostat",
      protocol: "zwave",
      protocol_id: "zw-therm-001",
      name: "Thermostat",
      room_id: "room_living",
      manufacturer: "Ecobee",
      model: "SmartThermostat Premium",
      firmware: "4.7.4",
      supports: ["humidity"],
      online: true,
      state: {
        hvac_mode: "cool",
        target_temperature: 72,
        current_temperature: 74.5,
        humidity: 45,
        temperature_unit: "°F",
        min_temp: 50,
        max_temp: 85,
      },
    },

    // ── Environment Sensor ──────────────────────────────────────

    {
      device_id: "environment_sensor_office01",
      device_type: "environment_sensor",
      protocol: "zigbee",
      protocol_id: "zb-env-001",
      name: "Air Quality Monitor",
      room_id: "room_office",
      manufacturer: "Aqara",
      model: "TVOC Air Quality Monitor",
      firmware: "1.0.6",
      supports: ["temperature", "humidity", "battery"],
      online: true,
      state: { temperature: 71.2, humidity: 38, battery: 95 },
    },

    // ── Blinds ──────────────────────────────────────────────────

    {
      device_id: "blinds_bedroom01",
      device_type: "blinds",
      protocol: "zwave",
      protocol_id: "zw-blinds-001",
      name: "Bedroom Blinds",
      room_id: "room_bedroom",
      manufacturer: "Somfy",
      model: "Zigbee Roller Shade",
      firmware: "2.1.0",
      supports: ["tilt"],
      online: true,
      state: { position: 75, tilt: 0 },
    },
    {
      device_id: "blinds_living01",
      device_type: "blinds",
      protocol: "zwave",
      protocol_id: "zw-blinds-002",
      name: "Living Room Shades",
      room_id: "room_living",
      manufacturer: "IKEA",
      model: "FYRTUR Roller Blind",
      firmware: "24.4.5",
      supports: ["tilt"],
      online: true,
      state: { position: 100, tilt: 45 },
    },

    // ── Fan ─────────────────────────────────────────────────────

    {
      device_id: "fan_bedroom01",
      device_type: "fan",
      protocol: "zwave",
      protocol_id: "zw-fan-001",
      name: "Ceiling Fan",
      room_id: "room_bedroom",
      manufacturer: "Hunter",
      model: "SIMPLEconnect",
      firmware: "1.3.2",
      supports: ["speed"],
      online: true,
      state: { on: true, speed: 3, max_speed: 4 },
    },

    // ── Garage Door ─────────────────────────────────────────────

    {
      device_id: "garage_door_main01",
      device_type: "garage_door",
      protocol: "zwave",
      protocol_id: "zw-garage-001",
      name: "Garage Door",
      room_id: "room_garage",
      manufacturer: "Chamberlain",
      model: "myQ Smart Garage Hub",
      firmware: "5.226.0",
      supports: [],
      online: true,
      state: { open: false, obstruction: false },
    },

    // ── Doorbell ────────────────────────────────────────────────

    {
      device_id: "doorbell_front01",
      device_type: "doorbell",
      protocol: "zigbee",
      protocol_id: "zb-bell-001",
      name: "Front Doorbell",
      room_id: "room_porch",
      manufacturer: "Ring",
      model: "Video Doorbell 4",
      firmware: "3.52.14",
      supports: [
        "motion_detection",
        "two_way_audio",
        "night_vision",
        "battery",
      ],
      online: true,
      state: {
        ringing: false,
        motion_detected: false,
        battery: 81,
        last_ring: dayAgo,
        night_vision: true,
      },
    },

    // ── Extra: an offline device for testing offline UI ─────────

    {
      device_id: "light_porch01",
      device_type: "light",
      protocol: "zigbee",
      protocol_id: "zb-light-004",
      name: "Porch Light",
      room_id: "room_porch",
      manufacturer: "Philips",
      model: "Hue White A19",
      firmware: "1.93.7",
      supports: ["brightness"],
      online: false,
      state: { on: false, brightness: 0 },
    },

    // ── Extra: water leak sensor ────────────────────────────────

    {
      device_id: "contact_sensor_leak01",
      device_type: "contact_sensor",
      protocol: "zigbee",
      protocol_id: "zb-contact-003",
      name: "Water Leak Sensor",
      room_id: "room_bathroom",
      manufacturer: "Aqara",
      model: "Water Leak Sensor T1",
      firmware: "1.0.1",
      supports: ["battery"],
      online: true,
      state: { open: false, battery: 100 },
    },

    // ── Extra: kitchen smoke/co detector as environment_sensor ──

    {
      device_id: "environment_sensor_smoke01",
      device_type: "environment_sensor",
      protocol: "zigbee",
      protocol_id: "zb-env-002",
      name: "Smoke & CO Detector",
      room_id: "room_kitchen",
      manufacturer: "First Alert",
      model: "Onelink Safe & Sound",
      firmware: "2.14.0",
      supports: ["temperature", "battery"],
      online: true,
      state: { temperature: 73.4, battery: 100, smoke: false, co: false },
    },
  ];
}

/**
 * Restore online/offline status for mock devices on every startup,
 * since availability is in-memory only and lost on restart.
 */
function restoreMockAvailability(engine: Engine) {
  const devices = buildDevices();
  const known = new Set(engine.devices.getAll().map((d) => d.device_id));
  let restored = 0;
  for (const d of devices) {
    if (known.has(d.device_id)) {
      engine.devices.setAvailability(d.device_id, d.online);
      restored++;
    }
  }
  if (restored > 0) {
    console.log(`  Restored availability for ${restored} mock devices`);
  }
}

/**
 * Seeds mock devices into the database when no devices exist.
 * Returns true if seeding occurred, false if devices already exist.
 */
export function seedMockDevices(engine: Engine): boolean {
  if (engine.devices.getAll().length > 0) {
    restoreMockAvailability(engine);
    return false;
  }

  console.log("No devices found — seeding mock devices…");

  const db = getDb();
  const now = new Date().toISOString();
  const devices = buildDevices();

  const insertRoom = db.prepare(
    "INSERT OR IGNORE INTO rooms (room_id, name, floor) VALUES (?, ?, ?)"
  );
  for (const room of ROOMS) {
    insertRoom.run(room.room_id, room.name, room.floor);
  }

  const insertDevice = db.prepare(
    `INSERT INTO devices (device_id, device_type, protocol, protocol_id, name, room_id, manufacturer, model, firmware, commissioned_at, supports, config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    for (const d of devices) {
      insertDevice.run(
        d.device_id,
        d.device_type,
        d.protocol,
        d.protocol_id,
        d.name,
        d.room_id,
        d.manufacturer,
        d.model,
        d.firmware,
        now,
        JSON.stringify(d.supports),
        JSON.stringify({})
      );
    }
  });
  transaction();

  engine.devices.load();

  for (const d of devices) {
    engine.state.updateState(d.device_id, d.state);
    engine.devices.setAvailability(d.device_id, d.online);
  }

  engine.devices.rebuildSystemGroups();
  engine.state.flush();

  console.log(
    `  Seeded ${devices.length} devices across ${ROOMS.length} rooms`
  );
  return true;
}
