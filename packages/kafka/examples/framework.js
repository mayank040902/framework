/**
 * Framework: the low-level factories with a Pino-style logger.
 *
 *   npx tsx examples/framework.js
 *
 * Environment:
 *   KAFKA_BROKERS   comma-separated brokers (default localhost:9092)
 *   KAFKA_TOPIC     topic to use (default demo-events)
 *
 * Reach for the low-level API when you want the KafkaJS objects themselves rather
 * than the managed client. Each factory accepts a logger, a plain options object, or
 * both, and returns a connected client.
 *
 * The process stays running until you stop it with Ctrl-C.
 */

import {
    createKafka,
    createProducer,
    createConsumer,
    subscribeToTopic,
    consumeMessages,
    registerShutdown,
} from "../src/index.js";

// Pino-style: bindings first, message second, and a child() method. A real Pino
// logger omits the bindings argument when there is nothing to bind, so the library
// can call `info(undefined, "message")` for a plain message.
function write(level, message, bindings) {
    if (bindings === undefined) {
        console[level](message);
        return;
    }
    console[level](message, bindings);
}

const logger = {
    error(bindings, message) {
        write("error", message, bindings);
    },
    warn(bindings, message) {
        write("warn", message, bindings);
    },
    info(bindings, message) {
        write("info", message, bindings);
    },
    debug(bindings, message) {
        write("debug", message, bindings);
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
