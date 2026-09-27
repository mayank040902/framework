# Bootstrap Framework

Production-ready Node.js packages for Fastify services. Each package under `packages/` is independently published on npm as `@bootstrap-framework/*` and can be installed on its own.

Author: mayank. Repository: https://github.com/mayank040902/framework

## Packages

| Package | Description |
| :--- | :--- |
| `@bootstrap-framework/server` | Fastify bootstrap, plugins, health, and hooks |
| `@bootstrap-framework/logger` | Structured Pino logging |
| `@bootstrap-framework/database` | PostgreSQL client, models, and migrations |
| `@bootstrap-framework/kafka` | KafkaJS client with logger, config, and codec adapters |
| `@bootstrap-framework/redis` | ioredis client and BullMQ queues |
| `@bootstrap-framework/realtime` | WebSocket hub, Fastify plugin, and Kafka bridge |
| `@bootstrap-framework/errors` | Typed errors and Fastify error handling |
| `@bootstrap-framework/auth` | JWT, RBAC, passwords, and OAuth |

Install only the packages you need:

```bash
npm install @bootstrap-framework/server
npm install @bootstrap-framework/logger
```

Sibling packages are optional peers. Install them when you enable the matching plugin.

## Documentation

| Guide | Description |
| :--- | :--- |
| `docs/README.md` | Documentation index |
| `docs/getting-started.md` | Install and first server |
| `docs/architecture.md` | Package graph and request lifecycle |
| `docs/security.md` | Auth, TLS, redaction, headers, secrets |
| `docs/combining-packages.md` | Using all eight packages together |
| `docs/environment.md` | Environment variables |
| `docs/examples.md` | Example index |

Package API notes: `docs/packages/`.

## Combined example

`examples/combined` starts one service with HTTP, JWT/RBAC, Postgres, Redis/BullMQ, Kafka, and WebSockets.

```bash
pnpm install
pnpm build
pnpm --filter @bootstrap-framework/combined-example start
```

Details: `examples/combined/README.md`.

## Requirements

- Node.js 20+
- pnpm 11.9.0 for workspace development

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Build or test a single package:

```bash
pnpm --filter @bootstrap-framework/kafka build
pnpm --filter @bootstrap-framework/kafka test
```

Each package can also be developed on its own:

```bash
cd packages/kafka
npm install
npm test
npm run build
```

## Independent publish

Each package under `packages/` is a standalone npm package. It has its own `package.json`, `LICENSE`, `README.md`, and `CHANGELOG.md`, and does not use `workspace:` protocol in published dependencies.

Publish one package:

```bash
cd packages/kafka
npm run pack:check
npm publish --access public
```

Publish every package from the workspace root:

```bash
pnpm -r --filter "./packages/*" publish --access public
```

Update `CHANGELOG.md` and bump `version` in that package before publishing.

## License

MIT. Copyright (c) 2026 mayank.
