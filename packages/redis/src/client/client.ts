// @ts-ignore - ioredis ESM types don't expose constructor properly
import Redis from "ioredis";
import { attachEvents } from "./events.js";
import type { Logger } from "../logger.js";
import type { RedisOptions } from "ioredis";

export interface RedisClientOptions extends RedisOptions {
    url?: string;
    lazyConnect?: boolean;
}

export function createClient(options: RedisClientOptions = {}, logger?: Logger): any {
    const { url, lazyConnect = true, ...restOptions } = options;

    const client = new (Redis as unknown as new (options?: RedisOptions) => any)({
        ...restOptions,
        lazyConnect,
    });

    if (url && !lazyConnect) {
        client.connect(url);
    }

    attachEvents(client, logger);

    return client;
}

export type { Logger } from "../logger.js";