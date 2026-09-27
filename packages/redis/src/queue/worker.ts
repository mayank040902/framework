import { Worker, type WorkerOptions, type Job, type Processor } from "bullmq";
import { type Redis as RedisClient } from "ioredis";

export interface WorkerConfig<T = unknown> {
    name: string;
    processor: Processor<T>;
    connection: RedisClient;
    prefix?: string;
    concurrency?: number;
    limiter?: WorkerOptions["limiter"];
    settings?: WorkerOptions["settings"];
}

export function createWorker<T = unknown>(config: WorkerConfig<T>): Worker<T> {
    const { name, processor, connection, prefix = "queue", concurrency, limiter, settings, ...options } = config;

    return new Worker<T>(name, processor, {
        prefix,
        connection,
        concurrency,
        limiter,
        settings,
        ...options,
    });
}

export type { WorkerOptions, Job, Processor } from "bullmq";
export { Worker } from "bullmq";