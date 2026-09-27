import type { Logger } from "../logger.js";
import { type Redis as RedisClient } from "ioredis";

export async function shutdown(client: RedisClient | null | undefined, logger?: Logger): Promise<void> {
    if (!client) {
        return;
    }

    try {
        await client.quit();

        logger?.info("Redis disconnected");
    } catch (error) {
        logger?.error("Failed to disconnect Redis", error);

        throw error;
    }
}