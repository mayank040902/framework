import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { WebSocket as WsWebSocket } from "ws";
import { RealtimeHub, type Client } from "./hub.js";

export interface RealtimePluginOptions {
  routes?: (app: FastifyInstance) => Promise<void>;
  websocketLibrary?: "fastify" | "ws";
  path?: string;
}

export interface WebSocketServer {
  on(event: "connection", listener: (socket: WsWebSocket, request: unknown) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

export function createRealtimeHub(): RealtimeHub {
  return new RealtimeHub();
}

export async function registerRealtime(
  app: FastifyInstance,
  options: RealtimePluginOptions = {}
): Promise<RealtimeHub> {
  const hub = createRealtimeHub();
  app.decorate("realtime", hub);

  const { routes, websocketLibrary = "fastify", path = "/ws" } = options;

  if (websocketLibrary === "fastify") {
    const websocket = await import("@fastify/websocket");
    await app.register(websocket.default);
  } else if (websocketLibrary === "ws") {
    const { WebSocketServer: WSServer } = await import("ws");
    const wss = new WSServer({ noServer: true });

    app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.raw.url?.startsWith(path)) {
        reply.raw.destroy();
      }
    });

    app.server.on("upgrade", (request, socket, head) => {
      if (request.url?.startsWith(path)) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    });

    wss.on("connection", (ws: WsWebSocket, request) => {
      const clientId = crypto.randomUUID();
      (ws as any).id = clientId;
      const client: Client = { id: clientId, socket: ws as any };
      hub.join("default", client);

      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          // Handle message
        } catch {
          // Invalid message
        }
      });

      ws.on("close", () => {
        hub.leave("default", clientId);
      });
    });
  }

  if (typeof routes === "function") {
    await routes(app);
  }

  app.addHook("onClose", async () => {
    hub.close();
  });

  return hub;
}

export const realtimePlugin: FastifyPluginAsync<RealtimePluginOptions> = async (app, options) => {
  await registerRealtime(app, options);
};

export default realtimePlugin;