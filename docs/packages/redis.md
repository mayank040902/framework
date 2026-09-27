# @bootstrap-framework/redis

Redis client and BullMQ job queues. Works standalone or with any logger that has `error`, `warn`, `info`, and `debug`.

Package README: `packages/redis/README.md`

## Install

```bash
npm install @bootstrap-framework/redis
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

`createClient` defaults: `url` from `REDIS_URL`, `lazyConnect: true`.

Queue defaults: prefix `queue`, 3 attempts, exponential backoff 1000ms, keep last 100 completed and 1000 failed jobs.

For BullMQ workers, set `maxRetriesPerRequest: null` on the Redis connection.
