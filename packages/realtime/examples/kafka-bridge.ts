import fastify from "fastify";
import { registerRealtime, createKafkaBridge } from "@bootstrap-framework/realtime";
import { createKafkaClient } from "@bootstrap-framework/kafka";
import type { EachMessagePayload } from "@bootstrap-framework/realtime";

async function main() {
  const app = fastify({ logger: true });

  const kafka = createKafkaClient(app.log, {
    brokers: process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"],
    clientId: "realtime-example",
  });

  const hub = await registerRealtime(app, {
    websocketLibrary: "fastify",
    routes: async (server) => {
      server.get("/ws/events", { websocket: true }, async (connection, req) => {
        const clientId = (connection.socket as any).id;
        hub.join("events", { id: clientId, socket: connection.socket });

        connection.socket.on("close", () => {
          hub.leave("events", clientId);
        });
      });
    },
  });

  const bridge = createKafkaBridge(kafka, hub, app.log, {
    groupId: "realtime-bridge",
    topics: ["user-events", "notifications"],
    handlers: {
      "user-events": async (payload: EachMessagePayload) => {
        const message = JSON.parse(payload.message.value?.toString() || "{}");
        hub.broadcast("events", {
          type: "userEvent",
          topic: payload.topic,
          partition: payload.partition,
          offset: payload.message.offset,
          data: message,
        });
      },
      "notifications": async (payload: EachMessagePayload) => {
        const message = JSON.parse(payload.message.value?.toString() || "{}");
        hub.broadcast("events", {
          type: "notification",
          topic: payload.topic,
          data: message,
        });
      },
    },
  });

  await bridge.start();
  console.log("Kafka bridge started");

  app.addHook("onClose", async () => {
    await bridge.stop();
    await kafka.disconnect();
  });

  const port = 3003;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Kafka bridge server running at http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws/events`);
}

main().catch(console.error);