# @oneunit/logger

Structured logging built on [Pino](https://getpino.io). Fastify-friendly HTTP logging, serializers, and optional pretty transport.

Monorepo: https://github.com/mayank040902/oneunit

## Install

```bash
npm install @oneunit/logger
```

Requires **Node.js 20+**.

`pino-pretty` is an optional peer. Install it for development pretty-print:

```bash
npm install pino-pretty
```

## Quick start

```javascript
import { createLogger } from "@oneunit/logger";

const logger = createLogger({ mode: "development" });

logger.info("service started");
logger.warn({ userId: "42" }, "slow query");
logger.error(new Error("boom"), "request failed");

const child = logger.child({ requestId: "abc-123" });
child.info("handling request");
```

## HTTP logger

```javascript
import { createHttpLogger } from "@oneunit/logger";

const httpLogger = createHttpLogger({
    loggerOptions: { mode: "production" },
});
```

### Fastify

Pass the logger through `loggerInstance`, **not** `logger`. Handing Fastify the
`pino-http` middleware as `logger` makes Fastify construct its own logger, which
bypasses this package's serializers and redaction:

```javascript
import Fastify from "fastify";
import { createLogger } from "@oneunit/logger";

const fastify = Fastify({
    loggerInstance: createLogger({ mode: "production" }),
});
```

## API

| Export | Description |
| :--- | :--- |
| `createLogger(options?)` | Pino logger with env-aware defaults |
| `createChildLogger(logger, bindings?)` | Child logger |
| `createHttpLogger(options?)` | `pino-http` middleware |
| `defineConfig(options?)` | Pino options for development, production, and test |
| `createSerializers(options?)` | Request, response, and error serializers |
| `createTransport(options?)` | Pretty, file, or stream transport |
| `createMultiTransport(transports)` | Multiple destinations with per-target levels |
| `redactLogObject(object)` | Mask sensitive keys anywhere in a payload |

`createLogger` modes:

| Mode | Level | Notes |
| :--- | :--- | :--- |
| `development` | `trace` | Verbose local logging |
| `production` | `info` | Default mode |
| `test` | `silent` | Quiet unit tests |

`createLogger` options:

| Option | Description |
| :--- | :--- |
| `mode` | One of the modes above; defaults to `production` |
| `serializers` | Passed to `createSerializers` (`excludeQueryString`, `excludeHeaders`, `excludeQuery`) |
| `childBindings` | Bindings attached to the returned logger, redacted before use |
| `destination` | Writable stream (or a `pino.transport()` worker) to write to; defaults to stdout |
| `pino` | Escape hatch for remaining pino options |

`destination` is a first-class option because pino only accepts a destination as
a *separate* argument. Passing `{ destination: stream }` inside a pino options
object is silently ignored by pino, which is a common way to lose log output in
tests.

```ts
import { Writable } from "node:stream";
import { createLogger } from "@oneunit/logger";

const lines: string[] = [];
const stream = new Writable({
    write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
    },
});

const logger = createLogger({ mode: "production", destination: stream });
```

### Redaction

Sensitive keys (`password`, `token`, `authorization`, `cookie`, `apiKey`,
`clientSecret`, `privateKey`, …) are masked in **every** mode, at any nesting
depth and regardless of casing, so secrets cannot reach a log sink from a local
development run. This includes child logger bindings
(`logger.child({ apiKey })`).

Redaction never degrades an error's diagnostic value. An `Error` carrying a
sensitive property keeps its `type`, `message`, and `stack`: the original is
copied with its prototype and non-enumerable properties intact, so pino's error
serializer still recognizes it and the log line still carries the trace.

Errors are also left completely untouched when they have nothing to mask.

Query strings are stripped from logged URLs by default. This applies both to
the `req.url` produced by `createSerializers` / `createHttpLogger` **and** to a
URL logged directly by application code:

```javascript
logger.info({ url: request.url }, "handling request");
// -> { "url": "/pay" }   even when request.url is "/pay?token=secret"
```

The same stripping applies to `originalUrl`, `requestUrl`, `href`, `referer`,
and `referrer`, at any depth and inside arrays. Without it the "query strings
are stripped" guarantee would hold only for the `req` key while the very common
`logger.info({ url: request.url })` shape leaked the token in plaintext.

The parsed `query` object is still emitted where a framework provides one, with
sensitive keys masked. Pass `excludeQueryString: false` to keep the raw query
string in `req.url` — only do that when you are certain no sensitive parameter
is ever present, because a raw query string is not masked per-key.

`createSerializers` and `createHttpLogger` also accept `excludeHeaders` and
`excludeQuery` to omit those fields entirely.

### Redaction scope: plain data only

Package-level redaction walks **plain objects and arrays**, at any depth. It
does **not** walk class instances, model objects, streams, or any other
non-plain runtime object bound as a value. Those are passed through by
reference and left to pino's own serialization:

```ts
class UserModel {
    password = "secret";
}

logger.child({ user: new UserModel() }).info("hi");
// -> user.password is NOT masked
```

This is a deliberate trade. Deep-walking a binding costs a full object-graph
traversal on **every** log call, and bindings routinely hold live objects such
as an `IncomingMessage` whose graph runs
`socket -> connection -> parser -> ...`. Measured cost for that path fell from
~26.8 us/call to ~0.7 us/call by not traversing.

Structured `req`/`res` bindings are still covered: their sensitive fields are
handled by pino's native `redact` paths, which apply to bindings as well.

If you need a specific value masked, bind it as a plain object
(`logger.child({ user: { password: user.password } })`) or redact it at the
call site. The test suite asserts this behavior deliberately, so a change that
starts traversing instances has to revisit the performance cost.

## Development

```bash
pnpm install
pnpm --filter @oneunit/logger verify     # build + typecheck + examples + test + pack
```

`verify` is the exact check set `prepublishOnly` runs. Individually:

```bash
pnpm --filter @oneunit/logger test              # 248 tests
pnpm --filter @oneunit/logger typecheck         # source and tests
pnpm --filter @oneunit/logger typecheck:examples
pnpm --filter @oneunit/logger build
```

`typecheck:examples` is separate from `typecheck` because the examples import
from `dist`, so it needs a build first.

Targeted suites:

| Script | Covers |
| :-- | :-- |
| `test:security` | Redaction by key position and casing, errors, child bindings, hostile payloads, mutation, security invariants |
| `test:integration` | Real Fastify server and real `pino-http` request, including the documented anti-pattern |
| `test:serializers` | Request/response shape, header and query casing, malformed input |
| `test:perf` | Cost-shape regressions, including a guard against object-graph traversal |
| `test:api` | Public export surface |

## Examples

`npm run build` first — the examples import the built `dist`.

| Script | File | Shows |
| :-- | :-- | :-- |
| `npm run example` | `examples/ts/logger-example.ts` | Modes, redaction at depth, child loggers, errors, the pino escape hatch, `redactLogObject` |
| `npm run example:http` | `examples/ts/http-example.ts` | A real `pino-http` request with secrets in the query string, `authorization`, `cookie`, and `x-api-key` |
| `npm run example:fastify` | `examples/ts/fastify-example.ts` | The correct `loggerInstance` integration; run it and try `curl "http://127.0.0.1:3000/hello?token=secret"` |

Examples are typechecked by `npm run typecheck:examples` so they cannot drift
from the API unnoticed.

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — the pino pipeline, why redaction runs
  before serialization, and the plain-vs-runtime object boundary.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — security disclosure, required checks,
  and the behaviors that look like bugs but are deliberate.
- [CHANGELOG.md](./CHANGELOG.md) — release history.

## Releasing

Publishing is driven by a git tag, never by a push to `main`:

```bash
git tag logger-v1.0.0
git push origin logger-v1.0.0
```

`.github/workflows/logger.yml` runs the full check set on Node 20, 22, and 24,
then installs the real tarball into a clean project and exercises the public API
against it — including that no secret reaches the sink, that errors keep their
`message` and `stack`, and that every subpath export resolves. Only then does
the publish job upload, after checking the tag matches `package.json`. npm
refuses to reuse a version number, so that check turns a typo into a clear
failure instead of a release that cannot be retried.

The workflow uses npm Trusted Publishing (OIDC), so no long-lived npm token is
stored in the repository. Add the trusted publisher on npmjs.com under package
settings, pointing at repository `mayank040902/oneunit` and workflow
`logger.yml`.

## Renamed

This package was previously published as `@bootstrap-framework/logger`. It is
now **`@oneunit/logger`**; the old name is not published and will not resolve.
Update your dependency and import to `@oneunit/logger`.

## License

MIT. Copyright (c) 2026 mayank.
