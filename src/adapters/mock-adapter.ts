import type { AdapterStatus, DiscoveredDevice, Protocol } from "../types.js";
import type { ProtocolAdapter } from "./types.js";

export class MockAdapter implements ProtocolAdapter {
  protocol: Protocol = "matter";
  private running = false;
  private devices = new Map<string, Record<string, any>>();
  private discovering = false;

  onDeviceDiscovered: (device: DiscoveredDevice) => void = () => {};
  onStateChange: (
    protocolId: string,
    properties: Record<string, any>
  ) => void = () => {};
  onAvailabilityChange: (protocolId: string, online: boolean) => void =
    () => {};

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  getStatus(): AdapterStatus {
    return {
      protocol: this.protocol,
      running: this.running,
      device_count: this.devices.size,
    };
  }

  async startDiscovery(): Promise<void> {
    this.discovering = true;
  }

  async stopDiscovery(): Promise<void> {
    this.discovering = false;
  }

  async commission(tempId: string, _credentials: any): Promise<string> {
    await new Promise((r) => setTimeout(r, 800));
    const protocolId = `mock-${tempId}`;
    this.devices.set(protocolId, {});
    return protocolId;
  }

  async decommission(protocolId: string): Promise<void> {
    this.devices.delete(protocolId);
  }

  async sendCommand(
    protocolId: string,
    _action: string,
    properties: Record<string, any>
  ): Promise<void> {
    const state = this.devices.get(protocolId) || {};
    Object.assign(state, properties);
    this.devices.set(protocolId, state);
    this.onStateChange(protocolId, properties);
  }

  async requestState(protocolId: string): Promise<Record<string, any>> {
    return this.devices.get(protocolId) || {};
  }
}
