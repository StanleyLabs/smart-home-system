import { useCallback } from 'react';
import { api } from '../lib/api';
import { useDeviceStore } from '../stores/device-store';

/**
 * Shared hook for sending device commands with optimistic state updates.
 *
 * @param onError Called when the API request fails — callers decide recovery
 *   strategy (e.g. bump local state to re-render, or refetch from server).
 */
export function useDeviceCommand(onError: () => void) {
  const updateDeviceState = useDeviceStore((s) => s.updateDeviceState);

  const handleCommand = useCallback(
    async (deviceId: string, action: string, properties: Record<string, unknown>) => {
      updateDeviceState(deviceId, properties);
      try {
        await api.post(`/devices/${deviceId}/command`, { action, properties });
      } catch {
        onError();
      }
    },
    [updateDeviceState, onError],
  );

  return handleCommand;
}
