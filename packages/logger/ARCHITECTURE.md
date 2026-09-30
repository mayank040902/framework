# Architecture

`@oneunit/logger` is a thin, opinionated layer over Pino. It does not replace
Pino: every returned value is a real `pino.Logger` with the full Pino surface,
and `pino` stays a peer-visible dependency rather than being hidden. What the
package adds is a secure-by-default configuration, HTTP serializers that do not
leak, and a redaction pass that works on ordinary data.

Three runtime dependencies: `pino`, `pino-http`, and `pino-std-serializers`.
`pino-pretty` is an optional peer, loaded only by the pretty transport.

## Module layout

```text
src/
  index.ts       Public surface. Re-exports every module plus pino type aliases.
  logger.ts      createLogger / createChildLogger and the safe-child wrapper.
  config.ts      defineConfig, the redaction walker, and the sensitive-key policy.
  serialize.ts   createSerializers: request, response, and error serializers.
  http.ts        createHttpLogger: pino-http middleware wired to our serializers.
  transport.ts   createTransport / createMultiTransport target builders.
```

`config.ts` is the largest module and deliberately so: redaction is the security
core, and keeping the key policy, the walker, and the pino path list in one file
means a change to one is visible while reading the others.

## The pino pipeline, and where each protection sits

This ordering is the single most important thing to understand about the
package, and getting it backwards has caused real bugs.

```text
caller calls logger.info(payload)
        |
        v
pino merges base, level, timestamp
        |
        v
formatters.log  ->  redactLogObject  (our walker)      <-- runs FIRST
        |
        v
pino serializers -> createSerializers (req / res / err) <-- runs SECOND
        |
        v
redact.paths (fast-redact stringifiers)                 <-- runs LAST
        |
        v
JSON.stringify -> destination
```

Three consequences follow, and each one is load-bearing:

**1. The walker sees a framework's parsed `query` before the serializer copies
it.** A Fastify request has its own `query` property, so `redactLogObject` masks
`query.token` before `createSerializers` moves that object into the emitted
line. A raw `IncomingMessage` has no `query` property at all, and
`pino-std-serializers` v7 does not parse one out of the URL, so nothing is
emitted for it. Neither path can leak a query secret.

**2. The walker runs before the `err` serializer, so it must not destroy the
`Error`.** An earlier version copied only own *enumerable* keys. `message` is
non-enumerable and V8 implements `stack` as an own accessor over internal
`[[ErrorData]]`, so both were dropped; the flattened value then failed the std
serializer's `instanceof Error` check and the line lost its message and stack
entirely. `safeShallowCopyPreserving` now keeps the prototype and
non-enumerable properties and materializes accessors into data properties.

**3. The walker cannot see fields that only exist after serialization**, most
notably `res.headers`. Those are covered by pino's own `redact.paths`, which is
why `REDACT_PATHS` exists at all. The walker and the path list are
complementary, not redundant.

## Redaction

### Plain data is walked; runtime objects are not

`redactDeep` distinguishes plain objects and arrays (prototype is `Object.prototype`
or `null`) from everything else. Plain data is traversed to any depth, up to
`MAX_DEPTH = 100`. Non-plain objects — class instances, streams, `IncomingMessage`,
sockets, model objects — are treated as opaque leaves and passed by reference.

This is a deliberate trade, not an oversight. Bindings routinely hold live
objects whose graph runs `socket -> connection -> parser -> ...`; deep-walking
one on every log call cost roughly 26.8 us/call against roughly 0.7 us/call for
the non-walking path. The limitation is real and user-visible: a
`password` on a bound `UserModel` is not masked. `test/security.test.ts`
asserts this deliberately so that any change to start traversing has to revisit
both the cost and the contract.

Structured `req`/`res` bindings remain covered despite not being walked, because
pino's `redact.paths` applies to bindings as well.

### Copy-on-write, never mutate

The walker returns the original object untouched when nothing matched, and
clones only along paths that actually changed. Two things follow: the common
no-match path allocates nothing (measured 1.55 us/call for `redactLogObject`
against 3.5 us/call for the whole logging path), and caller-owned data is never
mutated.

Structured `req`/`res` bindings remain covered despite not being walked, because
pino's `redact.paths` applies to bindings as well.

### URL keys have their query string stripped

The walker also rewrites string values under `url`, `originalUrl`, `requestUrl`,
`href`, `referer`, and `referrer` to remove the query portion. The request
serializer already strips `req.url`, but a serializer only sees the key it was
registered for. An application log of the form
`logger.info({ url: request.url })` never reaches it, so without this the
documented default would have held for `req` and failed for the most common
shape of all. Stripping at the walker covers both, at any depth, in arrays, and
in bindings.

The rewrite is reference-preserving when there is no query, so the no-match path
still allocates nothing. A field that contains a `?` but is not URL-bearing is
left untouched, which is why the key set is explicit rather than pattern-based.

### Child bindings are a separate path
pino serializes child bindings into a pre-built JSON string at child-creation
time (`asChindings`). They therefore reach neither `formatters.log` nor the
`redact` stringifiers, and `logger.child({ apiKey })` would write the secret in
plaintext. They are masked in `redactBindings` *before* `child()` is called.

Redacting in `createChildLogger` alone would not be enough, because
`logger.child(...)` is itself a documented way to create a child. So
`installSafeChild` wraps the method on the root instance; pino builds children
with `Object.create(this)`, so the wrapper is inherited by the whole tree and
captures the prototype's original `child` to preserve inherited bindings.

pino does offer a `formatters.bindings` hook, but it cannot be used here:
`proto.js` rebuilds a child's formatters through `resetChildingsFormatter` and
drops it.

## Modes

`defineConfig` returns pino options for `development` (level `trace`),
`production` (level `info`, the default), and `test` (level `silent`).

Redaction is applied in **every** mode, including `test`. A secret must not
reach a terminal or a CI log just because the run is local, and the test suite
asserts emitted output in all three modes rather than only inspecting config.

## HTTP

`createHttpLogger` wraps `pino-http` and substitutes `createSerializers` for the
standard request and response serializers. By default the query string is
stripped from the logged URL and the raw `queryString` field is omitted, because
stripping only the URL leaves the same secrets in the emitted line. The parsed
`query` object is still emitted, with sensitive keys masked.

`excludeQueryString`, `excludeHeaders`, and `excludeQuery` are the three knobs;
all default toward disclosure being off.

## Fastify

The documented integration passes the logger as `loggerInstance`, never as
`logger`. In Fastify 5, `logger` accepts `boolean | options`; handing it a
logger instance or the pino-http middleware makes Fastify build its **own** pino
logger. Nothing throws — the server starts and serves — but the package's
serializers, redaction, and level formatting are all absent, and output goes to
stdout instead of the configured destination. `test/integration.test.ts`
asserts both the working path and the anti-pattern's failure, so the README
guidance cannot silently become wrong.

## Testing

```text
test/
  logger.test.ts       80  Original behavioural suite.
  security.test.ts     72  Redaction, invariants, hostile payloads, mutation.
  serializers.test.ts  52  req/res shape, header and query casing, edge cases.
  integration.test.ts   6  Real Fastify server, real pino-http request.
  performance.test.ts   9  Cost-shape regressions.
  api.test.ts          15  Public export surface.
  helpers.ts              Shared capture utilities.
```

Tests build loggers through the public factory and assert on parsed emitted
JSON, never on pino internals or raw output strings. A serializer can return a
perfectly redacted object that never reaches the sink, and the sink can leak
through a field the serializer never touched; only the emitted line settles it.

Performance tests assert *shape* rather than absolute throughput, because
machine speed varies too much for a fixed ops/sec gate to be meaningful and a
flaky performance gate gets deleted. The graph-traversal guard is a ratio test
plus a deterministic identity assertion (`redactBindings({ req: x }).req === x`),
which catches a return to traversal without depending on the host.
