# @oneunit/kafka

Production-ready Kafka client for Node.js (Node >= 20, ESM). The only runtime dependency is `kafkajs`. Logger, configuration, and serialization codecs are pluggable adapters, allowing this package to run standalone or seamlessly within any application framework.

Monorepo: https://github.com/mayank040902/oneunit

---

## Features

- 🚀 **Zero Runtime Dependencies**: Depends strictly on `kafkajs` — no embedded logger, config parser, or serializer libraries.
- 🧱 **Two API Layers**:
  - **High-Level (`KafkaClient`)**: Opinionated, manages lazy connection pooling, message encoding/decoding, deduplication, and lifecycle.
  - **Low-Level Factories**: Direct access to connected KafkaJS `Kafka`, `Producer`, `Consumer`, and `Admin` instances.
- 🔌 **Pluggable Adapter Architecture**:
  - **Logger Adapter**: Compatible with Pino, Winston, Bunyan, `@oneunit/logger`, custom logger objects, or function loggers.
  - **Config Adapter**: Works with `process.env`, custom config objects, or configuration stores.
  - **Codec Adapter**: Built-in JSON and raw bytes codecs, with support for custom formats (MessagePack, Avro, Protobuf).
- 🔄 **Per-Call Codec Overrides**: Apply a default codec at the client level, or override it on individual `send()` and `consume()` calls for mixed-format topics.
- 🛡️ **Resilient Connection Lifecycle**:
  - In-flight connection memoization (`resolveOnce`) prevents duplicate broker connections from concurrent calls.
  - Teardown race protection guards against connections resolving after `disconnect()`.
  - Duplicate-subscription prevention tracks in-flight and active topic subscriptions.
- 🔒 **Enterprise Security**:
  - SSL/TLS support via inline PEM or filesystem paths (`ca`, `cert`, `key`) with safe `rejectUnauthorized` coercion.
  - SASL authentication (`plain`, `scram-sha-256`, `scram-sha-512`, `aws`, `oauthbearer`) with eager mechanism validation.
- 🛑 **Graceful Shutdown**: Idempotent signal handler (`SIGINT`, `SIGTERM`) that dynamically resolves and disconnects lazily-created clients.
- 🎯 **Eager & Typed Errors**: Specific error classes (`KafkaConfigError`, `KafkaConnectionError`, `KafkaDecodeError`) with `cause` chaining.
- 🔷 **TypeScript Native**: Complete type definitions, exported types, source maps, and bundled sources for go-to-definition.

---

## Installation

```bash
npm install @oneunit/kafka
```

---

## Quick Start

### Standalone (High-Level Client)

```javascript
import { createKafkaClient } from "@oneunit/kafka";

const client = createKafkaClient({
    brokers: "localhost:9092",
    clientId: "orders-service",
    groupId: "orders-workers",
});

// Produce a message (encoded as JSON by default)
await client.send("orders", { orderId: "ord-101", status: "created" });

// Consume messages with decoded key and value, plus KafkaJS metadata
await client.consume("orders", async ({ key, value, partition, message }) => {
    console.log({
        offset: message.offset,
        partition,
        key,
        value,
    });
});

// Register graceful shutdown on SIGTERM / SIGINT
client.registerShutdown();
```

### Framework Integration (Adapters & Low-Level API)

```javascript
import pino from "pino";
import {
    createKafka,
    createProducer,
    createConsumer,
    subscribeToTopic,
    consumeMessages,
    createLoggerAdapter,
    createConfigAdapter,
    registerShutdown,
} from "@oneunit/kafka";

const logger = createLoggerAdapter(pino({ name: "orders-service" }));
const config = createConfigAdapter(process.env);

const kafka = createKafka(logger, { config });
const producer = await createProducer(kafka, logger);
const consumer = await createConsumer(kafka, logger, config.string("KAFKA_GROUP_ID"));

await subscribeToTopic(consumer, logger, "orders");
await consumeMessages(consumer, logger, async ({ topic, message }) => {
    logger.info(`Received ${topic} offset ${message.offset}`);
});

registerShutdown(logger, { producer, consumer });
```

---

## Feature Guide

### 1. High-Level Client (`KafkaClient`)

The `KafkaClient` class manages the lifecycle of producers, consumers, and admin clients. Connections and subscriptions are created lazily on demand and deduplicated.

```javascript
import { createKafkaClient } from "@oneunit/kafka";

const client = createKafkaClient({
    brokers: ["localhost:9092"],
    clientId: "my-service",
    groupId: "my-group",
});
```

#### Publishing Messages (`client.send`)

`send(topic, messages, options?)` supports single messages, batch arrays, message keys, and optional KafkaJS producer overrides:

```javascript
// Single message
await client.send("orders", { orderId: "123", amount: 49.99 });

// Batch of messages with keys
await client.send("orders", [
    { key: "user-1", value: { action: "login" } },
    { key: "user-2", value: { action: "logout" } },
]);

// Raw strings or Buffers pass through untouched
await client.send("logs", "plain text log line");

// Producer-level KafkaJS options (acks, timeout, compression)
import { CompressionTypes } from "kafkajs";

await client.send("metrics", { cpu: 85 }, {
    send: {
        compression: CompressionTypes.GZIP,
        timeout: 5000,
    },
});
```

> **Note on Keys:** String and Buffer keys pass through without additional JSON wrapping, ensuring compatibility with standard Kafka partitioning.

#### Consuming Messages (`client.consume`)

`consume(topic, handler, options?)` subscribes to a topic and starts processing messages:

```javascript
await client.consume(
    "orders",
    async ({ key, value, partition, message, topic }) => {
        // key and value are automatically decoded
        console.log(`Order event: ${value.orderId} on partition ${partition}`);

        // message preserves KafkaJS metadata
        console.log(`Offset: ${message.offset}, Timestamp: ${message.timestamp}`);
        console.log("Headers:", message.headers);
    },
    { fromBeginning: true },
);
```

#### Explicit Topic Subscription (`client.subscribe`)

If you need to subscribe before consuming, or subscribe multiple topics:

```javascript
await client.subscribe("orders", { fromBeginning: false });
await client.consume(async ({ value }) => {
    console.log("Processed:", value);
});
```

#### Lazy Client Access & Teardown

`KafkaClient` allows direct access to underlying connected clients when necessary. Calls are memoized: concurrent invocations return the same promise.

```javascript
const producer = await client.getProducer();
const consumer = await client.getConsumer(); // uses default groupId or can pass an override
const admin = await client.getAdmin();

// Disconnect all active clients and clear internal state
await client.disconnect();
```

---

### 2. Low-Level Factories (`@oneunit/kafka/client`)

When full control over KafkaJS is required, use the modular factories directly or import from `@oneunit/kafka/client`:

| Factory | Signature | Description |
| :--- | :--- | :--- |
| `createKafka` | `createKafka(logger?, options?)` | Returns configured `Kafka` instance |
| `createProducer` | `createProducer(kafka, logger?, options?)` | Creates & connects a KafkaJS `Producer` |
| `createConsumer` | `createConsumer(kafka, logger?, groupIdOrOptions?)` | Creates & connects a KafkaJS `Consumer` |
| `createAdmin` | `createAdmin(kafka, logger?, options?)` | Creates & connects a KafkaJS `Admin` |
| `subscribeToTopic` | `subscribeToTopic(consumer, logger?, topic, options?)` | Subscribes consumer to a topic |
| `consumeMessages` | `consumeMessages(consumer, logger?, handler)` | Starts consumer message dispatch loop |

Flexible argument shapes are supported:

```javascript
// With logger
const consumer = await createConsumer(kafka, logger, "group-a");

// Without logger
const consumer = await createConsumer(kafka, "group-a");
const consumer = await createConsumer(kafka, { groupId: "group-a" });
```

---

### 3. Pluggable Adapters

`@oneunit/kafka` does not force dependencies on loggers, environment readers, or serialization libraries.

| Adapter | Default | Factory / Injection |
| :--- | :--- | :--- |
| **Logger** | `console` | `createLoggerAdapter(instance)` or `{ logger }` |
| **Config** | `process.env` | `createConfigAdapter(source)` or `{ config }` |
| **Codec** | `jsonCodec` | `createCodecAdapter({ encode, decode })` or `{ codec }` |

#### Logger Adapter

Works out-of-the-box with any standard logger:

```javascript
import { createKafkaClient, createLoggerAdapter, silentLogger } from "@oneunit/kafka";
import pino from "pino";

// Pino logger (bindings-first order handled automatically)
const client = createKafkaClient({
    logger: createLoggerAdapter(pino()),
    brokers: "localhost:9092",
});

// Suppress all library logging
const quietClient = createKafkaClient({
    logger: silentLogger,
    brokers: "localhost:9092",
});
```

KafkaJS log events (strings, `Error` instances, structured payloads) are normalized before reaching your logger, mapping errors to `err` context bindings.

#### Config Adapter

Extract configuration from `process.env`, nested objects, or external stores with typed helpers:

```javascript
import { createConfigAdapter, createKafkaClient } from "@oneunit/kafka";

const config = createConfigAdapter({
    KAFKA_BROKERS: "kafka-1:9092,kafka-2:9092",
    KAFKA_CLIENT_ID: "payments-service",
    KAFKA_GROUP_ID: "payments-group",
    KAFKA_SSL: "true",
});

const client = createKafkaClient({ config });
```

Config adapter methods survive destructuring:

```javascript
const { string, number, boolean } = createConfigAdapter(process.env);
const brokers = string("KAFKA_BROKERS", "localhost:9092");
const retries = number("KAFKA_RETRIES", 5);
const ssl = boolean("KAFKA_SSL", false);
```

#### Codec Adapter & Message Serialization

Built-in codecs:
- `jsonCodec` (default): Encodes objects to JSON Buffers; decodes incoming buffers/strings with JSON fallback to raw text.
- `bytesCodec`: Preserves raw Buffers and binary payloads.

```javascript
import { createKafkaClient, bytesCodec } from "@oneunit/kafka";

// Client configured for raw bytes
const client = createKafkaClient({
    brokers: "localhost:9092",
    codec: bytesCodec, // or codec: "bytes"
});
```

**Custom Codecs (e.g. MessagePack):**

```javascript
import { encode, decode } from "@msgpack/msgpack";
import { createCodecAdapter, createKafkaClient } from "@oneunit/kafka";

const msgpackCodec = createCodecAdapter({
    name: "msgpack",
    encode: (val) => Buffer.from(encode(val)),
    decode: (bytes) => decode(bytes),
});

const client = createKafkaClient({
    brokers: "localhost:9092",
    codec: msgpackCodec,
});
```

**Per-Call Codec Overrides:**

When multiple formats share a single broker or client, override the codec per call:

```javascript
// Send this specific message using msgpackCodec instead of the client default
await client.send("events", { event: "click" }, { codec: msgpackCodec });

// Consume this topic with a specific codec
await client.consume("binary-events", handler, { codec: "bytes" });
```

**Standalone Serialization Helpers:**

```javascript
import {
    createKafkaMessage,
    parseKafkaMessage,
    encodeToString,
    decodeFromString,
} from "@oneunit/kafka";

const message = createKafkaMessage("key-1", { foo: "bar" });
const parsed = parseKafkaMessage(message);
```

---

### 4. Security: SSL/TLS & SASL Authentication

#### SSL/TLS

SSL can be toggled as a boolean or configured with file paths or inline PEM certificates:

```javascript
const client = createKafkaClient({
    brokers: "secure-broker:9093",
    ssl: {
        ca: "/var/certs/ca.pem",      // File path or inline PEM string
        cert: "/var/certs/client.pem",
        key: "/var/certs/client.key",
        rejectUnauthorized: true,
    },
});
```

Or via environment / config adapter:
- `KAFKA_SSL=true`
- `KAFKA_CA=/path/to/ca.pem`
- `KAFKA_CERT=/path/to/cert.pem`
- `KAFKA_KEY=/path/to/key.pem`
- `KAFKA_SSL_REJECT_UNAUTHORIZED=true` (safely coerced so `"false"` will not leave validation enabled)

#### SASL Authentication

Supports all SASL mechanisms provided by KafkaJS: `plain`, `scram-sha-256`, `scram-sha-512`, `aws`, and `oauthbearer`.

```javascript
const client = createKafkaClient({
    brokers: "secure-broker:9093",
    sasl: {
        mechanism: "scram-sha-512",
        username: "service-user",
        password: "secret-password",
    },
});
```

Or via environment variables:
- `KAFKA_SASL_MECHANISM=scram-sha-512`
- `KAFKA_SASL_USERNAME=service-user`
- `KAFKA_SASL_PASSWORD=secret-password`

Mechanisms are validated upfront; unsupported mechanisms throw an informative `KafkaConfigError` immediately before network requests begin.

---

### 5. Resilience, Concurrency & Lifecycle

- **Concurrency-Safe Lazy Initialization**: Calling `client.getProducer()`, `client.getConsumer()`, or `client.getAdmin()` concurrently shares a single in-flight promise (`resolveOnce`), preventing connection leaks and duplicate instances.
- **Teardown Race Protection**: If `client.disconnect()` is called while a client connection is still in flight, the completed connection is immediately shut down rather than being leaked into internal state.
- **Deduplicated Subscriptions**: Calling `client.subscribe()` or `client.consume()` concurrently on the same topic tracks the in-flight subscription promise, preventing duplicate partition registrations.
- **Idempotent Graceful Shutdown**: `registerShutdown()` connects to `SIGTERM` and `SIGINT`. It disconnects all managed clients (resolving lazily created clients at shutdown time) and ensures multiple signals do not trigger multiple disconnects.

```javascript
const shutdownHandler = client.registerShutdown({ exit: true });

// Can also be manually invoked:
await shutdownHandler("MANUAL");
```

---

### 6. Error Handling

All custom errors inherit from standard `Error` and support error chaining via `cause`:

```javascript
import {
    KafkaConfigError,
    KafkaConnectionError,
    KafkaDecodeError,
} from "@oneunit/kafka";

try {
    await client.consume("orders", async ({ value }) => {
        // ...
    });
} catch (error) {
    if (error instanceof KafkaConfigError) {
        console.error("Configuration missing or invalid:", error.message);
    } else if (error instanceof KafkaConnectionError) {
        console.error("Failed to connect to broker:", error.message, error.cause);
    } else if (error instanceof KafkaDecodeError) {
        console.error("Message decode failure:", error.message, error.cause);
    }
}
```

---

## Configuration Reference

Options passed directly to `createKafkaClient` or `createKafka` override configuration adapter values and environment variables.

| Option | Environment Variable | Default | Description |
| :--- | :--- | :--- | :--- |
| `brokers` | `KAFKA_BROKERS` | *Required* | Comma-separated broker addresses or array |
| `clientId` | `KAFKA_CLIENT_ID` | `kafka-client` | Client identifier reported to Kafka |
| `groupId` | `KAFKA_GROUP_ID` | — | Consumer group ID |
| `ssl` | `KAFKA_SSL` | `false` | Enable TLS / SSL encryption |
| `ca` | `KAFKA_CA` | — | CA certificate path or inline PEM |
| `cert` | `KAFKA_CERT` | — | Client certificate path or inline PEM |
| `key` | `KAFKA_KEY` | — | Client private key path or inline PEM |
| `rejectUnauthorized`| `KAFKA_SSL_REJECT_UNAUTHORIZED` | `true` | Verify server certificate validity |
| `sasl.mechanism` | `KAFKA_SASL_MECHANISM` | — | `plain`, `scram-sha-256`, `scram-sha-512`, `aws`, `oauthbearer` |
| `sasl.username` | `KAFKA_SASL_USERNAME` | — | SASL username |
| `sasl.password` | `KAFKA_SASL_PASSWORD` | — | SASL password |
| `partitioner` | `KAFKA_CREATE_PARTITIONER` | `default` | `default`, `legacy`, `murmur2` / `java-compatible` |
| `createPartitioner` | — | — | Partitioner factory function or partitioner name |
| `logLevel` | `KAFKA_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `nothing` |
| `retry.retries` | `KAFKA_RETRIES` | `8` | Maximum retry attempts |
| `retry.initialRetryTime` | `KAFKA_RETRY_INITIAL_TIME` | `300` | Initial backoff time in ms |
| `retry.maxRetryTime` | `KAFKA_RETRY_MAX_TIME` | `30000` | Maximum retry backoff in ms |
| `connectionTimeout` | `KAFKA_CONNECTION_TIMEOUT` | `3000` | Connection timeout in ms |
| `requestTimeout` | `KAFKA_REQUEST_TIMEOUT` | `30000` | Request timeout in ms |
| `authenticationTimeout` | `KAFKA_AUTHENTICATION_TIMEOUT`| `10000` | SASL authentication timeout in ms |
| `codec` | — | `json` | Codec instance or name (`json`, `bytes`) |

---

## API Exports

### High-Level API (`@oneunit/kafka`)

```javascript
import {
    KafkaClient,
    createKafkaClient,
    isKafkaConfigured,
    // Adapters
    createLoggerAdapter,
    createConfigAdapter,
    createCodecAdapter,
    resolveCodec,
    jsonCodec,
    bytesCodec,
    silentLogger,
    consoleLogger,
    // Serialization helpers
    createKafkaMessage,
    parseKafkaMessage,
    createKafkaMessageString,
    parseKafkaMessageString,
    encode,
    decode,
    encodeToString,
    decodeFromString,
    // Errors
    KafkaConfigError,
    KafkaConnectionError,
    KafkaDecodeError,
} from "@oneunit/kafka";
```

### Low-Level Client Factories (`@oneunit/kafka/client` or `@oneunit/kafka`)

```javascript
import {
    createKafka,
    createProducer,
    createConsumer,
    createAdmin,
    subscribeToTopic,
    consumeMessages,
    registerShutdown,
    shutdownClient,
    getSslConfig,
    getSaslConfig,
    createLogCreator,
    resolvePartitioner,
    parseBrokers,
} from "@oneunit/kafka/client";
```

---

## Examples

Runnable example scripts are included in `examples/` (running directly via `tsx` against TypeScript sources):

```bash
npm run example:standalone      # High-level client, default JSON codec
npm run example:producer        # Batching, partition keys, per-call codecs
npm run example:consumer        # Decoded values, offset, timestamp & headers
npm run example:codec-adapter   # Client-level custom codec adapter
npm run example:framework       # Low-level factories with a Pino-style logger
```

You can target external brokers by providing environment variables:

```bash
KAFKA_BROKERS=broker:9092 KAFKA_TOPIC=events npm run example:producer
```

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed internal architecture, module layout, data flow, connection lifecycle, and design decisions.
- [CONTRIBUTING.md](https://github.com/mayank040902/oneunit/blob/master/packages/kafka/CONTRIBUTING.md) — Development workflow, testing guidelines, and review checklist.
- [CHANGELOG.md](CHANGELOG.md) — Release notes and version history.

---

## Testing & Quality

```bash
npm test            # Run 60+ unit & integration tests using node:test and tsx
npm run typecheck   # Type-check TypeScript codebase
npm run smoke       # Run end-to-end smoke test against a real Kafka broker
```

---

## License

[MIT](LICENSE) © 2026 mayank
