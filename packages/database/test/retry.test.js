import test from "node:test";
import assert from "node:assert/strict";

import { withRetry, createRetry } from "../src/index.js";

function transientError() {
    return Object.assign(new Error("serialization failure"), { code: "40001" });
}

test("withRetry retries transient errors until success", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
        attempts += 1;
        if (attempts < 3) {
            throw transientError();
        }
        return "ok";
    }, { retries: 5, baseDelay: 1, jitter: 0 });

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
});

test("withRetry does not retry non-transient errors", async () => {
    let attempts = 0;
    await assert.rejects(
        () => withRetry(async () => {
            attempts += 1;
            throw Object.assign(new Error("unique"), { code: "23505" });
        }, { retries: 5, baseDelay: 1, jitter: 0 }),
        /unique/,
    );
    assert.equal(attempts, 1);
});

test("withRetry gives up after the configured number of retries", async () => {
    let attempts = 0;
    await assert.rejects(
        () => withRetry(async () => {
            attempts += 1;
            throw transientError();
        }, { retries: 2, baseDelay: 1, jitter: 0 }),
    );
    assert.equal(attempts, 3);
});

test("withRetry invokes the onRetry hook with backoff metadata", async () => {
    const seen = [];
    let attempts = 0;

    await withRetry(async () => {
        attempts += 1;
        if (attempts < 2) {
            throw transientError();
        }
        return true;
    }, {
        retries: 3,
        baseDelay: 1,
        jitter: 0,
        onRetry: (info) => seen.push(info),
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].attempt, 1);
    assert.equal(seen[0].error.code, "40001");
});

test("withRetry honours an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        () => withRetry(async () => "never", {
            retries: 2,
            signal: controller.signal,
        }),
        /aborted/i,
    );
});

test("createRetry binds defaults", async () => {
    let attempts = 0;
    const retry = createRetry({ retries: 1, baseDelay: 1, jitter: 0 });

    await assert.rejects(
        () => retry.run(async () => {
            attempts += 1;
            throw transientError();
        }),
    );
    assert.equal(attempts, 2);
    assert.equal(retry.isTransient({ code: "40001" }), true);
});
