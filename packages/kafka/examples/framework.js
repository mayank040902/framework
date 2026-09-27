import {
    createKafka,
    createProducer,
    createConsumer,
    subscribeToTopic,
    consumeMessages,
    registerShutdown,
} from "../src/index.js";

const logger = {
    error(bindings, message) {
        console.error(message, bindings);
    },
    warn(bindings, message) {
        console.warn(message, bindings);
    },
    info(bindings, message) {
        console.info(message, bindings);
    },
    debug(bindings, message) {
        console.debug(message, bindings);
    },
    child() {
        return this;
    },
};

const kafka = createKafka(logger, {
    brokers: process.env.KAFKA_BROKERS ?? "localhost:9092",
    clientId: "framework-example",
});

const producer = await createProducer(kafka, logger);
const consumer = await createConsumer(kafka, logger, "framework-workers");
const topic = process.env.KAFKA_TOPIC ?? "demo-events";

await producer.send({
    topic,
    messages: [
        {
            key: "story-1",
            value: JSON.stringify({ storyId: "story-1", action: "published" }),
        },
    ],
});

await subscribeToTopic(consumer, logger, topic);
await consumeMessages(consumer, logger, async ({ topic: name, message }) => {
    logger.info({ topic: name, offset: message.offset }, "received event");
});

registerShutdown(logger, { producer, consumer });
