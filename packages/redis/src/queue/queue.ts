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
  const {
    name,
    connection,
    prefix = "queue",
    defaultJobOptions,
    settings,
    ...options
  } = config;

  const defaults: JobsOptions = {
    removeOnComplete: 100,
    removeOnFail: 1000,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  };

  // Merged key by key rather than by spreading. A spread writes `undefined` for
  // every key the caller left unset, which erases the default instead of falling
  // through to it — and that is how a config built by spreading another object
  // (`{ ...base, attempts: maybeUndefined }`) quietly loses the package default.
  // `null` is a deliberate value rather than a missing one, so it passes
  // through: `removeOnComplete: null` is how BullMQ is told to keep a job.
  const merged: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(defaultJobOptions ?? {})) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  const queueOptions: QueueOptions = {
    prefix,
    connection,
    defaultJobOptions: merged as JobsOptions,
    ...(settings === undefined ? {} : { settings }),
    ...options,
  };

  const queue = new Queue(name, queueOptions);

  return queue;
}

export type { QueueOptions, JobsOptions } from "bullmq";
export { Queue } from "bullmq";
