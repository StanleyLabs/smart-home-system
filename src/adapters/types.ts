import type { AdapterStatus, DiscoveredDevice, Protocol } from "../types.js";

export interface ProtocolAdapter {
  protocol: Protocol;

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getStatus(): AdapterStatus;

  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  commission(tempId: string, credentials: any): Promise<string>;
  decommission(protocolId: string): Promise<void>;

  sendCommand(
    protocolId: string,
    action: string,
    properties: Record<string, any>
  ): Promise<void>;
  requestState(protocolId: string): Promise<Record<string, any>>;

  onDeviceDiscovered: (device: DiscoveredDevice) => void;
  onStateChange: (protocolId: string, properties: Record<string, any>) => void;
  onAvailabilityChange: (protocolId: string, online: boolean) => void;
}
