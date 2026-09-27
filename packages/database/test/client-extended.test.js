import test from "node:test";
import assert from "node:assert/strict";

import { createClient, createHooks, createMetrics, TimeoutError } from "../src/index.js";

function makeClient(queryImpl) {
    const client = {
        calls: [],
        released: false,
        releaseError: undefined,
        async query(config, values) {
            client.calls.push({ config, values });
            if (queryImpl) {
                return queryImpl(config, values, client);
            }
            return { rows: [], rowCount: 0 };
        },
        release(error) {
            client.released = true;
            client.releaseError = error;
        },
    };
    return client;
}

function makePool(factory) {
    let index = 0;
    return {
        async connect() {
            const client = factory(index);
            index += 1;
            return client;
        },
    };
}

test("queryOne returns the first row or null", async () => {
    const client = makeClient(async () => ({ rows: [{ id: 1 }], rowCount: 1 }));
    const db = createClient(makePool(() => client));

    assert.deepEqual(await db.queryOne("SELECT * FROM users"), { id: 1 });

    const empty = makeClient(async () => ({ rows: [], rowCount: 0 }));
    const db2 = createClient(makePool(() => empty));
    assert.equal(await db2.queryOne("SELECT * FROM users"), null);
});

test("query does not retry by default", async () => {
    let attempts = 0;
    const db = createClient(makePool(() => makeClient(async () => {
        attempts += 1;
        throw Object.assign(new Error("serialization"), { code: "40001" });
    })));

    await assert.rejects(() => db.query("SELECT 1"));
    assert.equal(attempts, 1);
});

test("query retries genuinely transient errors when opted in", async () => {
    let attempts = 0;
    const db = createClient(makePool(() => makeClient(async () => {
        attempts += 1;
        if (attempts === 1) {
            throw Object.assign(new Error("serialization"), { code: "40001" });
        }
        return { rows: [{ ok: true }], rowCount: 1 };
    })));

    const result = await db.query("SELECT 1", [], {
        retry: { retries: 2, baseDelay: 1, jitter: 0 },
    });

    assert.equal(attempts, 2);
    assert.deepEqual(result.rows, [{ ok: true }]);
});

test("prepared statements send a named query config", async () => {
    const client = makeClient();
    const db = createClient(makePool(() => client));

    const statement = db.prepare("find_user", "SELECT * FROM users WHERE id = $1");
    await statement.execute([42]);

    assert.equal(client.calls[0].config.name, "find_user");
    assert.equal(client.calls[0].config.text, "SELECT * FROM users WHERE id = $1");
    assert.deepEqual(client.calls[0].config.values, [42]);
});

test("query timeout rejects and destroys the connection", async () => {
    const client = makeClient(() => new Promise(() => {}));
    const db = createClient(makePool(() => client), undefined, { timeout: 20 });

    await assert.rejects(
        () => db.query("SELECT pg_sleep(10)"),
        (error) => error instanceof TimeoutError,
    );

    assert.equal(client.released, true);
    assert.ok(client.releaseError instanceof Error);
});

test("connection errors destroy the client on release", async () => {
    const client = makeClient(async () => {
        throw Object.assign(new Error("connection terminated"), { code: "08006" });
    });
    const db = createClient(makePool(() => client));

    await assert.rejects(() => db.query("SELECT 1"));
    assert.equal(client.released, true);
    assert.equal(client.releaseError.code, "08006");
});

test("instrumentation hooks observe successful and failed queries", async () => {
    const metrics = createMetrics();
    const events = [];
    const hooks = createHooks({
        metrics,
        instrumentation: {
            onQuery: (event) => events.push(event),
            onError: (event) => events.push(event),
        },
    });

    const good = makeClient(async () => ({ rows: [], rowCount: 3 }));
    const db = createClient(makePool(() => good), undefined, { hooks });
    await db.query("SELECT 1");

    const bad = makeClient(async () => {
        throw Object.assign(new Error("syntax"), { code: "42601" });
    });
    const db2 = createClient(makePool(() => bad), undefined, { hooks });
    await assert.rejects(() => db2.query("SELECT nope"));

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.queries, 1);
    assert.equal(snapshot.errors, 1);
    assert.equal(events.length, 2);
    assert.equal(events[0].success, true);
    assert.equal(events[0].rowCount, 3);
});

test("logQueries does not leak parameter values by default", async () => {
    const logs = [];
    const logger = {
        debug: (payload) => logs.push(payload),
        error: () => {},
        warn: () => {},
        info: () => {},
    };
    const hooks = createHooks({ logger, logQueries: true });
    const client = makeClient();
    const db = createClient(makePool(() => client), undefined, { hooks });

    await db.query("SELECT * FROM users WHERE password = $1", ["secret"]);

    assert.equal(logs.length, 1);
    assert.equal(logs[0].sql, "SELECT * FROM users WHERE password = $1");
    assert.equal(logs[0].parameters, undefined);
    assert.equal(logs[0].parameterCount, 1);
});
