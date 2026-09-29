# @oneunit/kafka

KafkaJS client for Node.js. The only runtime dependency is `kafkajs`. Logger, config, and codecs are adapters you pass in, so this package works standalone or inside a framework.

Monorepo: https://github.com/mayank040902/oneunit

## Install

```bash
npm install @oneunit/kafka
```

## Quick start (standalone)

```javascript
import { createKafkaClient } from "@oneunit/kafka";

const client = createKafkaClient({
    brokers: "localhost:9092",
    clientId: "orders-service",
    groupId: "orders-workers",
});

await client.send("orders", { orderId: "abc", status: "created" });

await client.consume("orders", async ({ key, value, topic, partition }) => {
    console.log({ topic, partition, key, value });
});

client.registerShutdown();
```

## Quick start (framework adapters)

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
    logger.info(`received ${topic} offset ${message.offset}`);
});

registerShutdown(logger, { producer, consumer });
```

The same factories work with no logger and no config adapter:

```javascript
const kafka = createKafka({ brokers: "localhost:9092" });
const producer = await createProducer(kafka);
const consumer = await createConsumer(kafka, "orders-workers");
```

## Adapters

This package does not depend on a logger, config, or serializer library. Plug those in:

| Adapter | Default | Inject with |
| :--- | :--- | :--- |
| Logger | `console` | `createLoggerAdapter(pinoLogger)` or `{ logger }` |
| Config | `process.env` | `createConfigAdapter(source)` or `{ config }` |
| Codec | JSON | `createCodecAdapter({ encode, decode })` or `{ codec }` |

### Logger adapter

Accepts Pino, Winston, Bunyan, `@oneunit/logger`, a `{ info, error, warn, debug }` object, or a `(level, message, extra)` function.

```javascript
import { createKafkaClient, createLoggerAdapter, silentLogger } from "@oneunit/kafka";

createKafkaClient(createLoggerAdapter(appLogger), { brokers: "localhost:9092" });
createKafkaClient({ logger: silentLogger, brokers: "localhost:9092" });
```

### Config adapter

```javascript
import { createConfigAdapter, createKafkaClient } from "@oneunit/kafka";

const config = createConfigAdapter({
    KAFKA_BROKERS: "localhost:9092",
    KAFKA_CLIENT_ID: "orders-service",
    KAFKA_GROUP_ID: "orders-workers",
});

const client = createKafkaClient({ config });
```

### Codec adapter

JSON is built in. For MessagePack or any other format, pass encode/decode:

```javascript
import { encode, decode } from "@msgpack/msgpack";
import { createKafkaClient } from "@oneunit/kafka";

const client = createKafkaClient({
    brokers: "localhost:9092",
    codec: {
        name: "msgpack",
        encode: (value) => Buffer.from(encode(value)),
        decode: (bytes) => decode(bytes),
    },
});
```

## Configuration

Options override the config adapter / environment variables.

| Option / variable | Description |
| :--- | :--- |
| `brokers` / `KAFKA_BROKERS` | Comma-separated broker list |
| `clientId` / `KAFKA_CLIENT_ID` | Kafka client id (`kafka-client` by default) |
| `groupId` / `KAFKA_GROUP_ID` | Consumer group id |
| `ssl` / `KAFKA_SSL` | Enable TLS |
| `ca` / `KAFKA_CA` | CA certificate path or PEM |
| `cert` / `KAFKA_CERT` | Client certificate path or PEM |
| `key` / `KAFKA_KEY` | Client key path or PEM |
| `sasl.mechanism` / `KAFKA_SASL_MECHANISM` | `plain`, `scram-sha-256`, or `scram-sha-512` |
| `sasl.username` / `KAFKA_SASL_USERNAME` | SASL username |
| `sasl.password` / `KAFKA_SASL_PASSWORD` | SASL password |
| `logLevel` / `KAFKA_LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `nothing` |
| `partitioner` / `createPartitioner` | `legacy`, `default`, `murmur2`, or a partitioner function |
| `retry` | KafkaJS retry overrides (`retries`, `initialRetryTime`, `maxRetryTime`) |
| `codec` | `json`, `bytes`, or a codec object; also accepted per call |

### Per-call codec

A codec set on the client applies to every message. Pass `codec` to a single call to
override it for that call only, so mixed-format topics can share one client:

```javascript
await client.send("orders", payload, { codec: msgpackCodec });
await client.consume("orders", handler, { codec: msgpackCodec });
```

## API

| Export | Description |
| :--- | :--- |
| `createKafkaClient(logger?, options?)` | High-level client |
| `createKafka(logger?, options?)` | KafkaJS `Kafka` instance |
| `createProducer` / `createConsumer` / `createAdmin` | Connected clients |
| `createLoggerAdapter` / `createConfigAdapter` / `createCodecAdapter` | Adapters |
| `jsonCodec` / `bytesCodec` | Built-in codecs |
| `getSslConfig` / `getSaslConfig` / `createLogCreator` | Config and logging helpers |
| `isKafkaConfigured(options)` | Whether brokers are resolvable |
| `registerShutdown` / `shutdownClient` | Graceful disconnect |

## Examples

The examples run against the TypeScript sources, so they need `tsx` and a reachable
broker.

```bash
npm run example:standalone        # high-level client, no logger
npm run example:producer          # batching, keys, and a per-call codec
npm run example:consumer          # decoded values plus offset and headers
npm run example:codec-adapter     # client-level codec
npm run example:framework         # low-level factories with a Pino-style logger
```

Set `KAFKA_BROKERS` and `KAFKA_TOPIC` to point them somewhere other than
`localhost:9092` and `demo-events`.

## Documentation

| Document | Contents |
| :--- | :--- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module layout, the two API layers, data flow, connection lifecycle, known gaps |
| [CONTRIBUTING.md](https://github.com/mayank040902/oneunit/blob/master/packages/kafka/CONTRIBUTING.md) | Setup, scripts, conventions, and the review checklist |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Scripts

```bash
npm test
npm run typecheck
```

`npm run lint` is currently a no-op: the ESLint config matches `**/*.js` while
`src/` is TypeScript. See [CONTRIBUTING.md](https://github.com/mayank040902/oneunit/blob/master/packages/kafka/CONTRIBUTING.md).

## License

MIT. Copyright (c) 2026 mayank.
