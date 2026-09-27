# Bootstrap Framework documentation

Repository: https://github.com/mayank040902/framework

Production-ready Node.js packages for Fastify services. Each package under `packages/` is independently published as `@bootstrap-framework/*` and can be used alone or together.

## Guides

| Guide | Description |
| :--- | :--- |
| `docs/getting-started.md` | Install, requirements, first server |
| `docs/architecture.md` | Package layout, plugin graph, request lifecycle |
| `docs/security.md` | Auth, TLS, redaction, headers, secrets |
| `docs/combining-packages.md` | How all eight packages work together |
| `docs/environment.md` | Environment variables for every package |
| `docs/examples.md` | Package examples and the combined app |

## Packages

| Package | Guide | Role |
| :--- | :--- | :--- |
| `@bootstrap-framework/server` | `docs/packages/server.md` | Fastify bootstrap, plugins, health, hooks |
| `@bootstrap-framework/logger` | `docs/packages/logger.md` | Structured Pino logging |
| `@bootstrap-framework/errors` | `docs/packages/errors.md` | Typed errors and Fastify error handling |
| `@bootstrap-framework/auth` | `docs/packages/auth.md` | JWT, RBAC, passwords, OAuth |
| `@bootstrap-framework/database` | `docs/packages/database.md` | PostgreSQL client, models, migrations |
| `@bootstrap-framework/redis` | `docs/packages/redis.md` | ioredis client and BullMQ queues |
| `@bootstrap-framework/kafka` | `docs/packages/kafka.md` | KafkaJS producer, consumer, admin |
| `@bootstrap-framework/realtime` | `docs/packages/realtime.md` | WebSocket hub, Kafka bridge, E2EE |

Package READMEs under `packages/*/README.md` are the source of truth for APIs.

## Combined example

`examples/combined` starts one Fastify service that enables every package:

- HTTP API with Helmet, CORS, cookies, compression, rate limits
- JWT login, refresh, RBAC-protected routes
- PostgreSQL users table via models
- Redis session cache and BullMQ email queue
- Kafka produce/consume for domain events
- WebSocket channel broadcasts, optionally bridged from Kafka
- Typed errors and structured logs

See `examples/combined/README.md`.

## Requirements

- Node.js 20+
- pnpm 11.9.0 for workspace development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```
