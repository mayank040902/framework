import test from "node:test";
import assert from "node:assert/strict";
import {
    createConfigAdapter,
    createKafka,
    getSslConfig,
    isKafkaConfigured,
    silentLogger,
} from "../src/index.js";

test("config adapter driven configuration still works", () => {
    const config = createConfigAdapter({
        KAFKA_BROKERS: "localhost:9092,localhost:9093",
    });

    assert.equal(isKafkaConfigured({ config }), true);
    assert.equal(getSslConfig({ config }), undefined);
    const kafka = createKafka(silentLogger, { config });
    assert.equal(typeof kafka.producer, "function");
});
