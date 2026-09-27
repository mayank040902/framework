import test from "node:test";
import assert from "node:assert/strict";

import {
    createTransaction,
    createClient,
    createCheck,
    createSchemaManager,
} from "../src/index.js";

function makeFakePool(client) {
    return {
        async connect() {
            return client;
        },
    };
}

function makeFakeClient(queryImpl) {
    let released = false;

    const client = {
        released: () => released,
        async query(sql) {
            if (queryImpl) {
                return queryImpl(sql);
            }
            return {};
        },
        release() {
            released = true;
        },
    };

    return client;
}

test("transaction commits and returns the callback result", async () => {
    const queries = [];
    const client = makeFakeClient(async (sql) => {
        queries.push(sql);
        return {};
    });
    const pool = makeFakePool(client);

    const { transaction } = createTransaction({ pool });

    const result = await transaction(async (c) => {
        assert.equal(c, client);
        await c.query("UPDATE profiles SET name = $1", ["x"]);
        return { ok: true };
    });

    assert.deepEqual(queries, ["BEGIN", "UPDATE profiles SET name = $1", "COMMIT"]);
    assert.deepEqual(result, { ok: true });
    assert.equal(client.released(), true);
});

test("transaction rolls back and rethrows when the callback fails", async () => {
    const queries = [];
    const client = makeFakeClient(async (sql) => {
        queries.push(sql);
        return {};
    });
    const pool = makeFakePool(client);

    const { transaction } = createTransaction({ pool });

    await assert.rejects(
        () => transaction(async () => {
            throw new Error("boom");
        }),
        /boom/,
    );

    assert.deepEqual(queries, ["BEGIN", "ROLLBACK"]);
    assert.equal(client.released(), true);
});

test("transaction logs a failed rollback but still rethrows", async () => {
    const client = makeFakeClient(async (sql) => {
        if (sql === "ROLLBACK") {
            throw new Error("rollback failed");
        }
        return {};
    });
    const pool = makeFakePool(client);

    const { transaction } = createTransaction({ pool, logger: { error() {} } });

    await assert.rejects(
        () => transaction(async () => {
            throw new Error("boom");
        }),
        /boom/,
    );
});

test("savepoint releases on success", async () => {
    const queries = [];
    const client = makeFakeClient(async (sql) => {
        queries.push(sql);
        return {};
    });

    const { savepoint } = createTransaction({ pool: makeFakePool(client) });

    const result = await savepoint(client, "sp1", async () => "inner");

    assert.equal(result, "inner");
    assert.deepEqual(queries, ["SAVEPOINT sp1", "RELEASE SAVEPOINT sp1"]);
});

test("savepoint rolls back to savepoint on failure", async () => {
    const queries = [];
    const client = makeFakeClient(async (sql) => {
        queries.push(sql);
        return {};
    });

    const { savepoint } = createTransaction({ pool: makeFakePool(client) });

    await assert.rejects(
        () => savepoint(client, "sp1", async () => {
            throw new Error("inner boom");
        }),
        /inner boom/,
    );

    assert.deepEqual(queries, ["SAVEPOINT sp1", "ROLLBACK TO SAVEPOINT sp1"]);
});

test("createClient.query acquires, queries and releases", async () => {
    let released = false;
    const pool = makeFakePool({
        async query() {
            return { rows: [{ id: 1 }] };
        },
        release() {
            released = true;
        },
    });

    const client = createClient(pool);
    const result = await client.query("SELECT * FROM users WHERE id = $1", [1]);

    assert.deepEqual(result.rows, [{ id: 1 }]);
    assert.equal(released, true);
});

test("createCheck reports up for a healthy pool", async () => {
    const pool = {
        async query(sql) {
            assert.equal(sql, "SELECT 1");
            return {};
        },
    };

    const { check } = createCheck(pool);
    const result = await check();

    assert.equal(result.status, "up");
    assert.equal(result.latency.unit, "ms");
});

test("createCheck reports down when the pool errors", async () => {
    const pool = {
        async query() {
            throw new Error("connection refused");
        },
    };

    const { check } = createCheck(pool);
    const result = await check();

    assert.equal(result.status, "down");
    assert.match(result.error, /connection refused/);
});

test("createSchemaManager.table builds and runs CREATE TABLE", async () => {
    const queries = [];
    const pool = {
        async query(sql) {
            queries.push(sql);
        },
    };

    const manager = createSchemaManager(pool);
    await manager.create.table("users", {
        id: "UUID PRIMARY KEY",
        name: "TEXT NOT NULL",
    });

    assert.match(queries[0], /CREATE TABLE IF NOT EXISTS users/);
    assert.match(queries[0], /id UUID PRIMARY KEY/);
    assert.match(queries[0], /name TEXT NOT NULL/);
});
