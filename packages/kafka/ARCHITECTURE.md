# Architecture

`@oneunit/kafka` wraps [KafkaJS](https://kafka.js.org) in a small, adapter-driven
layer. The design constraint that shapes everything below: **KafkaJS is the only
runtime dependency.** Logging, configuration, and serialization are concerns this
package does not own, so they enter through adapters you pass in.

## Module layout

```
src/
  index.ts              public surface: re-exports every module below
  kafka-client.ts       KafkaClient — the high-level, opinionated API
  client/
    index.ts            re-exports for the @oneunit/kafka/client subpath
    config.ts           option parsing, createKafka(), partitioner resolution
    producer.ts         createProducer()
    consumer.ts         createConsumer(), subscribeToTopic(), consumeMessages()
    admin.ts            createAdmin()
    shutdown.ts         registerShutdown(), shutdownClient()
    ssl.ts              getSslConfig()
    sasl.ts             getSaslConfig()
  adapters/
    index.ts            public surface for the adapter factories
    logger.ts           createLoggerAdapter()
    config.ts           createConfigAdapter(), readConfig* helpers
    codec.ts            jsonCodec, bytesCodec, createCodecAdapter(), resolveCodec()
  logger.ts             Logger type, isLogger(), createLogger(), silent/console
  env.ts                envString(), envNumber(), envBoolean()
  errors.ts             KafkaConfigError, KafkaConnectionError, KafkaDecodeError
```

Dependencies flow one way: `index.ts` → `kafka-client.ts` → `client/*` → `logger`,
`env`, `errors`, `adapters`. Nothing imports back up.

## Two API layers

**Low level** — thin factories that return connected KafkaJS objects and stay out of
the way:

```javascript
const kafka = createKafka(logger, { brokers });
const producer = await createProducer(kafka, logger);
const consumer = await createConsumer(kafka, logger, "workers");
```

**High level** — `KafkaClient` owns the lifecycle, caching, and encoding:

```javascript
const client = createKafkaClient({ brokers, groupId, codec });
await client.send("orders", { id: 1 });
await client.consume("orders", async ({ value, message }) => { /* ... */ });
```

Use the low level when you need KafkaJS features this package does not model. Use the
high level for the common produce/consume shape.

## Argument resolution

Every factory accepts several call shapes so it reads naturally with or without a
logger, and with or without a config adapter:

```javascript
createConsumer(kafka, "workers");                       // group id only
createConsumer(kafka, logger, "workers");               // logger + group id
createConsumer(kafka, logger, { groupId: "workers" });  // logger + options
createConsumer(kafka, { groupId: "workers" });          // options only
```

This is resolved by small `resolve*Args` helpers in each module. The rule throughout
is `isLogger(value) ? treat as logger : treat as options`, so a value is classified by
what it is rather than by position. `isLogger` (`src/logger.ts:64`) requires at least
one log method **and** the absence of any known option key — that second condition is
what stops a full options object from being mistaken for a logger.

## Data flow

### Produce

```
client.send(topic, messages, options)
  → getProducer()                    resolveOnce: one producer per client
  → resolveCodecOption(options.codec) per-call codec, else the client codec
  → normalizeOutgoing()              one message per entry
      → encodeValue()                strings and Buffers pass through untouched
  → producer.send({ ...options.send, topic, messages })
```

`options.send` is spread **first**, so the explicit `topic` and `messages` arguments
always win. That is deliberate: a stray `send: { topic }` must never redirect a
publish.

### Consume

```
client.consume(topic, handler, options)
  → getConsumer()                    resolveOnce: one consumer per client
  → subscribeOnce()                  skipped if the topic is already subscribed
  → wrapHandler()                    decodes key and value
      → decodeIncoming()             parseJson === false returns raw text
      → codec.decode()               otherwise
  → consumer.run({ eachMessage })
```

The handler receives decoded `key` and `value` at the top level **and** a `message`
object carrying the original `offset`, `timestamp`, and `headers` with those same
decoded values. Offset-based commits need the metadata; a codec needs the decoded
payload. Both are available, so neither is traded for the other.

Decode failures raise `KafkaDecodeError` with the original error as `cause`, rather
than silently handing the handler a Buffer.

## Connection lifecycle

`KafkaClient` is a cache with a lifetime:

| Concern | Mechanism |
| :--- | :--- |
| One producer/consumer/admin per client | `resolveOnce()` memoizes the in-flight promise |
| Failed connect stays retryable | the memo is cleared only on rejection |
| No duplicate subscriptions | `subscriptions` memoizes the in-flight `subscribe` |
| `disconnect()` wins a race | `adoptIfCurrent()` discards a client that connected after teardown |
| Graceful shutdown | `registerShutdown()` resolves clients *at shutdown time* |

`resolveOnce()` (`src/kafka-client.ts:243`) is the important one. A plain
`if (!this.producer)` check is still false while the `await` is in flight, so parallel
callers would each build a client. KafkaJS returns a **new** instance per factory
call, so that leaks broker connections rather than merely wasting work.

Memoizing an in-flight promise is not enough on its own, because it introduces its
own race: `disconnect()` clears the memo, but a connection already in flight still
resolves afterwards and writes itself into the client. The `generation` counter,
bumped by `disconnect()`, lets `adoptIfCurrent()` recognise that case — the new
client is disconnected immediately and the caller is told why, rather than being
handed a live connection that nothing will ever close.

The same reasoning applies to subscriptions: checking a set of finished topics before
`await`ing means two concurrent callers both see an empty set. Storing the in-flight
promise closes that window, and deleting it on failure keeps a failed subscribe
retryable.

`disconnect()` clears every cache — clients, the in-flight memos, and the
subscription map — so a disconnected client can be reused.

## Extension points

| Concern | Interface | Default | Injected with |
| --- | --- | --- | --- |
| Logging | `Logger` | `console` | `createLoggerAdapter(pinoLogger)` or `{ logger }` |
| Configuration | `ConfigAdapter` | `process.env` | `createConfigAdapter(source)` or `{ config }` |
| Serialization | `Codec` | JSON | `createCodecAdapter({ encode, decode })` or `{ codec }` |

A codec is any object with `encode(value)` and `decode(bytes)`, and it may be supplied
per call as well as per client:

```javascript
await client.send("orders", payload, { codec: msgpackCodec });
await client.consume("orders", handler, { codec: msgpackCodec });
```

A per-call codec overrides the client-level one and applies only to that call, so
mixed-format topics can coexist on one client.

**Logger argument order.** `invoke()` in `src/logger.ts:135` assumes that any logger
with a `child` method is Pino and calls it as `logger.info(bindings, message)`. Both
positions are always passed, even when there is nothing to bind, because a
message-only call that collapses to one argument would put the message in the
bindings slot. Pino handles this correctly. Bunyan is message-first *and* has
`child`, so its two arguments are swapped for structured entries; this is a known gap
that needs a Pino-specific marker such as `Symbol.for("pino.metadata")` to resolve
reliably, and Pino is not a dependency of this package.

**Log normalization.** KafkaJS emits three shapes through its log creator: a bare
string, an `Error`, and a structured object. `normalizeLogPayload()`
(`src/client/config.ts:106`) flattens all three into `{ message, extra }` before
they reach your logger, so an `Error` arrives as its message plus an `err` binding
rather than being dropped.

**String pass-through.** `encodeValue()` sends strings and Buffers through untouched
rather than running them through the codec, so a plain key like `user-1` stays
`user-1` on the wire. This is intentional and load-bearing for the common
string-key case, but it means a custom codec does not round-trip plain strings:
`createKafkaMessage("user-1", value)` JSON-encodes the key to `"user-1"` while
`client.send` leaves it raw. Both are readable on the way back because
`jsonCodec.decode` falls back to returning raw text when parsing fails.

## Errors

Three errors, all exported:

- `KafkaConfigError` — missing or invalid configuration. Thrown eagerly, before any
  connection is attempted.
- `KafkaConnectionError` — a producer, consumer, or admin failed to connect. Wraps
  the original error as `cause` after attempting a best-effort `disconnect()`.
- `KafkaDecodeError` — a message could not be decoded. Wraps the codec's error as
  `cause`.

## Published package

`npm pack` ships `dist`, `src`, `examples`, and the documentation files listed in
`files`. `src` is included deliberately: `tsc` emits `.js.map` and `.d.ts.map` that
reference `../src/*.ts`, so without the sources in the tarball every consumer would
get broken source maps and broken go-to-definition.

Two entry points are published: `@oneunit/kafka` and the `@oneunit/kafka/client`
subpath for the low-level factories. `sideEffects` is `false`, and the package is
ESM-only.

## Testing

Tests use the Node.js built-in runner (`node:test`) and run against the TypeScript
sources through `tsx`; there is no build step before testing. `test/helpers.js`
provides `createMockKafka()`, a fake KafkaJS surface that records what it was asked to
do, plus `memoryLogger()` and `withEnv()`.

`npm run smoke` is the complement: it runs `scripts/smoke.mjs` against a real broker
and covers the wire path a mock cannot — KafkaJS option forwarding, actual
serialization, and a real produce/consume round trip. It creates its topic if
missing and uses a fresh consumer group per check, so it is safe to run repeatedly.

Prefer behavioural assertions over implementation details. The mock records factory
call counts, so tests assert that a call happened **once** — which is how the
connection-leak and double-subscribe bugs were caught.

## Known gaps

- `npm run lint` is currently a no-op: `eslint.config.js` matches `**/*.js` while
  `src/` is TypeScript. Add a TS-aware ESLint config before relying on it.
- Logger argument order is swapped for Bunyan and any other message-first logger that
  exposes `child` (see above).
- `client.consume()` called twice on one client reuses the cached consumer and calls
  `consumer.run()` again, which KafkaJS rejects. Create one client per consumer.
- `aws` and `oauthbearer` SASL pass validation but cannot be configured through this
  package's option shape, which models `username`/`password` only. Pass those two
  mechanisms through a custom logger path or extend `getSaslConfig`.
