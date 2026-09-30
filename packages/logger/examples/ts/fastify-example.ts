import Fastify from "fastify";

import { createLogger } from "../../dist/index.js";

/**
 * Fastify integration.
 *
 * Run with:
 *   npm run build && npx tsx examples/ts/fastify-example.ts
 *   curl "http://127.0.0.1:3000/hello?token=super-secret"
 *
 * The route logs `request.url` verbatim, which arrives as
 * `/hello?token=super-secret`. The emitted line shows `url: "/hello"` — the
 * query string was stripped by this package's request serializer before it
 * reached the sink.
 *
 * The single most important line is `loggerInstance`. In Fastify 5, `logger`
 * accepts `boolean | options`, not a logger instance. Passing the logger there
 * makes Fastify quietly build its *own* pino logger: nothing throws, the server
 * starts and serves, and this package's serializers, redaction, and level
 * formatting are all silently absent.
 */

const PORT = 3000;

async function main() {
    const logger = createLogger({
        mode: "development",
    });

    const fastify = Fastify({
        // Correct. Fastify logs through this exact instance.
        loggerInstance: logger,

        // WRONG, for the reason above:
        //   logger: createHttpLogger({ loggerOptions: { mode: "development" } }),
    });

    fastify.get("/hello", async (request) => {
        logger.info({ url: request.url }, "handling hello request");
        return { message: "Hello from Fastify + logger example!" };
    });

    fastify.get("/health", async () => ({ status: "ok" }));

    try {
        logger.info("Starting server on http://127.0.0.1:%d", PORT);
        await fastify.listen({ port: PORT, host: "127.0.0.1" });
    } catch (err) {
        logger.error({ err }, "Failed to start server");
        process.exit(1);
    }

    process.on("SIGINT", async () => {
        logger.info("Shutting down...");
        await fastify.close();
        process.exit(0);
    });
}

main();
