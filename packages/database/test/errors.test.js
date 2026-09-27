import test from "node:test";
import assert from "node:assert/strict";

import {
    DatabaseError,
    TimeoutError,
    normalizeError,
    isDatabaseError,
    isTransientError,
    isUniqueViolation,
    isForeignKeyViolation,
    isConnectionError,
    isConstraintViolation,
    isSerializationFailure,
    isDeadlock,
} from "../src/index.js";

test("normalizeError wraps driver errors into a DatabaseError", () => {
    const cause = Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "uq_users_email",
        table: "users",
        detail: "Key (email) already exists.",
    });

    const error = normalizeError(cause);

    assert.ok(error instanceof DatabaseError);
    assert.equal(error.name, "DatabaseError");
    assert.equal(error.code, "23505");
    assert.equal(error.constraint, "uq_users_email");
    assert.equal(error.table, "users");
    assert.equal(error.cause, cause);
    assert.equal(isUniqueViolation(error), true);
    assert.equal(isConstraintViolation(error), true);
});

test("normalizeError is idempotent", () => {
    const error = normalizeError(new Error("x"));
    assert.equal(normalizeError(error), error);
    assert.equal(isDatabaseError(error), true);
});

test("isTransientError detects retryable PostgreSQL classes", () => {
    assert.equal(isTransientError({ code: "40001" }), true);
    assert.equal(isTransientError({ code: "40P01" }), true);
    assert.equal(isTransientError({ code: "08006" }), true);
    assert.equal(isTransientError({ code: "57P03" }), true);
    assert.equal(isTransientError({ code: "ECONNREFUSED" }), true);
    assert.equal(isTransientError(new TimeoutError()), true);
    assert.equal(isTransientError({ code: "23505" }), false);
    assert.equal(isTransientError(null), false);
});

test("specific classifiers work", () => {
    assert.equal(isForeignKeyViolation({ code: "23503" }), true);
    assert.equal(isSerializationFailure({ code: "40001" }), true);
    assert.equal(isDeadlock({ code: "40P01" }), true);
    assert.equal(isConnectionError({ code: "08001" }), true);
    assert.equal(isConnectionError({ code: "23505" }), false);
});

test("TimeoutError carries timeout metadata and is transient", () => {
    const error = new TimeoutError("too slow", { timeout: 50 });
    assert.equal(error.timeout, 50);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.transient, true);
});

test("DatabaseError serializes without leaking the cause", () => {
    const error = normalizeError(Object.assign(new Error("boom"), { code: "42601" }));
    const json = error.toJSON();
    assert.equal(json.message, "boom");
    assert.equal(json.code, "42601");
    assert.equal(json.cause, undefined);
});
