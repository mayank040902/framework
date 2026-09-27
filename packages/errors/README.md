# @bootstrap-framework/errors

Typed error classes, Result helpers, and optional Fastify error handling.

Monorepo: https://github.com/mayank040902/framework

## Install

```bash
npm install @bootstrap-framework/errors
```

Requires **Node.js 20+**. Fastify is an optional peer.

## Quick start

```javascript
import { AppError, NotFoundError, tryCatchAsync } from "@bootstrap-framework/errors";

throw new NotFoundError("User", "42");

const { data, error } = await tryCatchAsync(loadUser("42"));
if (error) {
    throw error;
}
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
| `PayloadTooLargeError` | 413 | `PAYLOAD_TOO_LARGE` |
| `UnsupportedMediaTypeError` | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| `UnprocessableError` | 422 | `UNPROCESSABLE_ENTITY` |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` |
| `InternalError` | 500 | `INTERNAL_ERROR` |
| `ConfigurationError` | 500 | `CONFIGURATION_ERROR` |
| `DatabaseError` | 500 | `DATABASE_ERROR` |
| `KafkaError` | 500 | `KAFKA_ERROR` |
| `RedisError` | 500 | `REDIS_ERROR` |
| `WebSocketError` | 500 | `WEBSOCKET_ERROR` |
| `EncryptionError` | 500 | `ENCRYPTION_ERROR` |
| `SerializationError` | 400 | `SERIALIZATION_ERROR` |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` |
| `ConnectionError` | 503 | `CONNECTION_ERROR` |
| `TimeoutError` | 504 | `TIMEOUT` |
| `ExternalServiceError` | 502 | `EXTERNAL_SERVICE_ERROR` |

```javascript
import { AppError, NotFoundError, ConflictError } from "@bootstrap-framework/errors";

throw new NotFoundError("User", "42");
throw new ConflictError("Email already exists", { field: "email" });
throw new AppError("Something went wrong", "CUSTOM_ERROR", 500, { service: "kafka" });
```

## Result helpers

```javascript
import { tryCatch, tryCatchAsync, ok, err, unwrap } from "@bootstrap-framework/errors";

const { data, error } = tryCatch(() => JSON.parse(raw));
const result = await tryCatchAsync(fetchUser(id));
```

## Fastify

```javascript
import Fastify from "fastify";
import { registerErrorHandler } from "@bootstrap-framework/errors";

const app = Fastify();
await registerErrorHandler(app, {
    logErrors: true,
    includeStack: false,
});
```

| Export | Description |
| :--- | :--- |
| `createErrorHandler(options?)` | Fastify error handler |
| `registerErrorHandler(app, options?)` | Registers the handler |
| `formatError(error)` | Canonical JSON payload |
| `isAppError(error)` | Type guard |
| `ERROR_CODES` | Stable machine-readable codes |

## License

MIT. Copyright (c) 2026 mayank.
