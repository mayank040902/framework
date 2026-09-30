import http from "node:http";
import { Writable } from "node:stream";

import { createLogger, createHttpLogger } from "../../dist/index.js";

/**
 * HTTP logging over a real request.
 *
 * Run with:
 *   npm run build && npx tsx examples/ts/http-example.ts
 *
 * The request arrives as `/pay?token=super-secret&page=2` and the emitted line
 * shows `url: "/pay"` — the query string is stripped before it reaches the
 * sink. Note that no `query` object appears at all: this is a raw Node
 * `IncomingMessage`, and `pino-std-serializers` does not parse a query out of
 * the URL, so there is nothing to emit and nothing to leak.
 *
 * Under a framework that parses the query for you (Fastify, Express) the `req`
 * object does carry a `query` property, and that object is emitted with its
 * sensitive keys masked — see `fastify-example.ts` and the README.
 *
 * Either way the secret does not reach the sink, which the example verifies by
 * throwing if it ever does.
 */

const SECRET = "super-secret-token";

/** Captures emitted lines so the example can print and assert on them. */
function collector(): { stream: Writable; records: Array<Record<string, any>> } {
    const records: Array<Record<string, any>> = [];

    const stream = new Writable({
        write(chunk, _encoding, callback) {
            const text = chunk.toString().trim();
            if (text) {
                records.push(JSON.parse(text));
            }
            callback();
        },
    });

    return { stream, records };
}

async function main() {
    const { stream, records } = collector();

    // `createHttpLogger` accepts a `logger` instance. Supplying one keeps this
    // package's redaction and serializers in play; letting it build its own
    // would use pino's defaults instead.
    const logger = createLogger({ mode: "production", destination: stream });

    const httpLogger = createHttpLogger({
        logger,
        serializers: {
            // Default is true. Set it to false to keep the raw query string —
            // only do that when you are certain no sensitive parameter is ever
            // present, because the raw string is not masked per-key.
            excludeQueryString: true,
        },
    });

    const server = http.createServer((req, res) => {
        httpLogger(req, res);
        res.end("ok");
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };

    // A request carrying secrets in the query string, the authorization
    // header, a cookie, and an API key header.
    const request = http.request(
        {
            port,
            path: `/pay?token=${SECRET}&page=2`,
            headers: {
                authorization: "Bearer super-secret-bearer",
                cookie: "session=super-secret-cookie",
                "x-api-key": "super-secret-key",
                "user-agent": "logger-example/1.0",
            },
        },
        (res) => {
            res.resume();
            res.on("end", async () => {
                await new Promise<void>((done) => server.close(() => done()));

                console.log("--- emitted log lines ---");
                for (const record of records) {
                    console.log(JSON.stringify(record, null, 2));
                }

                const completed = records.find((r) => r.msg === "request completed");

                if (!completed) {
                    throw new Error(`missing completion line; saw ${records.map((r) => r.msg).join(", ")}`);
                }

                const emitted = JSON.stringify(records);

                console.log("\n--- what survived to the sink ---");
                console.log("url:            ", completed.req.url, "(query string stripped)");
                console.log("query:          ", completed.req.query ?? "(not emitted for a raw Node request)");
                console.log("authorization:  ", completed.req.headers.authorization);
                console.log("x-api-key:      ", completed.req.headers["x-api-key"]);
                console.log("user-agent:     ", completed.req.headers["user-agent"], "(harmless, kept)");

                for (const secret of [SECRET, "super-secret-bearer", "super-secret-cookie", "super-secret-key"]) {
                    if (emitted.includes(secret)) {
                        throw new Error(`LEAKED: ${secret} reached the log sink`);
                    }
                }

                console.log("\nNo secret reached the sink. Harmless fields survived.");
            });
        },
    );

    request.end();
}

main().catch((error) => {
    console.error("Example failed:", error);
    process.exit(1);
});
