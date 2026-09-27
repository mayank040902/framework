import fastify from "fastify";
import { 
  registerRealtime, 
  generateKeyPair, 
  registerClientKey, 
  sendEncrypted,
  type Client 
} from "../src/index.js";

async function main() {
  const app = fastify({ logger: true });

  const hub = await registerRealtime(app, {
    websocketLibrary: "fastify",
    routes: async (server) => {
      server.get("/ws/secure", { websocket: true }, async (connection, req) => {
        const clientId = (connection.socket as any).id;
        const client: Client = { id: clientId, socket: connection.socket };

        const serverKeyPair = generateKeyPair();
        const clientKeyPair = generateKeyPair();

        hub.enableE2EE();
        registerClientKey(clientId, clientKeyPair.publicKey);

        connection.socket.send(JSON.stringify({
          type: "keys",
          serverPublicKey: serverKeyPair.publicKey.toString("base64"),
        }));

        hub.join("secure", client);

        connection.socket.on("message", (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === "clientPublicKey") {
              const clientPubKey = Buffer.from(message.publicKey, "base64");
              registerClientKey(clientId, clientPubKey);
              connection.socket.send(JSON.stringify({ type: "keyRegistered" }));
            } else if (message.type === "secureMessage") {
              console.log(`Secure message from ${clientId}:`, message.text);
              hub.broadcastEncrypted("secure", { 
                type: "secureMessage", 
                from: clientId, 
                text: message.text 
              });
            }
          } catch (err) {
            console.error("Invalid message:", err);
          }
        });

        connection.socket.on("close", () => {
          hub.leave("secure", clientId);
        });
      });
    },
  });

  const port = 3002;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`E2EE server running at http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws/secure`);
}

main().catch(console.error);