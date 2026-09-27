import type { Logger } from "../logger.js";
import { type Redis as RedisClient } from "ioredis";

export function attachEvents(client: RedisClient, logger?: Logger): void {
    client.on("connect", () => {
        logger?.info("redis connect");
    });

    client.on("ready", () => {
        logger?.info("redis ready");
    });

    client.on("reconnecting", (delay: number) => {
        logger?.warn(delay ? `redis reconnecting in ${delay}ms` : "redis reconnecting");
    });

    client.on("error", (err: Error) => {
        logger?.error({ err }, "redis error");
    });

    client.on("close", () => {
        logger?.info("redis close");
    });
}