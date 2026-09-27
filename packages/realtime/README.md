# @bootstrap-framework/realtime

In-memory WebSocket hub, Fastify plugin, optional Kafka bridge, and E2EE helpers.

Monorepo: https://github.com/mayank040902/framework

`@bootstrap-framework/kafka`, Fastify, `@fastify/websocket`, and `ws` are optional peers.

## Install

```bash
npm install @bootstrap-framework/realtime
```

Requires **Node.js 20+**.

For Fastify WebSockets:

```bash
npm install fastify @fastify/websocket
```

For the Kafka bridge:

```bash
npm install @bootstrap-framework/kafka
```

## Quick start

```javascript
import Fastify from "fastify";
import { registerRealtime, broadcastPublicInteraction } from "@bootstrap-framework/realtime";

const app = Fastify({ logger: true });

await registerRealtime(app, {
    routes: async (fastify) => {
        fastify.get("/ws/public/interactions", { websocket: true }, async (connection, request) => {
            const { record_id } = request.query;
            const channel = record_id ? `interactions:${record_id}` : "interactions:global";
            const client = { id: crypto.randomUUID(), socket: connection.socket };

            fastify.realtime.join(channel, client);
            connection.socket.send(JSON.stringify({ type: "connected", channel }));

            connection.socket.on("close", () => {
                fastify.realtime.leave(channel, client.id);
            });
        });
    },
});

broadcastPublicInteraction(app.realtime, "record-uuid", {
    type: "like",
    userId: "user-uuid",
    timestamp: Date.now(),
});

await app.listen({ port: 4002 });
```

## Kafka bridge

The bridge depends on a Kafka-like client with `getConsumer(groupId)`. Types are local, so this package publishes without a required Kafka import.

```javascript
import { createKafkaBridge } from "@bootstrap-framework/realtime";
import { createKafkaClient } from "@bootstrap-framework/kafka";

const kafka = createKafkaClient({ brokers: "localhost:9092" });
const bridge = createKafkaBridge(kafka, hub, logger, {
    groupId: "realtime-bridge",
    topics: ["user-events"],
    handlers: {
        "user-events": async (payload) => {
            hub.broadcast("events", payload.message);
        },
    },
});

await bridge.start();
```

## API

### RealtimeHub

| Method | Description |
| :--- | :--- |
| `join(channelName, client)` | Add a client to a channel |
| `leave(channelName, clientId)` | Remove a client |
| `send(target, message)` | Send to one socket or client |
| `broadcast(channelName, message, opts?)` | Send to a channel |
| `participants(channelName)` | Connected clients |
| `channelCount(channelName)` | Client count |
| `totalSubscribers()` | Total connected clients |
| `close()` | Close sockets and clear channels |

### Other exports

| Export | Description |
| :--- | :--- |
| `registerRealtime(app, options?)` | Fastify plugin |
| `createRealtimeHub()` | Standalone hub |
| `createKafkaBridge(kafka, hub, logger, config)` | Kafka consumer to hub |
| `broadcastPublicInteraction(hub, recordId, interaction)` | Broadcast helper |
| `generateKeyPair` / `encrypt` / `decrypt` | E2EE helpers |

## License

MIT. Copyright (c) 2026 mayank.
