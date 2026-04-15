import net from "node:net";
import http from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";
import { Aedes } from "aedes";
import websocketStream from "websocket-stream";

export type StopEmbeddedBroker = () => Promise<void>;

/**
 * In-process MQTT broker (TCP + MQTT over WebSockets) for local/dev use.
 * Use external Mosquitto instead by setting network.mqtt.embedded_broker to false.
 * When `tls` is set, the WebSocket server uses HTTPS so browsers loading the
 * dashboard over HTTPS can connect with `wss://` (same PEM as the API).
 */
export async function startEmbeddedBroker(opts: {
  tcpPort: number;
  wsPort: number;
  tls?: { key: Buffer; cert: Buffer };
}): Promise<StopEmbeddedBroker> {
  const broker = await Aedes.createBroker();

  const tcpServer = net.createServer(broker.handle);
  await new Promise<void>((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(opts.tcpPort, () => {
      tcpServer.off("error", reject);
      resolve();
    });
  });

  const httpServer = opts.tls
    ? https.createServer({ key: opts.tls.key, cert: opts.tls.cert })
    : http.createServer();
  // websocket-stream typings expect `() => void`; runtime passes (stream, req).
  websocketStream.createServer(
    { server: httpServer },
    ((stream: Duplex, req: http.IncomingMessage) => {
      broker.handle(stream, req);
    }) as () => void
  );
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.wsPort, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const wsLabel = opts.tls ? "wss://…" : "ws://…";
  console.log(
    `Embedded MQTT broker listening (TCP ${opts.tcpPort}, WebSocket ${wsLabel}:${opts.wsPort})`
  );

  return async () => {
    await new Promise<void>((resolve) => {
      broker.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      tcpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };
}
