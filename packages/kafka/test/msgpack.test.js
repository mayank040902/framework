import test from "node:test";
import assert from "node:assert/strict";
import {
    KafkaConfigError,
    createCodecAdapter,
    createKafkaMessage,
    createKafkaMessageString,
    decode,
    decodeFromString,
    encode,
    encodeToString,
    jsonCodec,
    parseKafkaMessage,
    parseKafkaMessageString,
} from "../src/index.js";

test("json codec round-trips objects", () => {
    const payload = { id: 7, tags: ["a", "b"], ok: true };
    const encoded = encode(payload);
    assert.equal(Buffer.isBuffer(encoded), true);
    assert.deepEqual(decode(encoded), payload);
});

test("string helpers round-trip through base64", () => {
    const payload = { hello: "world" };
    const encoded = encodeToString(payload);
    assert.equal(typeof encoded, "string");
    assert.deepEqual(decodeFromString(encoded), payload);
});

test("createKafkaMessage and parseKafkaMessage round-trip", () => {
    const message = createKafkaMessage("user-1", { type: "created" });
    assert.equal(Buffer.isBuffer(message.key), true);
    assert.equal(Buffer.isBuffer(message.value), true);
    assert.deepEqual(parseKafkaMessage(message), {
        key: "user-1",
        value: { type: "created" },
    });
});

test("string message helpers round-trip", () => {
    const message = createKafkaMessageString("user-1", { type: "created" });
    assert.deepEqual(parseKafkaMessageString(message), {
        key: "user-1",
        value: { type: "created" },
    });
});

test("parse helpers tolerate missing keys and values", () => {
    assert.deepEqual(parseKafkaMessage({}), { key: undefined, value: undefined });
    assert.deepEqual(parseKafkaMessageString({}), { key: undefined, value: undefined });
    assert.equal(decode(undefined), undefined);
    assert.equal(decodeFromString(undefined), undefined);
});

test("custom codec adapters can be injected", () => {
    const codec = {
        name: "prefix",
        encode(value) {
            return Buffer.from(`p:${JSON.stringify(value)}`);
        },
        decode(bytes) {
            return JSON.parse(Buffer.from(bytes).toString().slice(2));
        },
    };

    const adapter = createCodecAdapter(codec);
    const encoded = adapter.encode({ packed: true });
    assert.deepEqual(adapter.decode(encoded), { packed: true });
    assert.equal(jsonCodec.name, "json");
});

test("unknown codec names throw", () => {
    assert.throws(() => createCodecAdapter("msgpack"), KafkaConfigError);
});
