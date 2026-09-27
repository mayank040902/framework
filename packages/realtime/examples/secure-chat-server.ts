import fastify from "fastify";
import { 
  registerRealtime, 
  generateKeyPair,
  computeSharedKey,
  encryptWithSharedKey,
  decryptWithSharedKey,
  toBase64,
  fromBase64,
  type Client 
} from "../src/index.js";

interface EncryptedClient extends Client {
  keyPair: { publicKey: Buffer; privateKey: Buffer };
  serverSharedKey: Buffer;
}

const connectedClients = new Map<string, EncryptedClient>();

async function main() {
  const app = fastify({ logger: true });

  const hub = await registerRealtime(app, {
    websocketLibrary: "fastify",
    routes: async (server) => {
      server.get("/ws/secure-chat", { websocket: true }, async (connection, req) => {
        const clientId = crypto.randomUUID();
        (connection as any).id = clientId;
        
        const clientKeyPair = generateKeyPair();
        const serverKeyPair = generateKeyPair();
        
        hub.enableE2EE();
        hub.registerClientKey(clientId, clientKeyPair.publicKey);
        
        const serverSharedKey = computeSharedKey(clientKeyPair.publicKey, serverKeyPair.privateKey);
        
        const client: EncryptedClient = { 
          id: clientId, 
          socket: connection,
          keyPair: clientKeyPair,
          serverSharedKey
        };
        connectedClients.set(clientId, client);
        
        console.log(`Client ${clientId} connected to secure chat`);
        
        connection.send(JSON.stringify({
          type: "welcome",
          clientId,
          serverPublicKey: toBase64(serverKeyPair.publicKey),
        }));

        connection.on("message", async (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === "clientPublicKey") {
              const clientPubKey = fromBase64(message.publicKey);
              hub.registerClientKey(clientId, clientPubKey);
              
              const sharedKey = computeSharedKey(clientPubKey, serverKeyPair.privateKey);
              client.serverSharedKey = sharedKey;
              
              connection.send(JSON.stringify({ type: "keyRegistered" }));
              console.log(`Client ${clientId} registered public key`);
              
            } else if (message.type === "message") {
              const client = connectedClients.get(clientId);
              if (!client) return;
              
              const plaintext = message.text;
              const encrypted = encryptWithSharedKey(Buffer.from(plaintext), client.serverSharedKey);
              
              console.log(`Encrypted message from ${clientId}: ${plaintext}`);
              
              const members = (hub as any).channels.get("secure-chat");
              if (members) {
                const payload = JSON.stringify({ 
                  type: "encryptedMessage",
                  from: clientId,
                  ciphertext: toBase64(encrypted),
                });
                
                for (const [id, c] of members) {
                  if (c.socket.readyState === 1 && id !== clientId) {
                    const otherClient = connectedClients.get(id);
                    if (otherClient) {
                      c.socket.send(payload);
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("Error processing message:", err);
          }
        });

        connection.on("close", () => {
          console.log(`Client ${clientId} disconnected`);
          connectedClients.delete(clientId);
        });
      });
    },
  });

  const port = 3004;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Secure chat server running at http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws/secure-chat`);
}

main().catch(console.error);