import test from "node:test";
import assert from "node:assert/strict";

import { createTransaction, DatabaseError } from "../src/index.js";

function makeClient(store) {
    const client = {
        released: false,
        releaseError: undefined,
        async query(sql) {
            store.push(sql);
            return {};
        },
        release(error) {
            client.released = true;
            client.releaseError = error;
        },
    };
    return client;
}

test("transaction honours isolation and read-only options", async () => {
    const queries = [];
    const client = makeClient(queries);
    const { transaction } = createTransaction({ pool: { async connect() { return client; } } });

    await transaction(async () => "done", { isolation: "SERIALIZABLE", readOnly: true });

    assert.equal(queries[0], "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
    assert.equal(queries[queries.length - 1], "COMMIT");
});

test("transaction applies a local statement timeout", async () => {
    const queries = [];
    const client = makeClient(queries);
    const { transaction } = createTransaction({ pool: { async connect() { return client; } } });

    await transaction(async () => true, { timeout: 250 });

    assert.deepEqual(queries, ["BEGIN", "SET LOCAL statement_timeout = 250", "COMMIT"]);
});

test("transaction rejects invalid isolation levels", async () => {
    const client = makeClient([]);
    const { transaction } = createTransaction({ pool: { async connect() { return client; } } });

    await assert.rejects(
        () => transaction(async () => true, { isolation: "BOGUS" }),
        /Invalid isolation level/,
    );
    assert.equal(client.released, false);
});

test("transaction retries transient failures", async () => {
    let attempt = 0;
    const order = [];
    const pool = {
        async connect() {
            const index = attempt;
            attempt += 1;
            return {
                async query(sql) {
                    order.push(`${index}:${sql}`);
                    return {};
                },
                release() {},
            };
        },
    };

    const { transaction } = createTransaction({ pool });

    const result = await transaction(async () => {
        if (order.filter((entry) => entry.endsWith(":BEGIN")).length === 1) {
            throw Object.assign(new Error("serialization"), { code: "40001" });
        }
        return "committed";
    }, { retry: { retries: 1, baseDelay: 1, jitter: 0 } });

    assert.equal(result, "committed");
    assert.ok(order.includes("0:ROLLBACK"));
    assert.ok(order.includes("1:COMMIT"));
});

test("transaction destroys the connection when it fails with a connection error", async () => {
    const queries = [];
    const client = makeClient(queries);
    const { transaction } = createTransaction({ pool: { async connect() { return client; } } });

    await assert.rejects(
        () => transaction(async () => {
            throw Object.assign(new Error("terminated"), { code: "08006" });
        }),
        /terminated/,
    );

    assert.equal(client.released, true);
    assert.ok(client.releaseError instanceof DatabaseError);
    assert.equal(client.releaseError.code, "08006");
});

test("savepoint rejects unsafe names", async () => {
    const client = makeClient([]);
    const { savepoint } = createTransaction({ pool: { async connect() { return client; } } });

    await assert.rejects(
        () => savepoint(client, "1; DROP TABLE users", async () => {}),
        /Invalid savepoint name/,
    );
});
