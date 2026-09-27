import { createKafka, isKafkaConfigured, type KafkaClientOptions } from "./client/index.js";
import { createProducer, type Producer } from "./client/index.js";
import { createConsumer, subscribeToTopic, consumeMessages, type Consumer } from "./client/index.js";
import { createAdmin, type Admin } from "./client/index.js";
import { registerShutdown, shutdownClient } from "./client/index.js";
import { createLogger, resolveLoggerAndOptions, type Logger } from "./logger.js";
import { envString } from "./env.js";
import { KafkaDecodeError } from "./errors.js";
import { resolveCodec, type Codec } from "./adapters/codec.js";
import { Kafka, type RecordMetadata, type EachMessagePayload, type Message } from "kafkajs";

export class KafkaClient {
    logger: Logger;
    options: KafkaClientOptions;
    kafka: Kafka;
    producer: Producer | null;
    consumer: Consumer | null;
    admin: Admin | null;
    connected: {
        producer: boolean;
        consumer: boolean;
        admin: boolean;
    };
    codec: Codec;

    constructor(loggerOrOptions: Logger | KafkaClientOptions | undefined, maybeOptions: KafkaClientOptions = {}) {
        const { logger, options } = resolveLoggerAndOptions(
            loggerOrOptions,
            maybeOptions as Record<string, unknown>,
        );
        this.logger = createLogger(logger);
        this.options = options as KafkaClientOptions;
        this.codec = resolveCodec((options as Record<string, unknown>).codec as Codec | undefined);
        this.kafka = (options as Record<string, unknown>).kafka as Kafka ?? createKafka(this.logger, options as Record<string, unknown>);
        this.producer = null;
        this.consumer = null;
        this.admin = null;
        this.connected = {
            producer: false,
            consumer: false,
            admin: false,
        };
    }

    static isConfigured(options: Pick<KafkaClientOptions, "brokers">): boolean {
        return isKafkaConfigured(options);
    }

    async getProducer(options: KafkaClientOptions["producer"] = {}): Promise<Producer> {
        if (!this.producer) {
            this.producer = await createProducer(this.kafka, this.logger, {
                ...(this.options.producer ?? {}),
                ...options,
            });
            this.connected.producer = true;
        }
        return this.producer;
    }

    async getConsumer(groupIdOrOptions: string | KafkaClientOptions["consumer"] | undefined, maybeOptions: KafkaClientOptions["consumer"] = {}): Promise<Consumer> {
        if (this.consumer) {
            return this.consumer;
        }

        const options = typeof groupIdOrOptions === "string"
            ? { ...maybeOptions, groupId: groupIdOrOptions }
            : { ...(groupIdOrOptions ?? {}) };

        this.consumer = await createConsumer(this.kafka, this.logger, {
            ...(this.options.consumer ?? {}),
            ...options,
            groupId: options.groupId ?? this.options.groupId ?? envString("KAFKA_GROUP_ID"),
        } as Record<string, unknown>, {});
        this.connected.consumer = true;
        return this.consumer;
    }

    async getAdmin(options: KafkaClientOptions["admin"] = {}): Promise<Admin> {
        if (!this.admin) {
            this.admin = await createAdmin(this.kafka, this.logger, {
                ...(this.options.admin ?? {}),
                ...options,
            } as Record<string, unknown>);
            this.connected.admin = true;
        }
        return this.admin;
    }

    async send(topic: string, messages: unknown | unknown[], options: SendOptions = {}): Promise<RecordMetadata[]> {
        const producer = await this.getProducer(options.producer);
        const payload = Array.isArray(messages) ? messages : [messages];
        return producer.send({
            topic,
            messages: payload.map((message) => normalizeOutgoing(message, options, this.codec)) as Message[],
            ...options.send,
        });
    }

    async subscribe(topic: string, options: ConsumeOptions = {}): Promise<Consumer> {
        const consumer = await this.getConsumer(options);
        await subscribeToTopic(consumer, this.logger, topic, options as Record<string, unknown>);
        return consumer;
    }

    async consume(
        topicOrHandler: string | MessageHandler,
        handlerOrOptions: MessageHandler | ConsumeOptions | undefined,
        maybeOptions: ConsumeOptions = {},
    ): Promise<Consumer> {
        let topic: string | undefined;
        let handler: MessageHandler | undefined;
        let options: ConsumeOptions;

        if (typeof topicOrHandler === "function") {
            handler = topicOrHandler;
            options = handlerOrOptions as ConsumeOptions ?? {};
        } else {
            topic = topicOrHandler;
            handler = handlerOrOptions as MessageHandler;
            options = maybeOptions ?? {};
        }

        const consumer = await this.getConsumer(options);
        if (topic) {
            await subscribeToTopic(consumer, this.logger, topic, options as Record<string, unknown>);
        }

        await consumeMessages(consumer, this.logger, wrapHandler(handler, this.logger, options, this.codec));
        return consumer;
    }

    registerShutdown(extra: ShutdownClients = {}): (signal: string) => Promise<void> {
        return registerShutdown(this.logger, {
            producer: this.producer ?? undefined,
            consumer: this.consumer ?? undefined,
            admin: this.admin ?? undefined,
            ...extra,
        });
    }

    async disconnect(): Promise<void> {
        await Promise.allSettled([
            shutdownClient(this.logger, this.producer ?? undefined, "Kafka producer"),
            shutdownClient(this.logger, this.consumer ?? undefined, "Kafka consumer"),
            shutdownClient(this.logger, this.admin ?? undefined, "Kafka admin"),
        ]);
        this.producer = null;
        this.consumer = null;
        this.admin = null;
        this.connected = {
            producer: false,
            consumer: false,
            admin: false,
        };
    }
}

export function createKafkaClient(loggerOrOptions: Logger | KafkaClientOptions | undefined, maybeOptions: KafkaClientOptions = {}): KafkaClient {
    return new KafkaClient(loggerOrOptions, maybeOptions);
}

function normalizeOutgoing(message: unknown, options: SendOptions = {}, codec: Codec): object {
    if (Buffer.isBuffer(message) || typeof message === "string") {
        return { value: message };
    }

    if (message && typeof message === "object" && ("value" in message || "key" in message)) {
        const msg = message as Record<string, unknown>;
        return {
            ...msg,
            value: encodeValue(msg.value, codec),
            key: msg.key === undefined || msg.key === null ? msg.key : encodeValue(msg.key, codec),
        };
    }

    return { value: encodeValue(message, codec) };
}

function decodeIncoming(value: unknown, parseJson: boolean, codec: Codec): unknown {
    if (value === undefined || value === null) {
        return value;
    }

    if (!parseJson) {
        return Buffer.isBuffer(value) || value instanceof Uint8Array
            ? Buffer.from(value).toString()
            : value;
    }

    return codec.decode(value);
}

function encodeValue(value: unknown, codec: Codec): string | Buffer | null | undefined {
    if (value === undefined || value === null || Buffer.isBuffer(value) || typeof value === "string") {
        return value;
    }
    return codec.encode(value);
}

function wrapHandler(
    handler: MessageHandler | undefined,
    logger: Logger,
    options: ConsumeOptions = {},
    codec: Codec,
): ((payload: EachMessagePayload) => Promise<void>) | undefined {
    if (!handler) {
        return undefined;
    }

    return async (payload: EachMessagePayload): Promise<void> => {
        const message = payload.message ?? {};
        let value: unknown = message.value;
        let key: unknown = message.key;

        try {
            value = decodeIncoming(value, options.parseJson !== false, codec);
            key = decodeIncoming(key, options.parseJson !== false, codec);
        } catch (error) {
            const decodeError = new KafkaDecodeError("Failed to decode Kafka message", error);
            logger.error("Failed to decode Kafka message", decodeError);
            throw decodeError;
        }

        const { message: _message, ...restPayload } = payload;
        await handler({
            ...restPayload,
            key: key ?? undefined,
            value,
        } as EachMessagePayload & { key: unknown; value: unknown });
    };
}

interface SendOptions {
    producer?: object;
    send?: object;
}

interface ConsumeOptions {
    parseJson?: boolean;
    fromBeginning?: boolean;
    groupId?: string;
}

type MessageHandler = (payload: EachMessagePayload) => unknown | Promise<unknown>;

interface ShutdownClients {
    producer?: Producer | null;
    consumer?: Consumer | null;
    admin?: Admin | null;
    clients?: Array<{ disconnect(): Promise<void> }>;
    exit?: boolean;
}