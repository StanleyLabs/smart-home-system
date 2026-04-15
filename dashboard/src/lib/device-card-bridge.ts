import type { DeviceCardDevice, DeviceType } from '../components/DeviceCard';
import type { HubDevice } from './hub-types';

const VALID_DEVICE_TYPES: ReadonlySet<string> = new Set<DeviceType>([
  'light',
  'switch',
  'lock',
  'thermostat',
  'contact_sensor',
  'motion_sensor',
  'environment_sensor',
  'blinds',
  'camera',
  'fan',
  'garage_door',
  'doorbell',
]);

export function toCardDevice(d: HubDevice, onlineOverride?: boolean): DeviceCardDevice {
  const dt: DeviceType = VALID_DEVICE_TYPES.has(d.device_type)
    ? (d.device_type as DeviceType)
    : 'light';
  return {
    device_id: d.device_id,
    device_type: dt,
    name: d.name,
    online: onlineOverride ?? d.online,
    supports: d.supports,
  };
}

export function mergedState(
  device: HubDevice,
  storeSlice: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...(device.state ?? {}), ...(storeSlice ?? {}) };
}
