import { Queue, type QueueOptions, type JobsOptions } from "bullmq";
import { type Redis as RedisClient } from "ioredis";

export interface QueueConfig {
    name: string;
    connection: RedisClient;
    prefix?: string;
    defaultJobOptions?: JobsOptions;
    settings?: QueueOptions["settings"];
}

export function createQueue(config: QueueConfig): Queue {
    const { name, connection, prefix = "queue", defaultJobOptions, settings, ...options } = config;

    return new Queue(name, {
        prefix,
        connection,
        defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 1000,
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000,
            },
            ...defaultJobOptions,
        },
        settings,
        ...options,
    });
}

export type { QueueOptions, JobsOptions } from "bullmq";
export { Queue } from "bullmq";