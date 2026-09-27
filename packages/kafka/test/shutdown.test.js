import test from "node:test";
import assert from "node:assert/strict";
import { registerShutdown, shutdownClient, silentLogger } from "../src/index.js";
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
