import { createKafka, isKafkaConfigured, type KafkaClientOptions } from "./client/index.js";
import { createProducer, type Producer } from "./client/index.js";
import { createConsumer, subscribeToTopic, consumeMessages, type Consumer } from "./client/index.js";
import { createAdmin, type Admin } from "./client/index.js";
import { registerShutdown, shutdownClient } from "./client/index.js";
import { createLogger, resolveLoggerAndOptions, type Logger } from "./logger.js";
import { envString } from "./env.js";
import { KafkaConnectionError, KafkaDecodeError } from "./errors.js";
import { resolveCodec, type Codec } from "./adapters/codec.js";
import { Kafka, type RecordMetadata, type EachMessagePayload, type Message, type ProducerRecord } from "kafkajs";

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
    private subscriptions: Map<string, Promise<void>>;
    private generation: number;
    private producerPending: Pending<Producer>;
    private consumerPending: Pending<Consumer>;
    private adminPending: Pending<Admin>;

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
        this.subscriptions = new Map<string, Promise<void>>();
        this.generation = 0;
        this.producerPending = { value: null };
        this.consumerPending = { value: null };
        this.adminPending = { value: null };
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
            const generation = this.generation;
            const producer = await resolveOnce(this.producerPending, () =>
                createProducer(this.kafka, this.logger, {
                    ...this.clientLevelProducerOptions(),
                    ...(this.options.producer ?? {}),
                    ...options,
                }),
            );
            await this.adoptIfCurrent(generation, producer, shutdownClient.bind(undefined, this.logger, producer, "Kafka producer"));
            this.producer = producer;
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

        const generation = this.generation;
        this.consumer = await resolveOnce(this.consumerPending, () =>
            createConsumer(this.kafka, this.logger, {
                ...stripClientOnlyOptions((this.options.consumer ?? {}) as Record<string, unknown>),
                ...stripClientOnlyOptions(options as Record<string, unknown>),
                groupId: options.groupId ?? this.options.groupId ?? envString("KAFKA_GROUP_ID"),
            } as Record<string, unknown>, {}),
        );
        await this.adoptIfCurrent(generation, this.consumer, shutdownClient.bind(undefined, this.logger, this.consumer, "Kafka consumer"));
        this.connected.consumer = true;
        return this.consumer;
    }

    async getAdmin(options: KafkaClientOptions["admin"] = {}): Promise<Admin> {
        if (!this.admin) {
            const generation = this.generation;
            this.admin = await resolveOnce(this.adminPending, () =>
                createAdmin(this.kafka, this.logger, {
                    ...(this.options.admin ?? {}),
                    ...options,
                } as Record<string, unknown>),
            );
            await this.adoptIfCurrent(generation, this.admin, shutdownClient.bind(undefined, this.logger, this.admin, "Kafka admin"));
            this.connected.admin = true;
        }
        return this.admin;
    }

    async send(topic: string, messages: unknown | unknown[], options: SendOptions = {}): Promise<RecordMetadata[]> {
        const producer = await this.getProducer(options.producer);
        const payload = Array.isArray(messages) ? messages : [messages];
        const codec = this.resolveCodecOption(options.codec);
        return producer.send({
            ...(options.send as ProducerSendOptions | undefined),
            topic,
            messages: payload.map((message) => normalizeOutgoing(message, codec)) as Message[],
        });
    }

    private resolveCodecOption(codec: CodecInput | undefined): Codec {
        return codec === undefined ? this.codec : resolveCodec(codec);
    }

    /**
     * Guards against a client being connected after `disconnect()` already ran.
     * `disconnect()` bumps the generation, so a connection that was in flight at that
     * moment is torn down instead of being cached into a client that looks connected.
     */
    private async adoptIfCurrent<T>(generation: number, client: T, discard: () => Promise<void>): Promise<void> {
        if (generation === this.generation) {
            return;
        }
        await discard();
        throw new KafkaConnectionError("Kafka client was disconnected while it was connecting");
    }

    private clientLevelProducerOptions(): Record<string, unknown> {
        const options: Record<string, unknown> = {};
        if (this.options.partitioner !== undefined) {
            options.partitioner = this.options.partitioner;
        }
        if (this.options.createPartitioner !== undefined) {
            options.createPartitioner = this.options.createPartitioner;
        }
        return options;
    }

    async subscribe(topic: string, options: ConsumeOptions = {}): Promise<Consumer> {
        const consumer = await this.getConsumer(options);
        await this.subscribeOnce(consumer, topic, options);
        return consumer;
    }

    private async subscribeOnce(consumer: Consumer, topic: string, options: ConsumeOptions): Promise<void> {
        const existing = this.subscriptions.get(topic);
        if (existing) {
            return existing;
        }

        // Track the in-flight promise, not just the finished state, so two concurrent
        // calls cannot both pass an empty check and subscribe the same topic twice.
        const pending = subscribeToTopic(consumer, this.logger, topic, options as Record<string, unknown>).catch((error: unknown) => {
            this.subscriptions.delete(topic);
            throw error;
        });

        this.subscriptions.set(topic, pending);
        return pending;
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
            await this.subscribeOnce(consumer, topic, options);
        }

        await consumeMessages(consumer, this.logger, wrapHandler(handler, this.logger, options, this.resolveCodecOption(options.codec)));
        return consumer;
    }

    registerShutdown(extra: ShutdownClients = {}): (signal: string) => Promise<void> {
        return registerShutdown(this.logger, {
            producer: () => this.producer ?? undefined,
            consumer: () => this.consumer ?? undefined,
            admin: () => this.admin ?? undefined,
            ...extra,
        });
    }

    async disconnect(): Promise<void> {
        this.generation += 1;
        await Promise.allSettled([
            shutdownClient(this.logger, this.producer ?? undefined, "Kafka producer"),
            shutdownClient(this.logger, this.consumer ?? undefined, "Kafka consumer"),
            shutdownClient(this.logger, this.admin ?? undefined, "Kafka admin"),
        ]);
        this.producer = null;
        this.consumer = null;
        this.admin = null;
        this.subscriptions.clear();
        this.producerPending.value = null;
        this.consumerPending.value = null;
        this.adminPending.value = null;
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

const CLIENT_ONLY_OPTION_KEYS = ["parseJson", "fromBeginning", "codec", "send", "exit"] as const;

interface Pending<T> {
    value: Promise<T> | null;
}

function resolveOnce<T>(pending: Pending<T>, factory: () => Promise<T>): Promise<T> {
    if (pending.value) {
        return pending.value;
    }

    const promise = factory();
    pending.value = promise;
    promise.catch(() => {
        if (pending.value === promise) {
            pending.value = null;
        }
    });

    return promise;
}

function stripClientOnlyOptions(options: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...options };
    for (const key of CLIENT_ONLY_OPTION_KEYS) {
        delete rest[key];
    }
    return rest;
}

function normalizeOutgoing(message: unknown, codec: Codec): object {
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
        const decoded = { ...message, key: key ?? undefined, value };
        await handler({
            ...restPayload,
            message: decoded,
            key: key ?? undefined,
            value,
        } as EachMessagePayload & { key: unknown; value: unknown });
    };
}

interface SendOptions {
    producer?: object;
    send?: ProducerSendOptions;
    codec?: CodecInput;
}

interface ConsumeOptions {
    parseJson?: boolean;
    fromBeginning?: boolean;
    groupId?: string;
    codec?: CodecInput;
}

type CodecInput = Parameters<typeof resolveCodec>[0];

type ProducerSendOptions = Omit<ProducerRecord, "topic" | "messages">;

type MessageHandler = (payload: EachMessagePayload) => unknown | Promise<unknown>;

interface ShutdownClients {
    producer?: Producer | null;
    consumer?: Consumer | null;
    admin?: Admin | null;
    clients?: Array<{ disconnect(): Promise<void> }>;
    exit?: boolean;
}