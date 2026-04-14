import mqtt from 'mqtt';

let client: mqtt.MqttClient | null = null;
const listeners = new Map<string, Set<(topic: string, payload: any) => void>>();

export function connectMqtt(wsUrl: string) {
  if (client) return client;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token') || '';

  client = mqtt.connect(wsUrl, {
    clientId: `dashboard-${Date.now()}`,
    username: user.username || 'dashboard',
    password: token,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    client!.subscribe('home/#');
  });

  client.on('message', (topic, payload) => {
    try {
      const message = JSON.parse(payload.toString());
      for (const [pattern, handlers] of listeners) {
        if (topicMatches(pattern, topic)) {
          handlers.forEach((h) => h(topic, message));
        }
      }
    } catch {
      // ignore malformed
    }
  });

  return client;
}

export function disconnectMqtt() {
  if (client) {
    client.end();
    client = null;
  }
}

export function subscribe(pattern: string, handler: (topic: string, payload: any) => void) {
  if (!listeners.has(pattern)) listeners.set(pattern, new Set());
  listeners.get(pattern)!.add(handler);
  return () => {
    listeners.get(pattern)?.delete(handler);
  };
}

export function publish(topic: string, payload: any) {
  if (client?.connected) {
    client.publish(topic, JSON.stringify(payload));
  }
}

export function getMqttClient() {
  return client;
}

function topicMatches(pattern: string, topic: string): boolean {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '#') return true;
    if (patternParts[i] === '+') continue;
    if (patternParts[i] !== topicParts[i]) return false;
  }

  return patternParts.length === topicParts.length;
}
