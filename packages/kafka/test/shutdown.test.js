import test from "node:test";
import assert from "node:assert/strict";
import { registerShutdown, shutdownClient, silentLogger, createKafkaClient } from "../src/index.js";
import { createMockKafka, memoryLogger } from "./helpers.js";

test("shutdownClient disconnects a client with or without a logger", async () => {
    const kafka = createMockKafka();
    await shutdownClient(kafka._producer, "Kafka producer");
    assert.equal(kafka._producer.disconnectCalls, 1);

    const logger = memoryLogger();
    await shutdownClient(logger, kafka._admin, "Kafka admin");
    assert.equal(kafka._admin.disconnectCalls, 1);
    assert.ok(logger.entries.some((entry) => entry.message === "Kafka admin disconnected"));
});

test("the shutdown handler is idempotent", async () => {
    const kafka = createMockKafka();
    const handle = registerShutdown(silentLogger, {
        producer: kafka._producer,
        consumer: kafka._consumer,
        exit: false,
    });

    await handle("SIGTERM");
    await handle("SIGINT");

    assert.equal(kafka._producer.disconnectCalls, 1);
    assert.equal(kafka._consumer.disconnectCalls, 1);
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
});

test("registerShutdown disconnects clients created after registration", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    const handle = client.registerShutdown({ exit: false });
    await client.getProducer();
    await client.getAdmin();
    await handle("SIGTERM");

    assert.equal(kafka._producer.disconnectCalls, 1);
    assert.equal(kafka._admin.disconnectCalls, 1);
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
});

test("registerShutdown disconnects registered clients without exiting", async () => {
    const kafka = createMockKafka();
    const handle = registerShutdown(silentLogger, {
        producer: kafka._producer,
        consumer: kafka._consumer,
        admin: kafka._admin,
        exit: false,
    });

    await handle("SIGTERM");
    assert.equal(kafka._producer.disconnectCalls, 1);
    assert.equal(kafka._consumer.disconnectCalls, 1);
    assert.equal(kafka._admin.disconnectCalls, 1);
});
