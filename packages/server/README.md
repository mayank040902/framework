# @bootstrap-framework/server

Fastify bootstrap with optional plugins for logging, database, Kafka, Redis, realtime, and errors.

Monorepo: https://github.com/mayank040902/framework

Sibling packages are optional peers. Install only the ones you enable.

## Install

```bash
npm install @bootstrap-framework/server
```

Requires **Node.js 20+**.

Optional plugins:

```bash
npm install @bootstrap-framework/logger
npm install @bootstrap-framework/database
npm install @bootstrap-framework/kafka
npm install @bootstrap-framework/redis
npm install @bootstrap-framework/realtime
npm install @bootstrap-framework/errors
```

## Quick start

```javascript
import { startServer } from "@bootstrap-framework/server";

const { address, close } = await startServer(8080, {
  serviceName: "api",
  logger: true,
});

console.log(`listening at ${address}`);

process.once("SIGINT", () => {
  void close();
});
```

Create without listening:

```javascript
import { createServer } from "@bootstrap-framework/server";

const app = await createServer({
  serviceName: "api",
  logger: true,
  database: false,
  kafka: false,
  realtime: false,
});
```

## Options

| Option | Description |
| :--- | :--- |
| `serviceName` | Service name used in health and logs |
| `host` / `port` | Listen address |
| `logger` | Fastify logger or `@bootstrap-framework/logger` plugin |
| `database` | Optional PostgreSQL plugin |
| `kafka` | Optional Kafka plugin |
| `realtime` | Optional WebSocket plugin |
| `cors` / `helmet` / `cookie` / `compress` / `rateLimit` | Fastify plugins |
| `hooks` | Lifecycle hooks |
| `configure` | Extra Fastify setup |
| `health` | Health routes, or `false` to disable |
| `gracefulShutdown` | Close on `SIGINT` / `SIGTERM` |

Missing sibling packages are skipped with a warning. The server still starts.

## License

MIT. Copyright (c) 2026 mayank.
