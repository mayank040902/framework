import { envString } from "../env.js";
import { KafkaConfigError, KafkaConnectionError } from "../errors.js";
import { createLogger, isLogger, type Logger } from "../logger.js";
import { Kafka, type Consumer, type EachMessagePayload } from "kafkajs";

export type { Consumer, EachMessagePayload } from "kafkajs";

export async function createConsumer(
    kafka: Kafka,
    second?: string | Logger | Record<string, unknown>,
    third?: string | Record<string, unknown>,
    fourth?: Record<string, unknown>,
): Promise<Consumer> {
    const { logger, groupId, options } = resolveConsumerArgs(second, third, fourth);

    if (!groupId) {
        throw new KafkaConfigError("Kafka consumer groupId is required");
    }

    const { groupId: _groupId, logger: _logger, topic: _topic, ...consumerOptions } = options;

    const consumer = kafka.consumer({
        groupId,
        allowAutoTopicCreation: false,
        maxWaitTimeInMs: 1000,
        ...consumerOptions,
    });

    logger.info(`Creating Kafka consumer "${groupId}"`);

    try {
        await consumer.connect();
        logger.info(`Kafka consumer "${groupId}" connected`);
        return consumer;
    } catch (error) {
        logger.error(`Failed to connect Kafka consumer "${groupId}"`, error);
        try {
            await consumer.disconnect();
        } catch {
            // Disconnect failure during startup is non-fatal.
        }
        throw new KafkaConnectionError(`Failed to connect Kafka consumer "${groupId}"`, error);
    }
}

export async function subscribeToTopic(
    consumer: Consumer,
    second?: string | Logger | Record<string, unknown>,
    third?: string | Record<string, unknown>,
    fourth?: Record<string, unknown>,
): Promise<void> {
    const { logger, topic, options } = resolveSubscribeArgs(second, third, fourth);

    if (!topic) {
        throw new KafkaConfigError("Kafka topic is required");
    }

    const fromBeginning = Boolean(options.fromBeginning ?? true);
    const { topic: _topic, logger: _logger, fromBeginning: _fromBeginning, ...subscribeOptions } = options as Record<string, unknown>;

    await consumer.subscribe({
        ...subscribeOptions,
        topic,
        fromBeginning,
    });
    logger.info(`Subscribed to Kafka topic "${topic}"`);
}

export async function consumeMessages(
    consumer: Consumer,
    second?: Logger | ((payload: EachMessagePayload) => Promise<void>),
    third?: ((payload: EachMessagePayload) => Promise<void>),
): Promise<void> {
    let logger: Logger;
    let handler: ((payload: EachMessagePayload) => Promise<void>) | undefined;

    if (typeof second === "function") {
        logger = createLogger();
        handler = second;
    } else {
        logger = createLogger(second);
        handler = third;
    }

    await consumer.run({
        eachMessage: handler ?? (async ({ topic, message }: { topic: string; message: object }) => {
            logger.info(`Received message on topic "${topic}"`, message);
        }),
    });
}

function resolveConsumerArgs(
    second: string | Logger | Record<string, unknown> | undefined,
    third: string | Record<string, unknown> | undefined,
    fourth: Record<string, unknown> | undefined,
): { logger: Logger; groupId: string | undefined; options: Record<string, unknown> } {
    if (typeof second === "string") {
        return {
            logger: createLogger(),
            groupId: second,
            options: (third ?? {}) as Record<string, unknown>,
        };
    }

    if (isLogger(second)) {
        const options = (typeof third === "string" ? (fourth ?? {}) : (third ?? {})) as Record<string, unknown>;
        return {
            logger: createLogger(second),
            groupId: typeof third === "string" ? third : toOptionalString(options.groupId ?? envString("KAFKA_GROUP_ID")),
            options,
        };
    }

    const options = (second ?? {}) as Record<string, unknown>;
    return {
        logger: createLogger(options.logger as Logger),
        groupId: toOptionalString(options.groupId ?? envString("KAFKA_GROUP_ID")),
        options,
    };
}

function resolveSubscribeArgs(
    second: string | Logger | Record<string, unknown> | undefined,
    third: string | Record<string, unknown> | undefined,
    fourth: Record<string, unknown> | undefined,
): { logger: Logger; topic: string | undefined; options: Record<string, unknown> } {
    if (typeof second === "string") {
        return {
            logger: createLogger(),
            topic: second,
            options: (third ?? {}) as Record<string, unknown>,
        };
    }

    if (isLogger(second)) {
        const options = (typeof third === "string" ? (fourth ?? {}) : (third ?? {})) as Record<string, unknown>;
        return {
            logger: createLogger(second),
            topic: typeof third === "string" ? third : String(options.topic),
            options,
        };
    }

    const options = (second ?? {}) as Record<string, unknown>;
    return {
        logger: createLogger(options.logger as Logger),
        topic: toOptionalString(options.topic),
        options,
    };
}

function toOptionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const text = String(value).trim();
    return text === "" ? undefined : text;
}