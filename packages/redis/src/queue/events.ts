import { QueueEvents, type QueueEventsOptions } from "bullmq";
import { Queue } from "bullmq";
import type { Logger } from "../logger.js";

export interface QueueEventsConfig {
    queue: Queue;
    logger: Logger;
    prefix?: string;
    connection?: QueueEventsOptions["connection"];
}

export function attachQueueEvents(config: QueueEventsConfig): QueueEvents {
    const { queue, logger, prefix = "queue", connection } = config;

    const queueEvents = new QueueEvents(queue.name, {
        prefix,
        connection: connection ?? queue.opts.connection,
    });

    queueEvents.on("completed", (args: { jobId: string; returnvalue: string; prev?: string }, _id: string) => {
        logger.info(`Job ${args.jobId} completed`);
    });

    queueEvents.on("failed", (args: { jobId: string; failedReason: string; prev?: string }, _id: string) => {
        logger.error(`Job ${args.jobId} failed`, args.failedReason);
    });

    queueEvents.on("progress", (args: { jobId: string; data: unknown }, _id: string) => {
        logger.info(`Job ${args.jobId} progress`, args.data);
    });

    queueEvents.on("error", (error: Error) => {
        logger.error(`Queue "${queue.name}" events error`, error);
    });

    return queueEvents;
}

export type { QueueEventsOptions } from "bullmq";
export { QueueEvents } from "bullmq";