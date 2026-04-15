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
    let cancelled = false;
    Promise.all([
      api.get<{ complete: boolean }>('/setup/status').catch(() => ({ complete: false })),
      api
        .get<{
          hotspot_active: boolean;
        }>('/system/wifi/status')
        .catch(() => null),
    ]).then(([setup, wifi]) => {
      if (cancelled) return;
      const token = localStorage.getItem('token');
      if (!setup.complete) {
        navigate({ to: '/setup', replace: true });
      } else if (wifi?.hotspot_active) {
        sessionStorage.setItem('postLoginRedirect', '/setup');
        if (!token) {
          navigate({ to: '/login', replace: true });
        } else {
          navigate({ to: '/setup', replace: true });
        }
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = window.location.hostname;
    const wsPort = window.location.port;
    const mqttWsUrl = wsPort
      ? `${wsProtocol}://${wsHost}:${wsPort}`
      : `${wsProtocol}://${wsHost}`;
    const client = connectMqtt(mqttWsUrl);

    client.on('connect', () => setMqttConnected(true));
    client.on('close', () => setMqttConnected(false));

    const unsub1 = subscribe('home/devices/+/state', (_topic, message) => {
      const p = message.payload;
      if (
        message.type === 'state'
        && p
        && typeof p.device_id === 'string'
      ) {
        const props =
          p.properties && typeof p.properties === 'object' && !Array.isArray(p.properties)
            ? (p.properties as Record<string, unknown>)
            : {};
        updateDeviceState(p.device_id, props);
      }
    });

    const unsub2 = subscribe('home/devices/+/availability', (_topic, message) => {
      const p = message.payload;
      if (
        p
        && typeof p.device_id === 'string'
        && typeof p.online === 'boolean'
      ) {
        setAvailability(p.device_id, p.online);
      }
    });

    const unsub3 = subscribe('home/notifications/#', (_topic, message) => {
      const p = message.payload;
      if (p && p.event === 'notification') {
        addNotification(p);
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
