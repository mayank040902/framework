/**
 * Codec adapter: a client-level codec applied to every message.
 *
 *   npx tsx examples/codec-adapter.js
 *
 * Environment:
 *   KAFKA_BROKERS   comma-separated brokers (default localhost:9092)
 *
 * A codec is any object with `encode(value)` and `decode(bytes)`. Here the client
 * uses a codec that prefixes every payload, so both producing and consuming on this
 * client agree on the format.
 *
 * The process stays running until you stop it with Ctrl-C.
 */

import { createCodecAdapter, createKafkaClient } from "../src/index.js";

const codec = createCodecAdapter({
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
    clientId: "codec-example",
    groupId: "codec-workers",
    codec,
});

await client.send("demo-events", { hello: "adapter" });

await client.consume("demo-events", async ({ value }) => {
    console.log(value);
}, { fromBeginning: true });

client.registerShutdown();
