import { Writable } from "node:stream";

import { createLogger, createChildLogger, redactLogObject } from "../../dist/index.js";

/**
 * Core API walkthrough.
 *
 * Run with:
 *   npm run build && npx tsx examples/ts/logger-example.ts
 *
 * Everything printed here is real emitted output. The redaction examples are
 * the point of the package: each of them logs a secret and the sink shows
 * `[REDACTED]` in its place.
 */

async function main() {
    // Every logger below writes to this buffer instead of stdout, purely so the
    // example's output stays in a readable order: pino writes to a stream
    // asynchronously while `console.log` is synchronous, and interleaving the
    // two jumbles the sections. Omit `destination` in real code and output goes
    // to stdout.
    const lines: string[] = [];
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            const text = chunk.toString().trim();
            if (text) {
                lines.push(text);
            }
            callback();
        },
    });

    const section = (title: string) => lines.push(`\n--- ${title} ---`);

    // 1. Modes. `production` is the default; `development` raises the level to
    //    `trace`, and `test` silences output entirely.
    section("1. modes");
    const logger = createLogger({ mode: "development", destination: stream });

    logger.debug("visible in development, filtered in production");
    logger.info({ service: "billing" }, "logger initialized");

    // 2. Redaction at any depth, in every mode, regardless of key casing.
    //    Only the masked values reach the sink.
    section("2. redaction at depth, in arrays, any casing");
    logger.info({
        user: {
            name: "alice",
            credentials: { password: "hunter2", apiKey: "ak_live_123" },
        },
        tenants: [{ name: "acme", secrets: [{ token: "tkn_abc" }] }],
    }, "secrets are masked; harmless fields are not");

    // 3. Child loggers inherit redaction, level formatting, the timestamp, and
    //    the base bindings. Bindings are redacted before pino pre-serializes
    //    them, which is why `sessionId` below is masked even though bindings
    //    never reach `formatters.log`.
    section("3. child loggers");
    const child = logger.child({ requestId: "req-abc-123", sessionId: "sess_secret" });
    child.info({ userId: "u_1" }, "child keeps parent behaviour; sessionId is masked");

    // `createChildLogger` is the same thing, and is a no-op for empty bindings
    // (pino throws on `child()` with no arguments).
    createChildLogger(logger, { tenant: "acme" }).info("via createChildLogger");

    // 4. Errors keep their diagnostic value. `message` and `stack` survive even
    //    though a sensitive property on the error is masked.
    section("4. errors keep their message and stack");
    try {
        throw Object.assign(new Error("Payment provider timed out"), {
            provider: "stripe",
            apiKey: "sk_live_leaked",
        });
    } catch (error) {
        logger.error({ err: error }, "upstream call failed");
    }

    // 5. A pino escape hatch for anything this package does not model. The
    //    override is honoured (`messageKey: "message"`), and redaction is
    //    re-applied afterwards.
    section("5. pino escape hatch");
    const custom = createLogger({
        mode: "production",
        destination: stream,
        pino: { messageKey: "message" },
    });
    custom.warn({ password: "hunter2" }, "override honoured, redaction still applied");

    // 6. `redactLogObject` is exported for callers who need the same masking
    //    outside a log call. It never mutates its input.
    section("6. redactLogObject does not mutate its input");
    const payload = { profile: { password: "hunter2" }, id: 7 };
    const masked = redactLogObject(payload);

    for (const line of lines) {
        console.log(line);
    }

    console.log("masked:  ", JSON.stringify(masked));
    console.log("original:", JSON.stringify(payload), "(unchanged)");

    console.log("\nExample completed successfully.");
}

main().catch((error) => {
    console.error("Example failed:", error);
    process.exit(1);
});
