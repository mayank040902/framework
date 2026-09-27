# @bootstrap-framework/realtime

In-memory WebSocket hub, Fastify plugin, optional Kafka bridge, and E2EE helpers.

`@bootstrap-framework/kafka`, Fastify, `@fastify/websocket`, and `ws` are optional peers.

Package README: `packages/realtime/README.md`

## Install

```bash
npm install @bootstrap-framework/realtime
npm install fastify @fastify/websocket
```

## Hub API

| Method | Description |
| :--- | :--- |
| `join(channelName, client)` | Add a client to a channel |
| `leave(channelName, clientId)` | Remove a client |
| `send(target, message)` | Send to one socket or client |
| `broadcast(channelName, message, opts?)` | Send to a channel |
| `enableE2EE()` | libsodium box key exchange on the hub |
| `close()` | Close sockets and clear channels |

## Other exports

| Export | Description |
| :--- | :--- |
| `registerRealtime(app, options?)` | Fastify plugin, decorates `app.realtime` |
| `createRealtimeHub()` | Standalone hub |
| `createKafkaBridge(kafka, hub, logger, config)` | Kafka consumer to hub |
| `generateKeyPair` / `encrypt` / `decrypt` | E2EE helpers |

Use `wss://` in production. Authenticate before joining private channels. See `docs/security.md`.
