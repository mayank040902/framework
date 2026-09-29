import test from "node:test";
import assert from "node:assert/strict";
import {
    createConfigAdapter,
    createKafka,
    getSslConfig,
    isKafkaConfigured,
    silentLogger,
} from "../src/index.js";
import { createLogCreator } from "../src/client/config.js";

test("config adapter driven configuration still works", () => {
    const config = createConfigAdapter({
        KAFKA_BROKERS: "localhost:9092,localhost:9093",
    });

    assert.equal(isKafkaConfigured({ config }), true);
    assert.equal(getSslConfig({ config }), undefined);
    const kafka = createKafka(silentLogger, { config });
    assert.equal(typeof kafka.producer, "function");
});

test("createKafka forwards every KafkaJS log shape to the logger", () => {
    const emitted = [];
    const emit = createLogCreator({
        error(message, extra) { emitted.push({ level: "error", message, extra }); },
        warn(message, extra) { emitted.push({ level: "warn", message, extra }); },
        info(message, extra) { emitted.push({ level: "info", message, extra }); },
        debug(message, extra) { emitted.push({ level: "debug", message, extra }); },
    })();

    const failure = new Error("broker refused");

    // KafkaJS passes a bare string for plain messages, an Error for failures, and an
    // object for structured entries. All three must arrive with the message first.
    emit({ level: 4, log: "Kafka producer connected" });
    emit({ level: 2, log: "retrying" });
    emit({ level: 5, log: { message: "sent", partition: 0 } });
    emit({ level: 1, log: failure });

    assert.deepEqual(emitted[0], { level: "info", message: "Kafka producer connected", extra: undefined });
    assert.deepEqual(emitted[1], { level: "warn", message: "retrying", extra: undefined });
    assert.equal(emitted[2].message, "sent");
    assert.deepEqual(emitted[2].extra, { partition: 0 });
    assert.equal(emitted[3].level, "error");
    assert.equal(emitted[3].message, "broker refused");
    assert.equal(emitted[3].extra.err, failure);
});
