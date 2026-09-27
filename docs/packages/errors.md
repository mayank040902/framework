# @bootstrap-framework/errors

Typed error classes, Result helpers, and optional Fastify error handling.

Package README: `packages/errors/README.md`

## Install

```bash
npm install @bootstrap-framework/errors
```

## Error classes

All classes extend `AppError` with `code`, `statusCode`, optional `details`, and optional `cause`.

| Class | Status | Code |
| :--- | :--- | :--- |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `BadRequestError` | 400 | `BAD_REQUEST` |
| `AuthenticationError` | 401 | `AUTHENTICATION_ERROR` |
| `AuthorizationError` | 403 | `AUTHORIZATION_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` |
| `InternalError` | 500 | `INTERNAL_ERROR` |
| `DatabaseError` | 500 | `DATABASE_ERROR` |
| `KafkaError` | 500 | `KAFKA_ERROR` |
| `RedisError` | 500 | `REDIS_ERROR` |
| `WebSocketError` | 500 | `WEBSOCKET_ERROR` |
| `ConnectionError` | 503 | `CONNECTION_ERROR` |
| `TimeoutError` | 504 | `TIMEOUT` |

## Result helpers

`tryCatch`, `tryCatchAsync`, `ok`, `err`, `unwrap`, `isAppError`, `formatError`.

## Fastify

```javascript
import { registerErrorHandler } from "@bootstrap-framework/errors";

await registerErrorHandler(app, { logErrors: true, includeStack: false });
```

The server package registers this automatically when `@bootstrap-framework/errors` is installed.
