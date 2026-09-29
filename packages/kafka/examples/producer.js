/**
 * Producer: batching, message keys, and a per-call codec.
 *
 *   npx tsx examples/producer.js
 *
 * Environment:
 *   KAFKA_BROKERS   comma-separated brokers (default localhost:9092)
 *   KAFKA_TOPIC     topic to publish to (default demo-events)
 *
 * A codec can be set on the client for every message, or passed per call when only
 * some messages use a different format. The per-call codec applies to that call
 * alone, so mixed-format topics can coexist on one client.
 *
 * Exits on its own once both batches are sent.
 */

import { createCodecAdapter, createKafkaClient } from "../src/index.js";

const prefixCodec = createCodecAdapter({
    name: "prefix",
    encode(value) {
        return Buffer.from(`p:${JSON.stringify(value)}`);
    },
    decode(bytes) {
        return JSON.parse(Buffer.from(bytes).toString().slice(2));
    },
});

const client = createKafkaClient({
    brokers: process.env.KAFKA_BROKERS ?? "localhost:9092",
    clientId: "example-producer",
});

const topic = process.env.KAFKA_TOPIC ?? "demo-events";

// Batched send with keys, using the client codec (JSON by default).
await client.send(topic, [
    { key: "user-1", value: { type: "created", userId: "user-1" } },
    { key: "user-2", value: { type: "updated", userId: "user-2" } },
]);

// A single message encoded with a codec that applies only to this call.
await client.send(topic, { packed: true }, { codec: prefixCodec });

await client.disconnect();
console.log(`sent messages to ${topic}`);
