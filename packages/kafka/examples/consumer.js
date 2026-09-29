/**
 * Consumer: decoding messages and reading KafkaJS metadata.
 *
 *   npx tsx examples/consumer.js
 *
 * Environment:
 *   KAFKA_BROKERS   comma-separated brokers (default localhost:9092)
 *   KAFKA_TOPIC     topic to consume (default demo-events)
 *   KAFKA_GROUP_ID  consumer group (default example-workers)
 *
 * The handler receives decoded `key` and `value` at the top level, plus a `message`
 * object carrying the original offset, timestamp, and headers. The offset is what
 * you need for manual commits; the decoded value is what you need to do work.
 *
 * The process stays running until you stop it with Ctrl-C.
 */

import { createKafkaClient } from "../src/index.js";

const client = createKafkaClient({
    brokers: process.env.KAFKA_BROKERS ?? "localhost:9092",
    clientId: "example-consumer",
    groupId: process.env.KAFKA_GROUP_ID ?? "example-workers",
});

const topic = process.env.KAFKA_TOPIC ?? "demo-events";

await client.consume(topic, async ({ key, value, partition, message }) => {
    console.log({
        offset: message.offset,
        timestamp: message.timestamp,
        headers: message.headers,
        partition,
        key,
        value,
    });
}, { fromBeginning: true });

client.registerShutdown();
