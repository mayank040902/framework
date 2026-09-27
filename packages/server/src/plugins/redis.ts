import type { FastifyInstance } from "fastify";

export interface RedisPluginOptions {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    lazyConnect?: boolean;
    healthCheck?: boolean;
    healthCheckPath?: string;
    [key: string]: unknown;
}

async function redisPlugin(
    server: FastifyInstance,
    options: RedisPluginOptions = {},
): Promise<void> {
    let createClient: (options: Record<string, unknown>, logger?: unknown) => unknown;
    let health: (client: unknown) => Promise<unknown>;
    let shutdown: (client: unknown, logger?: unknown) => Promise<void>;

    try {
        const redisModule = await import("@bootstrap-framework/redis") as {
            createClient: typeof createClient;
            health: typeof health;
            shutdown: typeof shutdown;
        };
        createClient = redisModule.createClient;
        health = redisModule.health;
        shutdown = redisModule.shutdown;
    } catch (err) {
        server.log.warn({ err }, "redis package not installed, redis plugin disabled");
        return;
    }

    const {
        healthCheck = false,
        healthCheckPath = "/health/redis",
        ...clientOptions
    } = options;

    const client = createClient(clientOptions, server.log);

    server.decorate("redis", client);

    if (healthCheck) {
        server.get(healthCheckPath, async () => {
            return health(client);
        });
    }

    server.addHook("onClose", async () => {
        await shutdown(client, server.log);
    });
}

export default redisPlugin;
export { redisPlugin };
