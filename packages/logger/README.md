# @oneunit/logger

High-performance, secure-by-default structured logging built on [Pino](https://getpino.io). Includes Fastify and HTTP integration, automatic deep redaction, URL sanitization, serializer utilities, and transport builders.

Monorepo: https://github.com/mayank040902/oneunit

---

## Features

- **Pino Powered**: Returns standard `pino.Logger` instances with full access to Pino's native API, speed, and ecosystem.
- **Deep Redaction**: Masks sensitive keys (`password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `sessionid`, etc.) across plain objects and arrays at arbitrary nesting depths and with any casing.
- **Active in Every Mode**: Redaction runs in `production`, `development`, and `test` alike so secrets never leak to local dev terminals or test outputs.
- **URL Sanitization**: Automatically strips query strings from URLs (`url`, `originalUrl`, `href`, `referer`, etc.) across application logs, serializers, and HTTP middleware.
- **Safe Child Loggers**: Child bindings are redacted before Pino pre-serializes them, preventing credential leaks in `logger.child({ apiKey })`.
- **Diagnostic Integrity**: Non-enumerable properties (`message`) and accessors (`stack`) are preserved so `Error` instances keep their stack trace and `instanceof Error` identity.
- **Copy-on-Write**: Zero unnecessary allocations on clean log calls; caller payloads are never mutated.
- **Fastify & HTTP Ready**: Built-in request, response, and error serializers with correlation ID tracking and `pino-http` middleware support.
- **Transport Builders**: First-class support for `pretty`, `file`, and `stream` transports with multi-destination dispatch and per-target log levels.
- **Subpath Exports**: Import modular components directly via clean subpaths.

---

## Install

```bash
npm install @oneunit/logger
```

Requires **Node.js 20+**.

### Optional Pretty Printing

`pino-pretty` is an optional peer dependency. Install it for colored, formatted output in development:

```bash
npm install -D pino-pretty
```

---

## Quick Start

```typescript
import { createLogger } from "@oneunit/logger";

const logger = createLogger({ mode: "development" });

logger.info("Service initialized");
logger.warn({ latencyMs: 340 }, "Database query took longer than threshold");
logger.error(new Error("Connection reset"), "Upstream service failure");

// Child loggers inherit parent configuration and redact bindings automatically
const child = logger.child({ requestId: "req-123", apiKey: "secret_live_key" });
child.info("Handling request");
// -> { "requestId": "req-123", "apiKey": "[REDACTED]", "msg": "Handling request" }
```

---

## Subpath Exports

In addition to importing from the root package `@oneunit/logger`, modular entry points are exposed:

| Subpath | Exports |
| :--- | :--- |
| `@oneunit/logger` | Full public API surface and Pino types |
| `@oneunit/logger/logger` | `createLogger`, `createChildLogger`, `LoggerOptions` |
| `@oneunit/logger/config` | `defineConfig`, `redactLogObject`, `redactBindings` |
| `@oneunit/logger/http` | `createHttpLogger`, `HttpLoggerOptions` |
| `@oneunit/logger/serialize` | `createSerializers`, `SerializerOptions`, `CustomRequest`, `CustomResponse` |
| `@oneunit/logger/transport` | `createTransport`, `createMultiTransport`, `TransportOptions` |

---

## HTTP Logging

### Fastify

Pass the logger via `loggerInstance`, **not** `logger`. Handing Fastify a logger configuration or middleware under the `logger` key causes Fastify 5 to instantiate its own Pino instance, which silently bypasses this package's serializers, redaction, and level formatting:

```typescript
import Fastify from "fastify";
import { createLogger } from "@oneunit/logger";

const fastify = Fastify({
    loggerInstance: createLogger({ mode: "production" }),
});

fastify.get("/users", async (request) => {
    // request.url query strings are automatically stripped in logs
    request.log.info({ query: request.query }, "Fetched users");
    return { status: "ok" };
});
```

### Standard HTTP & Express Middleware

`createHttpLogger` wraps `pino-http` with security-hardened serializers:

```typescript
import http from "node:http";
import { createLogger, createHttpLogger } from "@oneunit/logger";

const logger = createLogger({ mode: "production" });
const httpLogger = createHttpLogger({
    logger,
    serializers: {
        excludeQueryString: true, // default
    },
});

const server = http.createServer((req, res) => {
    httpLogger(req, res);
    res.end("OK");
});
```

---

## Transports & Multi-Destination

Use `createTransport` and `createMultiTransport` to create Pino transport configurations for terminal pretty-printing, file logging, or writable streams:

### Pretty Transport

```typescript
import pino from "pino";
import { createLogger, createTransport } from "@oneunit/logger";

const transport = pino.transport(createTransport({
    target: "pretty",
    level: "debug",
}));

const logger = createLogger({ destination: transport });
```

### Multi-Destination Logging

Route logs to multiple targets with independent log levels:

```typescript
import pino from "pino";
import { createLogger, createMultiTransport } from "@oneunit/logger";

const multi = pino.transport(createMultiTransport([
    { target: "pretty", level: "info" },
    { target: "file", destination: "/var/log/app/debug.log", level: "debug" },
]));

const logger = createLogger({ destination: multi });
```

Supported transport targets:
- `"pretty"`: Uses `pino-pretty` with default colorization and timestamp formatting. Destination can be stdout, a file path, or a writable stream.
- `"file"`: Writes logs to a file path via `pino/file`. Requires string `destination`.
- `"stream"`: Writes logs directly to a `NodeJS.WritableStream`. Requires `destination`.

---

## API Reference

### Exported Functions

| Function | Description |
| :--- | :--- |
| `createLogger(options?)` | Creates a Pino logger with env-aware defaults, redaction, and child wrapping |
| `createChildLogger(logger, bindings?)` | Safely creates a child logger (no-op when bindings are empty) |
| `createHttpLogger(options?)` | `pino-http` middleware with pre-configured serializers |
| `defineConfig(options?)` | Generates Pino configuration options for development, production, and test |
| `createSerializers(options?)` | Builds request, response, and error serializers with sanitization |
| `createTransport(options?)` | Builds a Pino transport target definition (`pretty`, `file`, or `stream`) |
| `createMultiTransport(transports)` | Builds a multi-target Pino transport definition with per-target levels |
| `redactLogObject(object)` | Pure utility to mask sensitive keys in an object without mutation |
| `redactBindings(bindings)` | Masks sensitive keys in logger child bindings |

### Exported Types

| Type | Description |
| :--- | :--- |
| `Logger` | Alias for `pino.Logger` |
| `Level` | Alias for `pino.Level` (`"fatal"` \| `"error"` \| `"warn"` \| `"info"` \| `"debug"` \| `"trace"`) |
| `LevelWithSilent` | Alias for `pino.LevelWithSilent` |
| `DestinationStream` | Alias for `pino.DestinationStream` |
| `LoggerOptions` | Configuration options for `createLogger` |
| `HttpLoggerOptions` | Configuration options for `createHttpLogger` |
| `SerializerOptions` | Options controlling headers, query, and query string emission |
| `TransportOptions` | Target, destination, level, and options for `createTransport` |
| `CustomRequest` | Request interface accepted by `createSerializers().req` |
| `CustomResponse` | Response interface accepted by `createSerializers().res` |

---

## Configuration Options

### `createLogger(options)`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mode` | `"development"` \| `"production"` \| `"test"` | `"production"` | Controls default log level and environment settings |
| `destination` | `NodeJS.WritableStream` | `process.stdout` | Destination stream or `pino.transport()` worker |
| `childBindings` | `Record<string, unknown>` | `undefined` | Initial bindings attached to the logger (automatically redacted) |
| `serializers` | `SerializerOptions` | `undefined` | Custom serializer options passed to `createSerializers` |
| `pino` | `pino.LoggerOptions` | `undefined` | Escape hatch for remaining Pino options (excluding formatters/serializers) |

Modes:

| Mode | Level | Notes |
| :--- | :--- | :--- |
| `production` | `info` | Default mode; structured JSON output with ISO timestamps and PID/hostname |
| `development` | `trace` | Verbose local output capturing all log levels |
| `test` | `silent` | Silences output to keep test test runner reports clean |

> **Note on `destination`:** `destination` is a top-level option on `createLogger` because Pino only accepts destinations as a separate argument. Passing `{ destination }` inside a nested Pino options object is silently ignored by Pino, which can result in lost output.

### `createSerializers(options)`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `excludeQueryString` | `boolean` | `true` | When `true`, strips query parameters from `req.url` and omits `req.queryString` |
| `excludeHeaders` | `boolean` | `false` | When `true`, omits headers from serialized `req` and `res` objects |
| `excludeQuery` | `boolean` | `false` | When `true`, omits the parsed `req.query` object |

Serialized fields:
- `req`: `id`, `method`, `url`, `host`, `hostname`, `correlationId` (from `x-correlation-id`), `remoteAddress`, `remotePort`, `protocol`, `headers`, `query`, `queryString`.
- `res`: `statusCode` (omitted if uncommitted/null to prevent noise), `headers`.
- `err`: Serialized via standard `pino-std-serializers`.

---

## Security & Redaction

### Redaction Pipeline

Redaction is layered deliberately across the logging pipeline:

```text
caller calls logger.info(payload)
        │
        ▼
formatters.log  ──►  redactLogObject (our recursive walker)      [Runs FIRST]
        │
        ▼
pino serializers ──► createSerializers (req / res / err)         [Runs SECOND]
        │
        ▼
redact.paths    ──►  fast-redact stringifiers                   [Runs LAST]
        │
        ▼
JSON.stringify  ──►  destination stream
```

1. **`redactLogObject` runs before serializers**: Framework-parsed queries (e.g. Fastify's `request.query`) have sensitive properties masked before `createSerializers` copies them.
2. **Errors are preserved**: The walker preserves prototypes, non-enumerable properties (`message`), and accessors (`stack`) so that errors pass Pino's internal `instanceof Error` checks without loss of diagnostic context.
3. **`redact.paths` covers post-serialization headers**: Fields that only exist after serialization (such as `res.headers`) are masked by fast-redact paths.

### Masked Keys

The following keys are matched **case-insensitively** at any nesting depth and replaced with `"[REDACTED]"`:

- **Passwords**: `password`, `passwordhash`, `password_hash`, `passwd`, `pwd`
- **Tokens**: `token`, `accesstoken`, `refreshtoken`, `idtoken`
- **Secrets**: `secret`, `clientsecret`, `client_secret`
- **Keys**: `privatekey`, `private_key`, `apikey`, `api_key`
- **Auth & Session**: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `sessionid`
- **Headers**: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`

### URL Query Stripping

Query strings are stripped from any field whose name indicates a URL (`url`, `originalUrl`, `requestUrl`, `href`, `referer`, `referrer`), regardless of depth or casing:

```typescript
logger.info({ url: "https://api.example.com/checkout?token=secret123" });
// Emitted: { "url": "https://api.example.com/checkout" }
```

### Scope: Plain Data vs. Class Instances

The recursive walker inspects **plain objects and arrays** (up to a recursion limit of 100).

It deliberately **does not** walk complex runtime class instances, models, sockets, or streams (e.g. `IncomingMessage`). Non-plain objects are passed through by reference to avoid expensive object-graph traversals on hot paths (reducing overhead from ~26.8µs to ~0.7µs per call). To mask properties on class instances, bind them as plain objects or redact at call site.

---

## Development

```bash
# Install dependencies
npm install

# Run complete verification (build, typecheck, examples, test, pack check)
npm run verify
```

### Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm run dev` | Watches and compiles TypeScript |
| `npm run typecheck` | Checks source code and tests (`tsconfig.json` & `tsconfig.test.json`) |
| `npm run typecheck:examples` | Checks examples against compiled types in `dist/` |
| `npm test` | Runs the complete Vitest test suite |
| `npm run test:watch` | Runs tests in watch mode |
| `npm run test:security` | Runs security regression suite (redaction, casing, error handling, invariants) |
| `npm run test:integration` | Runs Fastify and `pino-http` real server tests |
| `npm run test:serializers` | Runs serializer tests |
| `npm run test:api` | Verifies the public API surface |
| `npm run test:perf` | Runs cost-shape and traversal regression tests |
| `npm run pack:check` | Verifies the published npm package contents via dry run |
| `npm run verify` | Full CI verification suite |

### Monorepo Workspaces

If invoking from the monorepo root:

```bash
pnpm --filter @oneunit/logger verify
pnpm --filter @oneunit/logger test
```

---

## Runnable Examples

Run examples directly after compiling:

```bash
npm run build
npm run example            # Core walkthrough: modes, redaction, child loggers, errors
npm run example:http       # Real HTTP request with sanitized queries and headers
npm run example:fastify    # Fastify server with loggerInstance integration
```

---

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Pino pipeline mechanics, redaction ordering, and performance tradeoffs.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Security policies, testing requirements, and contributing guidelines.
- [CHANGELOG.md](./CHANGELOG.md) — Release notes and version history.

---

## Publishing

Publishing is driven by git tags and automated via GitHub Actions with npm OIDC Trusted Publishing:

```bash
git tag logger-v1.0.0
git push origin logger-v1.0.0
```

The workflow runs the full check matrix on Node 20, 22, and 24, verifies clean tarball installation, validates subpath imports, and ensures version parity before publishing.

---

## License

MIT © 2026 mayank
