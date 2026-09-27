import { performance } from "node:perf_hooks";
import { type Redis as RedisClient } from "ioredis";

export interface HealthResult {
    status: "up" | "down";
    latency: {
        value: number;
        unit: "ms";
    };
    error?: string;
}

export async function health(client: RedisClient): Promise<HealthResult> {
    const start = performance.now();

    try {
        await client.ping();

        return {
            status: "up",
            latency: {
                value: Math.round(performance.now() - start),
                unit: "ms",
            },
        };
    } catch (error) {
        return {
            status: "down",
            latency: {
                value: Math.round(performance.now() - start),
                unit: "ms",
            },
            error: error instanceof Error ? error.message : String(error),
        };
    }
}