# @bootstrap-framework/redis

Redis client and BullMQ job queues. Works standalone or with any logger that has `error`, `warn`, `info`, and `debug`.

Monorepo: https://github.com/mayank040902/framework

## Install

```bash
npm install @bootstrap-framework/redis
```

Requires **Node.js 20+**.

## Quick start

```javascript
import { createClient, createQueue, createWorker, shutdown } from "@bootstrap-framework/redis";

const redis = createClient({ url: process.env.REDIS_URL });

await redis.set("session:123", JSON.stringify({ userId: 42 }), "EX", 3600);
const session = await redis.get("session:123");

const emailQueue = createQueue({
    name: "email",
    connection: redis,
});

await emailQueue.add("welcome", {
    to: "user@example.com",
    template: "welcome",
});

createWorker({
    name: "email",
    connection: redis,
    processor: async (job) => {
        console.log(`Sending ${job.data.template} email`);
    },
});

process.on("SIGTERM", () => shutdown(redis));
```

Logger is optional:

```javascript
import { createClient, consoleLogger, silentLogger } from "@bootstrap-framework/redis";

createClient({}, consoleLogger);
createClient({}, silentLogger);
```

## API

| Export | Description |
| :--- | :--- |
| `createClient(options?, logger?)` | ioredis client with event logging |
| `shutdown(client, logger?)` | Graceful `quit()` |
| `health(client)` | Ping-based health result |
| `createQueue(config)` | BullMQ queue |
| `createWorker(config)` | BullMQ worker |
| `consoleLogger` / `silentLogger` | Built-in logger adapters |

### `createClient` defaults

| Option | Value |
| :--- | :--- |
| `url` | `process.env.REDIS_URL` |
| `lazyConnect` | `true` |

### `createQueue` defaults

| Option | Value |
| :--- | :--- |
| `prefix` | `"queue"` |
| `attempts` | `3` |
| `backoff` | Exponential, 1000ms |
| `removeOnComplete` | Keep last 100 |
| `removeOnFail` | Keep last 1000 |

## Environment variables

| Variable | Description |
| :--- | :--- |
| `REDIS_URL` | Redis connection URL |

## License

MIT. Copyright (c) 2026 mayank.
