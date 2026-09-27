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
        partition,
        key,
        value,
    });
}, { fromBeginning: true });

client.registerShutdown();
