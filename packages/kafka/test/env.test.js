import test from "node:test";
import assert from "node:assert/strict";
import { createConfigAdapter, envBoolean, envNumber, envString, parseBoolean } from "../src/index.js";

test("config adapter reads string, number, and boolean values", () => {
    const config = createConfigAdapter({
        KAFKA_TEST_STRING: "  hello  ",
        KAFKA_TEST_NUMBER: "42",
        KAFKA_TEST_BOOL: "true",
        KAFKA_BLANK: "   ",
    });

    assert.equal(config.string("KAFKA_TEST_STRING"), "hello");
    assert.equal(config.string("KAFKA_BLANK", "fallback"), "fallback");
    assert.equal(config.string("MISSING", "fallback"), "fallback");
    assert.equal(config.number("KAFKA_TEST_NUMBER", 1), 42);
    assert.equal(config.number("MISSING", 3), 3);
    assert.equal(config.boolean("KAFKA_TEST_BOOL"), true);
});

test("config adapter methods survive destructuring", () => {
    const { string, number, boolean, get } = createConfigAdapter({
        KAFKA_TEST_NUMBER: "42",
        KAFKA_TEST_BOOL: "yes",
        KAFKA_TEST_RAW: "  spaced  ",
    });

    assert.equal(string("KAFKA_TEST_RAW"), "spaced");
    assert.equal(number("KAFKA_TEST_NUMBER", 1), 42);
    assert.equal(number("MISSING", 3), 3);
    assert.equal(boolean("KAFKA_TEST_BOOL"), true);
    assert.equal(boolean("MISSING", true), true);
    assert.equal(get("KAFKA_TEST_RAW"), "  spaced  ");
});

test("parseBoolean normalises booleans and boolean-like strings", () => {
    assert.equal(parseBoolean(true), true);
    assert.equal(parseBoolean(false), false);
    assert.equal(parseBoolean("TRUE"), true);
    assert.equal(parseBoolean(" off "), false);
    assert.equal(parseBoolean("1"), true);
    assert.equal(parseBoolean(undefined, true), true);
    assert.equal(parseBoolean("maybe", true), true);
    assert.equal(parseBoolean("maybe", false), false);
});

test("env helpers read process environment", () => {
    const previous = {
        KAFKA_TEST_STRING: process.env.KAFKA_TEST_STRING,
        KAFKA_TEST_NUMBER: process.env.KAFKA_TEST_NUMBER,
        KAFKA_TEST_BOOL: process.env.KAFKA_TEST_BOOL,
    };

    process.env.KAFKA_TEST_STRING = "hello";
    process.env.KAFKA_TEST_NUMBER = "nope";
    process.env.KAFKA_TEST_BOOL = "0";

    try {
        assert.equal(envString("KAFKA_TEST_STRING"), "hello");
        assert.equal(envNumber("KAFKA_TEST_NUMBER", 7), 7);
        assert.equal(envBoolean("KAFKA_TEST_BOOL", true), false);
    } finally {
        restoreEnv(previous);
    }
});

function restoreEnv(previous) {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}
