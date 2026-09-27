import { createLogger, createHttpLogger } from "../../dist/index.js";

async function main() {
    const logger = createLogger({
        mode: "development",
    });

    const httpLogger = createHttpLogger({
        loggerOptions: { mode: "development" },
    });

    logger.info("Logger initialized with development mode");
    logger.debug("This is a debug message");
    logger.warn({ meta: "data" }, "This is a warning");

    logger.info("HTTP logger middleware created: %s", typeof httpLogger);

    const child = logger.child({ requestId: "abc-123" });
    child.info("Child logger with requestId");

    logger.info("Example completed successfully");
}

main().catch((error) => {
    console.error("Example failed:", error);
    process.exit(1);
});