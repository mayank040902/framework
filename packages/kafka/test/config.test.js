import test from "node:test";
import assert from "node:assert/strict";
import {
    createConfigAdapter,
    createKafka,
    isKafkaConfigured,
    parseBrokers,
    KafkaConfigError,
    silentLogger,
} from "../src/index.js";

test("parseBrokers splits and trims broker lists", () => {
    assert.deepEqual(parseBrokers("kafka1:9092, kafka2:9092"), ["kafka1:9092", "kafka2:9092"]);
    assert.deepEqual(parseBrokers([" kafka1:9092 ", "kafka2:9092"]), ["kafka1:9092", "kafka2:9092"]);
});

test("parseBrokers throws when empty", () => {
    assert.throws(() => parseBrokers("   "), KafkaConfigError);
    assert.throws(() => parseBrokers([]), KafkaConfigError);
});

test("isKafkaConfigured is true when brokers are set", () => {
    const config = createConfigAdapter({ KAFKA_BROKERS: "localhost:9092,localhost:9093" });
    assert.equal(isKafkaConfigured({ config }), true);
});

test("isKafkaConfigured is false when brokers are missing", () => {
    const config = createConfigAdapter({});
    assert.equal(isKafkaConfigured({ config }), false);
});

test("isKafkaConfigured is false for a blank value", () => {
    const config = createConfigAdapter({ KAFKA_BROKERS: "   " });
    assert.equal(isKafkaConfigured({ config }), false);
});

test("createKafka throws when brokers are not configured", () => {
    const config = createConfigAdapter({});
    assert.throws(() => createKafka(silentLogger, { config }), /KAFKA_BROKERS/);
});

test("createKafka builds a client from a config adapter and from options", () => {
    const config = createConfigAdapter({
        KAFKA_BROKERS: "kafka1:9092",
        KAFKA_CLIENT_ID: "writer-test",
    });
    const kafka = createKafka(silentLogger, { config });
    assert.equal(typeof kafka.producer, "function");
    assert.equal(typeof kafka.consumer, "function");
    assert.equal(typeof kafka.admin, "function");

    const independent = createKafka({
        brokers: ["kafka1:9092", "kafka2:9092"],
        clientId: "standalone",
        logger: silentLogger,
    });
    assert.equal(typeof independent.producer, "function");
});
