import test from "node:test";
import assert from "node:assert/strict";

import {
    encode,
    decode,
    encodeToString,
    decodeFromString,
    serializeRow,
    deserializeRow,
    serializeQueryResult,
    deserializeQueryResult,
} from "../src/index.js";

test("row serialization round-trips without an external msgpack package", () => {
    const row = { id: 1, email: "a@b.c", nested: { ok: true } };
    const restored = deserializeRow(serializeRow(row));
    assert.deepEqual(restored, row);
});

test("query result serialization round-trips", () => {
    const result = {
        rows: [{ id: 2 }],
        rowCount: 1,
        fields: [{ name: "id" }],
    };

    assert.deepEqual(deserializeQueryResult(serializeQueryResult(result)), result);
});

test("string helpers round-trip JSON payloads", () => {
    const value = { hello: "world" };
    assert.deepEqual(decodeFromString(encodeToString(value)), value);
    assert.deepEqual(decode(encode(value)), value);
});
