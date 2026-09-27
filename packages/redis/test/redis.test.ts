import test from "node:test";
import assert from "node:assert/strict";

import { health, shutdown, silentLogger, createLogger } from "../dist/index.js";

test("health reports up when ping succeeds", async () => {
    const client = {
        async ping() {
            return "PONG";
        },
    };

    const result = await health(client);

    assert.equal(result.status, "up");
    assert.equal(result.latency.unit, "ms");
    assert.ok(result.latency.value >= 0);
});

test("health reports down when ping fails", async () => {
    const client = {
        async ping() {
            throw new Error("ECONNREFUSED");
        },
    };

    const result = await health(client);

    assert.equal(result.status, "down");
    assert.match(result.error, /ECONNREFUSED/);
});

test("shutdown quits a connected client", async () => {
    let quitCalled = false;
    const client = {
        async quit() {
            quitCalled = true;
        },
    };

    await shutdown(client);
    assert.equal(quitCalled, true);
});

test("shutdown is a no-op for a missing client", async () => {
    await shutdown(null);
    await shutdown(undefined);
});

test("shutdown propagates quit failures", async () => {
    const client = {
        async quit() {
            throw new Error("quit failed");
        },
    };

    await assert.rejects(() => shutdown(client), /quit failed/);
});

test("silentLogger has no output", () => {
    silentLogger.info("test");
    silentLogger.error("test");
    silentLogger.warn("test");
    silentLogger.debug("test");
    assert.ok(true);
});

test("createLogger wraps custom logger", () => {
    const custom = {
        info(msg: unknown, extra?: unknown) {
            return { msg, extra };
        },
        error(msg: unknown, extra?: unknown) {
            return { msg, extra };
        },
        warn(msg: unknown, extra?: unknown) {
            return { msg, extra };
        },
        debug(msg: unknown, extra?: unknown) {
            return { msg, extra };
        },
    };
    const logger = createLogger(custom);
    assert.ok(typeof logger.info === "function");
    assert.ok(typeof logger.error === "function");
});