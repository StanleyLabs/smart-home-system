import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from './stores/auth-store';
import { useDeviceStore } from './stores/device-store';
import { connectMqtt, subscribe } from './lib/mqtt';
import { api } from './lib/api';

export default function App() {
  const theme = useAuthStore((s) => s.theme);
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const updateDeviceState = useDeviceStore((s) => s.updateDeviceState);
  const setAvailability = useDeviceStore((s) => s.setAvailability);
  const addNotification = useDeviceStore((s) => s.addNotification);
  const setMqttConnected = useDeviceStore((s) => s.setMqttConnected);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    api
      .get<{ complete: boolean }>('/setup/status')
      .then((res) => {
        if (!res.complete) {
          navigate({ to: '/setup', replace: true });
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!token) return;

    const wsPort = 9001;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = window.location.hostname;
    const client = connectMqtt(`${wsProtocol}://${wsHost}:${wsPort}`);

    client.on('connect', () => setMqttConnected(true));
    client.on('close', () => setMqttConnected(false));

    const unsub1 = subscribe('home/devices/+/state', (_topic, message) => {
      if (message.type === 'state' && message.payload?.device_id) {
        updateDeviceState(
          message.payload.device_id,
          message.payload.properties || {},
        );
      }
    });

    const unsub2 = subscribe('home/devices/+/availability', (_topic, message) => {
      if (message.payload?.device_id !== undefined) {
        setAvailability(message.payload.device_id, message.payload.online);
      }
    });

    const unsub3 = subscribe('home/notifications/#', (_topic, message) => {
      if (message.payload?.event === 'notification') {
        addNotification(message.payload);
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [token]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    );
  }

  return <Outlet />;
}
