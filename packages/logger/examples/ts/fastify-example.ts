import Fastify from "fastify";
import { createLogger, createHttpLogger } from "../../dist/index.js";

async function main() {
    const logger = createLogger({
        mode: "development",
    });

    const httpLogger = createHttpLogger({
        loggerOptions: { mode: "development" },
    });

    const fastify = Fastify({
        // @ts-expect-error - pino-http logger is compatible with Fastify at runtime
        logger: httpLogger,
    });

    fastify.get("/hello", async (request, reply) => {
        logger.info({ url: request.url }, "Handling hello request");
        return { message: "Hello from Fastify + logger example!" };
    });

    fastify.get("/health", async (request, reply) => {
        return { status: "ok" };
    });

    try {
        logger.info("Starting server on http://127.0.0.1:3000");
        await fastify.listen({ port: 3000, host: "127.0.0.1" });
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