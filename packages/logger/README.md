# @bootstrap-framework/logger

Structured logging built on [Pino](https://getpino.io). Fastify-friendly HTTP logging, serializers, and optional pretty transport.

Monorepo: https://github.com/mayank040902/framework

## Install

```bash
npm install @bootstrap-framework/logger
```

Requires **Node.js 20+**.

`pino-pretty` is an optional peer. Install it for development pretty-print:

```bash
npm install pino-pretty
```

## Quick start

```javascript
import { createLogger } from "@bootstrap-framework/logger";

const logger = createLogger({ mode: "development" });

logger.info("service started");
logger.warn({ userId: "42" }, "slow query");
logger.error(new Error("boom"), "request failed");

const child = logger.child({ requestId: "abc-123" });
child.info("handling request");
```

## HTTP logger

```javascript
import { createHttpLogger } from "@bootstrap-framework/logger";

const httpLogger = createHttpLogger({
    loggerOptions: { mode: "production" },
});
```

## API

| Export | Description |
| :--- | :--- |
| `createLogger(options?)` | Pino logger with env-aware defaults |
| `createChildLogger(logger, bindings)` | Child logger |
| `createHttpLogger(options?)` | `pino-http` middleware |
| `defineConfig(options?)` | Pino options for development, production, and test |
| `createSerializers(options?)` | Request, response, and error serializers |
| `createTransport(options?)` | Pretty, file, or stream transport |

`createLogger` modes:

| Mode | Level | Notes |
| :--- | :--- | :--- |
| `development` | `trace` | Verbose local logging |
| `production` | `info` | Redacts tokens, passwords, and secrets |
| `test` | `silent` | Quiet unit tests |

## License

MIT. Copyright (c) 2026 mayank.
