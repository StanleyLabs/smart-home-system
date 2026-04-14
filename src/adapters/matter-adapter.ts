import { spawn as spawnProcess } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { Environment, StorageService } from "@matter/main";
import { OnOff, LevelControl, GeneralCommissioning } from "@matter/main/clusters";
import { ManualPairingCodeCodec, QrPairingCodeCodec } from "@matter/main/types";
import "@matter/nodejs";
import { PeerSet } from "@matter/protocol";
import {
  CommissioningController,
  type NodeCommissioningOptions,
} from "@project-chip/matter.js";
import { NodeStates, type PairedNode } from "@project-chip/matter.js/device";
import type {
  AdapterStatus,
  DeviceType,
  DiscoveredDevice,
  Protocol,
} from "../types.js";
import type { ProtocolAdapter } from "./types.js";
import {
  type OperationalWatcher,
  watchOperationalDevices,
  testMulticastWorks,
} from "./mdns-fallback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, "../../data/matter-storage");

const MATTER_DEVICE_TYPE_MAP: Record<number, DeviceType> = {
  0x0100: "light",           // On/Off Light
  0x0101: "light",           // Dimmable Light
  0x0102: "light",           // Color Temperature Light
  0x010d: "light",           // Extended Color Light
  0x010a: "switch",          // On/Off Plug-in Unit
  0x0103: "switch",          // On/Off Light Switch
  0x0104: "switch",          // Dimmer Switch
  0x0105: "switch",          // Color Dimmer Switch
  0x0015: "contact_sensor",  // Contact Sensor
  0x0107: "motion_sensor",   // Occupancy Sensor
  0x0302: "environment_sensor", // Temperature Sensor
  0x0305: "environment_sensor", // Humidity Sensor
  0x0301: "thermostat",      // Thermostat
  0x000a: "lock",            // Door Lock
  0x0202: "blinds",          // Window Covering
};

interface DiscoveredDeviceRecord {
  tempId: string;
  discriminator: number;
  shortDiscriminator?: number;
  vendorId?: number;
  productId?: number;
  deviceType: DeviceType;
  deviceName?: string;
  addresses: Array<{ ip: string; port: number }>;
}

export class MatterAdapter implements ProtocolAdapter {
  protocol: Protocol = "matter";

  private controller: CommissioningController | null = null;
  private environment: Environment | null = null;
  private running = false;
  private discovering = false;
  private discoveryAbort: (() => void) | null = null;
  private discoveredDevices = new Map<string, DiscoveredDeviceRecord>();
  private connectedNodes = new Map<string, PairedNode>();
  private bleAvailable = false;
  private multicastBroken = false;
  private dnsSdWatcher: OperationalWatcher | null = null;
  private dnsSdFallbackActive = false;
  private _restoreMulticast: (() => void) | null = null;
  private initError: string | undefined;

  onDeviceDiscovered: (device: DiscoveredDevice) => void = () => {};
  onStateChange: (
    protocolId: string,
    properties: Record<string, any>
  ) => void = () => {};
  onAvailabilityChange: (protocolId: string, online: boolean) => void =
    () => {};

  async initialize(): Promise<void> {
    try {
      this.environment = Environment.default;

      const storageService = this.environment.get(StorageService);
      storageService.location = STORAGE_DIR;

      try {
        await import("@matter/nodejs-ble");
        this.environment.vars.set("ble.enable", true);
        this.bleAvailable = true;
        console.log("[Matter] BLE support enabled");
      } catch (err: any) {
        this.bleAvailable = false;
        const hint = process.platform === "linux"
          ? " — install BlueZ (sudo apt install bluetooth bluez libbluetooth-dev) and grant capabilities (sudo setcap cap_net_raw+eip $(which node))"
          : "";
        console.warn(`[Matter] BLE not available, mDNS-only mode${hint}`);
      }

      this.multicastBroken = !(await testMulticastWorks());
      if (this.multicastBroken) {
        console.warn("[Matter] UDP multicast is broken — enabling dns-sd fallback for operational discovery");
        this.disableMulticastGroupJoins();
        this.installDnsSdFallback();
      }

      this.controller = new CommissioningController({
        environment: {
          environment: this.environment,
          id: "smart-home-system",
        },
        autoConnect: false,
        adminFabricLabel: "Smart Home System",
      });

      await this.controller.start();
      this.running = true;
      this.initError = undefined;

      console.log("[Matter] Controller started");

      await this.reconnectCommissionedNodes();
    } catch (err: any) {
      this.initError = err.message ?? String(err);
      console.error("[Matter] Failed to initialize:", err);
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    this.running = false;
    await this.stopDiscovery();

    for (const [nodeIdStr, node] of this.connectedNodes) {
      try {
        await node.disconnect();
      } catch (err) {
        console.error(`[Matter] Error disconnecting node ${nodeIdStr}:`, err);
      }
    }
    this.connectedNodes.clear();

    if (this.controller) {
      try {
        await this.controller.close();
      } catch (err) {
        console.error("[Matter] Error closing controller:", err);
      }
      this.controller = null;
    }
    console.log("[Matter] Controller shut down");
  }

  getStatus(): AdapterStatus {
    return {
      protocol: this.protocol,
      running: this.running,
      device_count: this.connectedNodes.size,
      error: this.initError,
      capabilities: { ble: this.bleAvailable, multicast: !this.multicastBroken, dnsSdFallback: this.multicastBroken },
    };
  }

  async startDiscovery(): Promise<void> {
    if (!this.controller || !this.running) {
      throw new Error("Matter controller not initialized");
    }
    if (this.discovering) return;

    this.discovering = true;
    this.discoveredDevices.clear();
    console.log("[Matter] Discovery started — scanning for commissionable devices");

    let cancelResolve: (() => void) | null = null;
    const cancelPromise = new Promise<void>((resolve) => {
      cancelResolve = resolve;
    });
    this.discoveryAbort = cancelResolve;

    // Run discovery in background — don't await it since it blocks until timeout
    this.controller
      .discoverCommissionableDevices(
        {}, // empty identifier = discover all commissionable devices
        undefined,
        (device) => {
          if (!this.discovering) return;
          this.handleDiscoveredDevice(device);
        },
      )
      .catch((err) => {
        if (this.discovering) {
          console.error("[Matter] Discovery error:", err);
        }
      });

    // Also cancel when stopDiscovery is called
    cancelPromise.then(() => {
      try {
        this.controller?.cancelCommissionableDeviceDiscovery({});
      } catch {
        // ignore cancellation errors
      }
    });
  }

  async stopDiscovery(): Promise<void> {
    if (!this.discovering) return;
    this.discovering = false;

    if (this.discoveryAbort) {
      this.discoveryAbort();
      this.discoveryAbort = null;
    }

    try {
      this.controller?.cancelCommissionableDeviceDiscovery({});
    } catch {
      // ignore
    }

    console.log("[Matter] Discovery stopped");
  }

  async commission(tempId: string, credentials: any): Promise<string> {
    if (!this.controller || !this.running) {
      throw new Error("Matter controller not initialized");
    }

    const setupCode = credentials?.setup_code as string | undefined;
    if (!setupCode) {
      throw new Error("Setup code is required for Matter commissioning");
    }

    const { passcode, shortDiscriminator, longDiscriminator, discoveryCapabilities } =
      this.parseSetupCode(setupCode);

    const discovered = this.discoveredDevices.get(tempId);

    const identifierData =
      longDiscriminator !== undefined
        ? { longDiscriminator }
        : shortDiscriminator !== undefined
          ? { shortDiscriminator }
          : discovered
            ? { longDiscriminator: discovered.discriminator }
            : {};

    const wifiNetwork =
      credentials?.wifi_ssid && credentials?.wifi_password
        ? { wifiSsid: credentials.wifi_ssid as string, wifiCredentials: credentials.wifi_password as string }
        : undefined;

    const needsBle = wifiNetwork !== undefined && this.bleAvailable;
    const resolvedCapabilities =
      discoveryCapabilities !== undefined
        ? { onIpNetwork: !!(discoveryCapabilities & 0x04), ble: !!(discoveryCapabilities & 0x02) }
        : needsBle
          ? { ble: true, onIpNetwork: false }
          : undefined;

    const discoveryOptions: NodeCommissioningOptions["discovery"] = Object.assign(
      { identifierData },
      resolvedCapabilities ? { discoveryCapabilities: resolvedCapabilities } : {},
    );

    const options: NodeCommissioningOptions = {
      commissioning: {
        regulatoryLocation:
          GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
        regulatoryCountryCode: "XX",
        wifiNetwork,
      },
      discovery: discoveryOptions,
      passcode,
    };

    if (wifiNetwork) {
      console.log(`[Matter] Wi-Fi credentials provided for SSID: ${wifiNetwork.wifiSsid}`);
      if (!this.bleAvailable) {
        console.warn("[Matter] BLE is not available — Wi-Fi provisioning may fail. The device must already be on the network for mDNS-only commissioning.");
      }
    }

    if (this.multicastBroken && wifiNetwork) {
      console.log("[Matter] Starting dns-sd watcher for post-WiFi operational discovery");
      this.dnsSdWatcher = watchOperationalDevices();
      await this.dnsSdWatcher.ready;
      this.dnsSdFallbackActive = true;
    }

    try {
      console.log("[Matter] Commissioning device...");
      const nodeId = await this.controller.commissionNode(options);
      const nodeIdStr = nodeId.toString();

      console.log(`[Matter] Commissioned node ${nodeIdStr}`);

      await this.connectAndSubscribe(nodeIdStr);

      return nodeIdStr;
    } finally {
      if (this.dnsSdWatcher) {
        this.dnsSdWatcher.stop();
        this.dnsSdWatcher = null;
      }
      this.dnsSdFallbackActive = false;
    }
  }

  async decommission(protocolId: string): Promise<void> {
    if (!this.controller) return;

    const node = this.connectedNodes.get(protocolId);
    if (node) {
      try {
        await node.decommission();
      } catch (err) {
        console.error(
          `[Matter] Decommission via node failed for ${protocolId}, removing from controller:`,
          err
        );
        await this.controller.removeNode(BigInt(protocolId) as any, true);
      }
      this.connectedNodes.delete(protocolId);
    } else {
      await this.controller.removeNode(BigInt(protocolId) as any, true);
    }
    console.log(`[Matter] Decommissioned node ${protocolId}`);
  }

  async sendCommand(
    protocolId: string,
    _action: string,
    properties: Record<string, any>
  ): Promise<void> {
    const node = await this.ensureConnected(protocolId);
    const devices = node.getDevices();

    for (const device of devices) {
      if ("on" in properties) {
        const onOffClient = device.getClusterClient(OnOff.Complete);
        if (onOffClient) {
          if (properties.on) {
            await onOffClient.on();
          } else {
            await onOffClient.off();
          }
        }
      }

      if ("brightness" in properties) {
        const levelClient = device.getClusterClient(LevelControl.Complete);
        if (levelClient) {
          const level = Math.round(
            (Number(properties.brightness) / 100) * 254
          );
          await levelClient.moveToLevel({
            level,
            transitionTime: properties.transition_time ?? 10,
            optionsMask: {},
            optionsOverride: {},
          });
        }
      }
    }
  }

  async requestState(protocolId: string): Promise<Record<string, any>> {
    const state: Record<string, any> = {};

    try {
      const node = await this.ensureConnected(protocolId);
      const devices = node.getDevices();

      for (const device of devices) {
        const onOffClient = device.getClusterClient(OnOff.Complete);
        if (onOffClient) {
          try {
            const onOffState = onOffClient.attributes.onOff.getLocal();
            state.on = onOffState;
          } catch {
            // attribute not available locally, try remote
            try {
              state.on = await onOffClient.attributes.onOff.get();
            } catch {
              // not available
            }
          }
        }

        const levelClient = device.getClusterClient(LevelControl.Complete);
        if (levelClient) {
          try {
            const currentLevel =
              levelClient.attributes.currentLevel.getLocal();
            state.brightness =
              currentLevel != null
                ? Math.round((currentLevel / 254) * 100)
                : null;
          } catch {
            try {
              const currentLevel =
                await levelClient.attributes.currentLevel.get();
              state.brightness =
                currentLevel != null
                  ? Math.round((currentLevel / 254) * 100)
                  : null;
            } catch {
              // not available
            }
          }
        }
      }
    } catch (err) {
      console.error(
        `[Matter] Error reading state for node ${protocolId}:`,
        err
      );
    }

    return state;
  }

  // --- Private helpers ---

  /**
   * On macOS, broken multicast causes `addMembership` to silently poison the
   * underlying socket so that even unicast sends return EHOSTUNREACH. Neutering
   * the call keeps matter.js's UDP sockets usable for direct CASE connections
   * while our dns-sd fallback handles all mDNS duties via the OS responder.
   */
  private disableMulticastGroupJoins(): void {
    const { Socket } = createRequire(import.meta.url)("dgram") as typeof import("dgram");
    const origAddMembership = Socket.prototype.addMembership;
    const origDropMembership = Socket.prototype.dropMembership;

    Socket.prototype.addMembership = function () { /* no-op */ };
    Socket.prototype.dropMembership = function () { /* no-op */ };

    this._restoreMulticast = () => {
      Socket.prototype.addMembership = origAddMembership;
      Socket.prototype.dropMembership = origDropMembership;
    };

    console.log("[Matter] Disabled multicast group joins to protect UDP sockets");
  }

  /**
   * Monkey-patch PeerSet.prototype.connect so that when multicast is broken,
   * the operational reconnect step resolves device addresses via the OS
   * mDNSResponder (`dns-sd` / `avahi-browse`) instead of raw UDP multicast.
   */
  private installDnsSdFallback(): void {
    const adapter = this;
    const origConnect = PeerSet.prototype.connect;

    PeerSet.prototype.connect = async function (
      this: InstanceType<typeof PeerSet>,
      address: any,
      options: any,
    ) {
      if (adapter.dnsSdFallbackActive && !options?.operationalAddress && adapter.dnsSdWatcher) {
        try {
          const instance = await adapter.dnsSdWatcher.waitForNew(120_000);
          if (instance) {
            console.log(`[Matter] dns-sd detected new operational device: ${instance}`);
            const resolved = await adapter.dnsSdWatcher.resolve(instance);
            if (resolved) {
              console.log(`[Matter] dns-sd resolved address: ${resolved.ip}:${resolved.port}`);
              await adapter.warmUpRoute(resolved.ip);
              const opAddr = { type: "udp" as const, ip: resolved.ip, port: resolved.port };
              for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                  return await origConnect.call(this, address, {
                    ...options,
                    operationalAddress: opAddr,
                  });
                } catch (err: any) {
                  const msg = String(err?.message ?? err);
                  if (msg.includes("EHOSTUNREACH") && attempt < 5) {
                    console.log(`[Matter] EHOSTUNREACH on attempt ${attempt}, retrying in 3s...`);
                    await new Promise(r => setTimeout(r, 3000));
                    await adapter.warmUpRoute(resolved.ip);
                    continue;
                  }
                  throw err;
                }
              }
            }
          }
        } catch (err) {
          console.warn("[Matter] dns-sd fallback error, falling through to default:", err);
        }
      }
      return origConnect.call(this, address, options);
    };
  }

  /**
   * Ping the device once to populate the ARP cache so that subsequent UDP
   * sends don't get rejected with EHOSTUNREACH on a cold ARP table.
   */
  private warmUpRoute(ip: string): Promise<void> {
    return new Promise(resolve => {
      const args = process.platform === "darwin"
        ? ["-c", "1", "-W", "2000", ip]
        : ["-c", "1", "-W", "2", ip];
      const proc = spawnProcess("ping", args, { stdio: "ignore" });
      const timer = setTimeout(() => { proc.kill(); resolve(); }, 4000);
      proc.on("close", () => { clearTimeout(timer); resolve(); });
      proc.on("error", () => { clearTimeout(timer); resolve(); });
    });
  }

  private handleDiscoveredDevice(device: any): void {
    const identifier = device.deviceIdentifier as string;
    if (this.discoveredDevices.has(identifier)) return;

    const discriminator = device.D as number;
    const vpString = device.VP as string | undefined;
    const deviceTypeCode = device.DT as number | undefined;
    const deviceName = device.DN as string | undefined;

    let vendorId: number | undefined;
    let productId: number | undefined;
    if (vpString) {
      const parts = vpString.split("+");
      vendorId = parseInt(parts[0], 10) || undefined;
      productId = parseInt(parts[1], 10) || undefined;
    }

    const deviceType: DeviceType =
      deviceTypeCode !== undefined
        ? MATTER_DEVICE_TYPE_MAP[deviceTypeCode] ?? "unknown"
        : "unknown";

    const addresses = (device.addresses ?? []).map((a: any) => ({
      ip: a.ip,
      port: a.port,
    }));

    const record: DiscoveredDeviceRecord = {
      tempId: identifier,
      discriminator,
      vendorId,
      productId,
      deviceType,
      deviceName,
      addresses,
    };
    this.discoveredDevices.set(identifier, record);

    const discovered: DiscoveredDevice = {
      temp_id: identifier,
      protocol: "matter",
      device_type: deviceType,
      manufacturer: vendorId !== undefined ? `Vendor ${vendorId}` : "Unknown",
      model:
        deviceName ??
        (productId !== undefined ? `Product ${productId}` : "Matter Device"),
      requires_code: true,
    };

    console.log(
      `[Matter] Discovered: ${discovered.manufacturer} ${discovered.model} (discriminator=${discriminator})`
    );
    this.onDeviceDiscovered(discovered);
  }

  private parseSetupCode(code: string): {
    passcode: number;
    shortDiscriminator?: number;
    longDiscriminator?: number;
    discoveryCapabilities?: number;
  } {
    const trimmed = code.trim();

    if (trimmed.startsWith("MT:")) {
      const results = QrPairingCodeCodec.decode(trimmed);
      const data = Array.isArray(results) ? results[0] : results;
      return {
        passcode: data.passcode,
        longDiscriminator: data.discriminator,
        discoveryCapabilities: data.discoveryCapabilities,
      };
    }

    const digits = trimmed.replace(/[-\s]/g, "");
    if (/^\d+$/.test(digits)) {
      const decoded = ManualPairingCodeCodec.decode(digits);
      return {
        passcode: decoded.passcode,
        shortDiscriminator: decoded.shortDiscriminator,
      };
    }

    throw new Error(
      "Invalid setup code. Provide a QR code (MT:...) or numeric manual pairing code."
    );
  }

  private async reconnectCommissionedNodes(): Promise<void> {
    if (!this.controller) return;

    const nodeIds = this.controller.getCommissionedNodes();
    if (nodeIds.length === 0) return;

    console.log(
      `[Matter] Reconnecting ${nodeIds.length} commissioned node(s)...`
    );

    for (const nodeId of nodeIds) {
      const nodeIdStr = nodeId.toString();
      try {
        await this.connectAndSubscribe(nodeIdStr);
      } catch (err) {
        console.error(
          `[Matter] Failed to reconnect node ${nodeIdStr}:`,
          err
        );
        this.onAvailabilityChange(nodeIdStr, false);
      }
    }
  }

  private async connectAndSubscribe(nodeIdStr: string): Promise<void> {
    if (!this.controller) return;

    const nodeId = BigInt(nodeIdStr) as any;
    const node = await this.controller.getNode(nodeId);

    node.connect({ autoSubscribe: true });
    this.connectedNodes.set(nodeIdStr, node);

    node.events.stateChanged.on((state) => {
      const online =
        state === NodeStates.Connected;
      const offline =
        state === NodeStates.Disconnected ||
        state === NodeStates.WaitingForDeviceDiscovery;

      if (online) {
        this.onAvailabilityChange(nodeIdStr, true);
      } else if (offline) {
        this.onAvailabilityChange(nodeIdStr, false);
      }
    });

    node.events.attributeChanged.on((data) => {
      const props = this.mapAttributeToProperties(data);
      if (Object.keys(props).length > 0) {
        this.onStateChange(nodeIdStr, props);
      }
    });

    console.log(`[Matter] Node ${nodeIdStr} connected and subscribed`);
  }

  private async ensureConnected(protocolId: string): Promise<PairedNode> {
    let node = this.connectedNodes.get(protocolId);
    if (node?.isConnected) return node;

    if (!node && this.controller) {
      await this.connectAndSubscribe(protocolId);
      node = this.connectedNodes.get(protocolId);
    }

    if (!node) {
      throw new Error(`Node ${protocolId} not available`);
    }

    if (!node.isConnected) {
      node.triggerReconnect();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (!node.isConnected) {
        throw new Error(`Node ${protocolId} is not connected`);
      }
    }

    return node;
  }

  private mapAttributeToProperties(
    data: any
  ): Record<string, any> {
    const props: Record<string, any> = {};
    const clusterId = data?.path?.clusterId;
    const attributeId = data?.path?.attributeId;

    // OnOff cluster (id 6), onOff attribute (id 0)
    if (clusterId === 6 && attributeId === 0) {
      props.on = data.value;
    }

    // LevelControl cluster (id 8), currentLevel attribute (id 0)
    if (clusterId === 8 && attributeId === 0) {
      props.brightness =
        data.value !== null
          ? Math.round((data.value / 254) * 100)
          : null;
    }

    return props;
  }
}
