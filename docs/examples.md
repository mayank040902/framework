# Examples

## Combined application

`examples/combined` is the integration sample for every package. See `examples/combined/README.md`.

```bash
pnpm install
pnpm build
pnpm --filter @bootstrap-framework/combined-example start
```

## Per-package examples

| Package | Path |
| :--- | :--- |
| server | `packages/server/examples/ts/` (`basic`, `plugins`, `hooks`, `custom`, `auth`) |
| logger | `packages/logger/examples/ts/` |
| auth | `packages/auth/examples/` (`standalone`, `express`, `fastify`, `uwebsockets`, `oauth-social`) |
| database | `packages/database/examples/` (`basic`, `models`, `transactions`, `migrations`, `streaming`) |
| redis | `packages/redis/examples/` (`standalone`, `cache`, `session`, `pubsub`, `queue-worker`) |
| kafka | `packages/kafka/examples/` (`standalone`, `producer`, `consumer`, `framework`, `codec-adapter`) |
| realtime | `packages/realtime/examples/` (`fastify-websocket`, `native-ws`, `e2ee`, `kafka-bridge`, `secure-chat-server`) |

Run from the package directory after `npm run build`, for example:

```bash
pnpm --filter @bootstrap-framework/server example:basic
pnpm --filter @bootstrap-framework/kafka example:standalone
pnpm --filter @bootstrap-framework/realtime example:fastify
```
