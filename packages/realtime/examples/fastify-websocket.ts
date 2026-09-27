import fastify from "fastify";
import { registerRealtime, createRealtimeHub } from "../src/index.js";

async function main() {
  const app = fastify({ logger: true });

  const hub = await registerRealtime(app, {
    websocketLibrary: "fastify",
    routes: async (server) => {
      server.get("/ws/chat", { websocket: true }, async (connection, req) => {
        const clientId = crypto.randomUUID();
        (connection as any).id = clientId;
        console.log(`Client ${clientId} connected to chat`);

        hub.join("chat", { id: clientId, socket: connection });

        connection.on("message", (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            console.log(`Received from ${clientId}:`, message);

            if (message.type === "join") {
              hub.join(message.channel, { id: clientId, socket: connection });
              connection.send(JSON.stringify({ type: "joined", channel: message.channel }));
            } else if (message.type === "message") {
              // Send JSON directly for client compatibility
              const members = (hub as any).channels.get("chat");
              if (members) {
                const payload = JSON.stringify({ type: "message", from: clientId, text: message.text });
                for (const [, client] of members) {
                  if (client.socket.readyState === 1) {
                    client.socket.send(payload);
                  }
                }
              }
            }
          } catch (err) {
            console.error("Invalid message:", err);
          }
        });

        connection.on("close", () => {
          console.log(`Client ${clientId} disconnected`);
          hub.leave("chat", clientId);
        });
      });
    },
  });

  const port = 3000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server running at http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws/chat`);
}

main().catch(console.error);