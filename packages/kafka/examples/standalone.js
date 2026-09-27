import {
    createKafkaClient,
    silentLogger,
} from "../src/index.js";

const brokers = process.env.KAFKA_BROKERS ?? "localhost:9092";
const topic = process.env.KAFKA_TOPIC ?? "demo-events";

const client = createKafkaClient({
    brokers,
    clientId: "standalone-example",
    groupId: "standalone-workers",
    logger: process.env.KAFKA_SILENT === "true" ? silentLogger : undefined,
});

const produced = await client.send(topic, {
    key: "story-1",
    value: { storyId: "story-1", action: "published" },
});

console.log("produced", produced);

await client.consume(topic, async ({ topic: name, key, value, partition, message }) => {
    console.log({
        topic: name,
        partition,
        offset: message.offset,
        key,
        value,
    });
}, { fromBeginning: true });

client.registerShutdown();
