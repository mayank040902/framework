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

await client.send(topic, [
    { key: "user-1", value: { type: "created", userId: "user-1" } },
    { key: "user-2", value: { type: "updated", userId: "user-2" } },
]);

await client.send(topic, { packed: true }, { codec: prefixCodec });

await client.disconnect();
console.log(`sent messages to ${topic}`);
