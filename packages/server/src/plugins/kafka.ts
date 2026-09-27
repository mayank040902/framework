import type { FastifyInstance } from "fastify";

export interface KafkaPluginOptions {
    brokers?: string | string[];
    clientId?: string;
    groupId?: string;
    ssl?: boolean | object;
    sasl?: boolean | object;
    retry?: object;
    logLevel?: string;
    partitioner?: string;
    autoConnectProducer?: boolean;
    consumerGroupId?: string;
    subscribeTopics?: string | string[];
    onMessage?: (payload: { topic: string; partition: number; key: unknown; value: unknown }) => Promise<void>;
    producer?: object;
    consumer?: object;
    admin?: object;
}

async function kafkaPlugin(
    server: FastifyInstance,
    options: KafkaPluginOptions = {},
): Promise<void> {
    let createKafkaClient: (logger: unknown, options: Record<string, unknown>) => {
        getProducer: () => Promise<unknown>;
        getConsumer: (groupId: string) => Promise<unknown>;
        subscribe: (topic: string) => Promise<unknown>;
        consume: (topic: string, handler: KafkaPluginOptions["onMessage"]) => Promise<unknown>;
        disconnect: () => Promise<void>;
    };

    try {
        const kafkaModule = await import("@bootstrap-framework/kafka") as {
            createKafkaClient: typeof createKafkaClient;
        };
        createKafkaClient = kafkaModule.createKafkaClient;
    } catch (err) {
        server.log.warn({ err }, "kafka package not installed, kafka plugin disabled");
        return;
    }

    const {
        autoConnectProducer = false,
        consumerGroupId,
        subscribeTopics,
        onMessage,
        ...clientOptions
    } = options;

    const client = createKafkaClient(server.log, clientOptions);

    server.decorate("kafka", client);

    if (autoConnectProducer) {
        await client.getProducer();
    }

    if (consumerGroupId && subscribeTopics) {
        const topics = Array.isArray(subscribeTopics) ? subscribeTopics : [subscribeTopics];
        await client.getConsumer(consumerGroupId);

        for (const topic of topics) {
            await client.subscribe(topic);
        }

        if (onMessage) {
            await client.consume(topics[0], onMessage);
        }
    }

    server.addHook("onClose", async () => {
        await client.disconnect();
    });
}

export default kafkaPlugin;
export { kafkaPlugin };
