# @bootstrap-framework/kafka

KafkaJS client for Node.js. The only runtime dependency is `kafkajs`. Logger, config, and codecs are adapters you pass in, so this package works standalone or inside a framework.

Monorepo: https://github.com/mayank040902/framework

## Install

```bash
npm install @bootstrap-framework/kafka
```

## Quick start (standalone)

```javascript
import { createKafkaClient } from "@bootstrap-framework/kafka";

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
} from "@bootstrap-framework/kafka";

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

Accepts Pino, Winston, Bunyan, `@bootstrap-framework/logger`, a `{ info, error, warn, debug }` object, or a `(level, message, extra)` function.

```javascript
import { createKafkaClient, createLoggerAdapter, silentLogger } from "@bootstrap-framework/kafka";

createKafkaClient(createLoggerAdapter(appLogger), { brokers: "localhost:9092" });
createKafkaClient({ logger: silentLogger, brokers: "localhost:9092" });
```

### Config adapter

```javascript
import { createConfigAdapter, createKafkaClient } from "@bootstrap-framework/kafka";

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
import { createKafkaClient } from "@bootstrap-framework/kafka";

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

## API

| Export | Description |
| :--- | :--- |
| `createKafkaClient(logger?, options?)` | High-level client |
| `createKafka(logger?, options?)` | KafkaJS `Kafka` instance |
| `createProducer` / `createConsumer` / `createAdmin` | Connected clients |
| `createLoggerAdapter` / `createConfigAdapter` / `createCodecAdapter` | Adapters |
| `jsonCodec` / `bytesCodec` | Built-in codecs |
| `registerShutdown` / `shutdownClient` | Graceful disconnect |

## Examples

```bash
node examples/standalone.js
node examples/framework.js
node examples/producer.js
node examples/consumer.js
node examples/codec-adapter.js
```

## Scripts

```bash
npm test
npm run typecheck
npm run lint
```

## License

MIT. Copyright (c) 2026 mayank.
