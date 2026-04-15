import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import { Aedes } from "aedes";
import type { WebSocketServer } from "ws";
import websocketStream from "websocket-stream";

export type StopEmbeddedBroker = () => Promise<void>;

export type AttachMqttWebSocket = (server: HttpServer | HttpsServer) => void;

/**
 * In-process MQTT broker (TCP + MQTT over WebSockets) for local/dev use.
 * WebSocket MQTT is attached to the same HTTP/HTTPS server(s) as the dashboard API so browsers
 * reuse the same TLS context and port (e.g. 443/3001) — a separate `wss://…:9001` often fails with
 * self-signed certs or firewalls that only allow 443.
 */
export async function startEmbeddedBroker(opts: {
  tcpPort: number;
}): Promise<{ stop: StopEmbeddedBroker; attachMqttWebSocket: AttachMqttWebSocket }> {
  const broker = await Aedes.createBroker();

  const tcpServer = net.createServer(broker.handle);
  await new Promise<void>((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(opts.tcpPort, () => {
      tcpServer.off("error", reject);
      resolve();
    });
  });

  const wsServers: WebSocketServer[] = [];

  const attachMqttWebSocket: AttachMqttWebSocket = (server) => {
    const wss = websocketStream.createServer(
      { server },
      ((stream: Duplex, req: IncomingMessage) => {
        broker.handle(stream, req);
      }) as () => void
    );
    wsServers.push(wss as unknown as WebSocketServer);
  };

  console.log(
    `Embedded MQTT broker listening (TCP ${opts.tcpPort}; WebSocket on dashboard HTTP/HTTPS port(s))`
  );

  const stop: StopEmbeddedBroker = async () => {
    await new Promise<void>((resolve) => {
      broker.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      tcpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await Promise.all(
      wsServers.map(
        (wss) =>
          new Promise<void>((resolve, reject) => {
            wss.close((err?: Error) => (err ? reject(err) : resolve()));
          })
      )
    );
  };

  return { stop, attachMqttWebSocket };
}
