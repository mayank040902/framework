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
