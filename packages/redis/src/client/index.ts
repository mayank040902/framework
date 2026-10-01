export * from "./client.js";
export type { RedisClientOptions, Logger } from "./client.js";
export { attachEvents, redactError } from "./events.js";
export { health, type HealthResult, type HealthOptions } from "./check.js";
export { shutdown } from "./shutdown.js";
