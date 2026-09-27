import { resolveLoggerAndOptions, type Logger } from "../logger.js";
import { KafkaConnectionError } from "../errors.js";
import { resolvePartitioner } from "./config.js";
import { Kafka, type Producer, type ICustomPartitioner } from "kafkajs";

export type { Producer } from "kafkajs";

export async function createProducer(
    kafka: Kafka,
    loggerOrOptions?: Logger | Record<string, unknown>,
    maybeOptions: Record<string, unknown> = {},
): Promise<Producer> {
    const { logger, options } = resolveLoggerAndOptions(loggerOrOptions, maybeOptions);
    const { partitioner, createPartitioner, logger: _logger, ...producerOptions } = options;

    const partitionerFn = createPartitioner ?? resolvePartitioner({ partitioner, createPartitioner });

    const producer = kafka.producer({
        allowAutoTopicCreation: false,
        createPartitioner: partitionerFn as ICustomPartitioner,
        ...producerOptions,
    });

    try {
        await producer.connect();
        logger.info("Kafka producer connected");
        return producer;
    } catch (error) {
        logger.error("Failed to connect Kafka producer", error);
        try {
            await producer.disconnect();
        } catch {
            // Disconnect failure during startup is non-fatal.
        }
        throw new KafkaConnectionError("Failed to connect Kafka producer", error);
    }
}