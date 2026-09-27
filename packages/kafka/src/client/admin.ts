import { resolveLoggerAndOptions, type Logger } from "../logger.js";
import { KafkaConnectionError } from "../errors.js";
import { Kafka, type Admin } from "kafkajs";

export type { Admin } from "kafkajs";

export async function createAdmin(
    kafka: Kafka,
    loggerOrOptions?: Logger | Record<string, unknown>,
    maybeOptions: Record<string, unknown> = {},
): Promise<Admin> {
    const { logger, options } = resolveLoggerAndOptions(loggerOrOptions, maybeOptions);
    const { logger: _logger, ...adminOptions } = options;
    const admin = kafka.admin(adminOptions);

    logger.info("Creating Kafka admin");

    try {
        await admin.connect();
        logger.info("Kafka admin connected");
        return admin;
    } catch (error) {
        logger.error("Failed to connect Kafka admin", error);
        try {
            await admin.disconnect();
        } catch {
            // Disconnect failure during startup is non-fatal.
        }
        throw new KafkaConnectionError("Failed to connect Kafka admin", error);
    }
}