import { Worker, type WorkerOptions, type Processor } from "bullmq";
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
  const {
    name,
    processor,
    connection,
    prefix = "queue",
    concurrency,
    limiter,
    settings,
    ...options
  } = config;

  // BullMQ only falls back to its own defaults for keys that are absent.
  // Spreading an explicit `undefined` overrides `concurrency: 1` and trips
  // its `concurrency must be a finite number greater than 0` setter.
  const workerOptions: WorkerOptions = {
    prefix,
    connection,
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(limiter === undefined ? {} : { limiter }),
    ...(settings === undefined ? {} : { settings }),
    ...options,
  };

  const worker = new Worker<T>(name, processor, workerOptions);

  return worker;
}

export type { WorkerOptions, Job, Processor } from "bullmq";
export { Worker } from "bullmq";
