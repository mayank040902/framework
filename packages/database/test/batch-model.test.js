import test from "node:test";
import assert from "node:assert/strict";

import { createBatch, createModel } from "../src/index.js";

function captureQuery(resultFactory) {
    const calls = [];
    const query = async (text, values, options) => {
        calls.push({ text, values, options });
        return resultFactory ? resultFactory(text, values) : { rows: [], rowCount: 0 };
    };
    query.calls = calls;
    return query;
}

test("insertMany builds a parameterized multi-row insert", async () => {
    const query = captureQuery(() => ({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }));
    const batch = createBatch({ query });

    const rows = await batch.insertMany("users", [{ a: 1, b: 2 }, { a: 3, b: 4 }], {
        returning: ["id"],
    });

    assert.equal(query.calls.length, 1);
    assert.equal(
        query.calls[0].text,
        'INSERT INTO "users" ("a", "b") VALUES ($1, $2), ($3, $4) RETURNING "id"',
    );
    assert.deepEqual(query.calls[0].values, [1, 2, 3, 4]);
    assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
});

test("insertMany chunks large batches", async () => {
    const query = captureQuery((text, values) => ({ rows: [{ a: values[0] }], rowCount: 1 }));
    const batch = createBatch({ query });

    await batch.insertMany("t", [{ a: 1 }, { a: 2 }, { a: 3 }], {
        chunkSize: 2,
        returning: ["a"],
    });

    assert.equal(query.calls.length, 2);
    assert.deepEqual(query.calls[0].values, [1, 2]);
    assert.deepEqual(query.calls[1].values, [3]);
});

test("insertMany returns the row count when no returning clause is used", async () => {
    const query = captureQuery(() => ({ rows: [], rowCount: 1 }));
    const batch = createBatch({ query });

    const count = await batch.insertMany("t", [{ a: 1 }, { a: 2 }]);
    assert.equal(count, 2);
});

test("insertMany handles empty input and conflicts", async () => {
    const query = captureQuery();
    const batch = createBatch({ query });

    assert.deepEqual(await batch.insertMany("t", []), []);

    await batch.insertMany("t", [{ a: 1 }], { onConflict: { columns: ["a"], do: "nothing" } });
    assert.match(query.calls[0].text, /ON CONFLICT \("a"\) DO NOTHING/);
});

test("insertMany runs inside a managed transaction when requested", async () => {
    const query = captureQuery();
    const seen = [];
    const transaction = async (callback) => {
        seen.push("begin");
        await callback({ query: async (text, values) => { seen.push({ text, values }); return { rows: [] }; } });
        seen.push("commit");
    };

    const batch = createBatch({ query, transaction });
    await batch.insertMany("t", [{ a: 1 }], { transaction: true });

    assert.equal(seen[0], "begin");
    assert.equal(seen[seen.length - 1], "commit");
    assert.equal(query.calls.length, 0);
});

test("model exposes CRUD helpers over the query function", async () => {
    const query = captureQuery((text) => {
        if (/COUNT/.test(text)) {
            return { rows: [{ count: 4 }], rowCount: 1 };
        }
        if (/SELECT 1 AS exists/.test(text)) {
            return { rows: [{ exists: 1 }], rowCount: 1 };
        }
        if (/INSERT/.test(text)) {
            return { rows: [{ id: 7, name: "x" }], rowCount: 1 };
        }
        if (/UPDATE/.test(text)) {
            return { rows: [{ id: 7, name: "y" }], rowCount: 1 };
        }
        return { rows: [{ id: 7 }], rowCount: 1 };
    });

    const users = createModel({ query, table: "users" });

    assert.deepEqual(await users.find({ status: "active" }), [{ id: 7 }]);
    assert.deepEqual(await users.findOne({ id: 7 }), { id: 7 });
    assert.deepEqual(await users.findById(7), { id: 7 });
    assert.deepEqual(await users.insert({ name: "x" }), { id: 7, name: "x" });
    assert.deepEqual(await users.updateById(7, { name: "y" }), { id: 7, name: "y" });
    assert.deepEqual(await users.deleteById(7), { id: 7 });
    assert.equal(await users.count(), 4);
    assert.equal(await users.exists({ id: 7 }), true);
});

test("model can run against an explicit transaction client", async () => {
    const query = captureQuery();
    const client = {
        async query(text, values) {
            client.seen = { text, values };
            return { rows: [{ id: 1 }] };
        },
    };

    const users = createModel({ query, table: "users" });
    const rows = await users.findById(1, { client });

    assert.deepEqual(rows, { id: 1 });
    assert.deepEqual(client.seen.values, [1, 1]);
    assert.equal(query.calls.length, 0);
});
