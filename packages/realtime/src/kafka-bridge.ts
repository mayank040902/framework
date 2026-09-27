export interface KafkaMessage {
  key?: Buffer | string | null;
  value?: Buffer | string | null;
  offset?: string;
  timestamp?: string;
  headers?: Record<string, unknown>;
}

export interface EachMessagePayload {
  topic: string;
  partition: number;
  message: KafkaMessage;
}

export interface KafkaConsumer {
  subscribe(options: { topic: string; fromBeginning?: boolean }): Promise<void>;
  run(options: { eachMessage: (payload: EachMessagePayload) => Promise<void> }): Promise<void>;
  disconnect(): Promise<void>;
}

export interface KafkaClientLike {
  getConsumer(groupId: string): Promise<KafkaConsumer>;
}

export interface KafkaBridgeLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error?(...args: unknown[]): void;
}

export interface KafkaBridgeConfig {
  groupId: string;
  topics?: string[];
  handlers?: Record<string, (message: EachMessagePayload) => Promise<void>>;
}

export interface KafkaBridge {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createKafkaBridge(
  kafka: KafkaClientLike,
  hub: { broadcast: (channel: string, message: unknown) => number },
  logger: KafkaBridgeLogger,
  config: KafkaBridgeConfig
): KafkaBridge {
  const { groupId, topics = [], handlers = {} } = config;
  let consumer: KafkaConsumer | null = null;

  async function start(): Promise<void> {
    consumer = await kafka.getConsumer(groupId);

    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const handler = handlers[payload.topic];
        if (!handler) {
          return;
        }

        try {
          await handler(payload);
        } catch (error) {
          logger.warn(
            { topic: payload.topic, value: payload.message.value, error },
            "Failed to process realtime Kafka message",
          );
        }
      },
    });

    logger.info("Kafka realtime bridge started");
  }

  async function stop(): Promise<void> {
    if (!consumer) {
      return;
    }

    try {
      await consumer.disconnect();
    } catch (error) {
      logger.warn(
        { error },
        `Failed to disconnect Kafka realtime consumer "${groupId}"`,
      );
    }
  }

  return {
    start,
    stop,
  };
}