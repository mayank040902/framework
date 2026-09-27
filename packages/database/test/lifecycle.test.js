import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
    createCheck,
    createShutdown,
    createStream,
    createCursor,
    TimeoutError,
} from "../src/index.js";

test("check reports pool statistics when available", async () => {
    const pool = {
        totalCount: 3,
        idleCount: 2,
        waitingCount: 0,
        async query() {
            return {};
        },
    };

    const { check, health } = createCheck(pool);

    const result = await check();
    assert.equal(result.status, "up");
    assert.deepEqual(result.pool, { total: 3, idle: 2, waiting: 0 });

    const detailed = await health();
    assert.equal(detailed.healthy, true);
    assert.equal(detailed.error, null);
    assert.ok(detailed.checkedAt);
});

test("health surfaces the error code when down", async () => {
    const pool = {
        async query() {
            throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
        },
    };

    const { health } = createCheck(pool);
    const result = await health();

    assert.equal(result.healthy, false);
    assert.equal(result.error, "refused");
    assert.equal(result.errorCode, "ECONNREFUSED");
});

test("shutdown is idempotent across concurrent and repeated calls", async () => {
    let ended = 0;
    const pool = {
        async end() {
            ended += 1;
        },
    };

    const { shutdown } = createShutdown(pool);
    await Promise.all([shutdown(), shutdown(), shutdown()]);
    await shutdown();

    assert.equal(ended, 1);
});

test("shutdown rejects with a TimeoutError when the pool will not close", async () => {
    const pool = {
        end() {
            return new Promise(() => {});
        },
    };

    const { shutdown } = createShutdown(pool);
    await assert.rejects(() => shutdown({ timeout: 20 }), (error) => error instanceof TimeoutError);
});

test("stream releases the connection on end", async () => {
    let client;
    const pool = {
        async connect() {
            const emitter = new EventEmitter();
            emitter.destroy = () => {};
            client = {
                released: false,
                async query() {
                    setImmediate(() => emitter.emit("end"));
                    return emitter;
                },
                release() {
                    client.released = true;
                },
            };
            return client;
        },
    };

    const { stream } = createStream(pool);
    const result = await stream("SELECT 1");
    assert.ok(result);

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(client.released, true);
});

test("stream releases (and destroys) the connection on connection error", async () => {
    let client;
    const pool = {
        async connect() {
            const emitter = new EventEmitter();
            emitter.destroy = () => {};
            client = {
                released: false,
                releaseError: undefined,
                async query() {
                    setImmediate(() => emitter.emit("error", Object.assign(new Error("gone"), { code: "08006" })));
                    return emitter;
                },
                release(error) {
                    client.released = true;
                    client.releaseError = error;
                },
            };
            return client;
        },
    };

    const { stream } = createStream(pool, { error() {} });
    await stream("SELECT 1");
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(client.released, true);
    assert.equal(client.releaseError.code, "08006");
});

test("cursor reads batches and releases on close", async () => {
    let closed = false;
    let client;
    const batches = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];

    const pool = {
        async connect() {
            client = {
                released: false,
                async query() {
                    let index = 0;
                    return {
                        read(count, callback) {
                            setImmediate(() => callback(null, batches[index++] ?? []));
                        },
                        close(callback) {
                            closed = true;
                            setImmediate(() => callback(null));
                        },
                    };
                },
                release() {
                    client.released = true;
                },
            };
            return client;
        },
    };

    const { cursor } = createCursor(pool);
    const handle = await cursor("SELECT * FROM t");

    assert.deepEqual(await handle.read(2), [{ id: 1 }, { id: 2 }]);
    await handle.close();

    assert.equal(closed, true);
    assert.equal(client.released, true);
});

test("cursor supports async iteration and releases at the end", async () => {
    let client;
    const batches = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];

    const pool = {
        async connect() {
            client = {
                released: false,
                async query() {
                    let index = 0;
                    return {
                        read(count, callback) {
                            setImmediate(() => callback(null, batches[index++] ?? []));
                        },
                        close(callback) {
                            setImmediate(() => callback(null));
                        },
                    };
                },
                release() {
                    client.released = true;
                },
            };
            return client;
        },
    };

    const { cursor } = createCursor(pool);
    const handle = await cursor("SELECT * FROM t");

    const rows = [];
    for await (const row of handle) {
        rows.push(row);
    }

    assert.deepEqual(rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assert.equal(client.released, true);
});
