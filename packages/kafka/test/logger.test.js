import test from "node:test";
import assert from "node:assert/strict";
import { createLoggerAdapter, isLogger, silentLogger } from "../src/index.js";
import { resolveLoggerAndOptions } from "../src/adapters/logger.js";

test("isLogger detects logger-like objects", () => {
    assert.equal(isLogger(silentLogger), true);
    assert.equal(isLogger({ info() {} }), true);
    assert.equal(isLogger({ brokers: "localhost:9092", info() {} }), false);
    assert.equal(isLogger({ groupId: "workers" }), false);
    assert.equal(isLogger(null), false);
});

test("createLoggerAdapter wraps framework loggers", () => {
    const calls = [];
    const pinoLike = {
        child() {
            return this;
        },
        info(extra, message) {
            calls.push({ extra, message });
        },
        error() {},
        warn() {},
        debug() {},
    };

    const logger = createLoggerAdapter(pinoLike);
    logger.info("connected", { clientId: "demo" });
    assert.deepEqual(calls[0], { extra: { clientId: "demo" }, message: "connected" });
});

test("createLoggerAdapter wraps a function logger", () => {
    const calls = [];
    const logger = createLoggerAdapter((level, message, extra) => {
        calls.push({ level, message, extra });
    });
    logger.warn("slow", { ms: 12 });
    assert.deepEqual(calls[0], { level: "warn", message: "slow", extra: { ms: 12 } });
});

test("resolveLoggerAndOptions accepts logger-first or options-first APIs", () => {
    const logger = { info() {}, error() {} };
    const fromLogger = resolveLoggerAndOptions(logger, { brokers: "localhost:9092" });
    assert.equal(typeof fromLogger.logger.info, "function");
    assert.equal(fromLogger.options.brokers, "localhost:9092");

    const fromOptions = resolveLoggerAndOptions({ logger, brokers: "kafka:9092" });
    assert.equal(fromOptions.options.brokers, "kafka:9092");
});
