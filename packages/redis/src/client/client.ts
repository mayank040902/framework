import { Redis } from "ioredis";
import { attachEvents } from "./events.js";
import { normalizeLogger, type Logger } from "../logger.js";
import type { RedisOptions } from "ioredis";

export interface RedisClientOptions extends RedisOptions {
  url?: string;
  lazyConnect?: boolean;
}

export function createClient(
  options: RedisClientOptions | string = {},
  logger?: Logger,
): Redis {
  // ioredis's own constructor accepts `new Redis("redis://host:port")`, so
  // that is the form people reach for first. Destructuring the string as an
  // options object produces no `url`, which leaves the client pointing at
  // localhost:6379: a silent connection to the wrong server, with no error
  // anywhere to notice it by.
  const resolved: RedisClientOptions =
    typeof options === "string" ? { url: options } : options;

  const {
    url = process.env.REDIS_URL,
    lazyConnect = true,
    // BullMQ throws unless this is null on the connections it drives, and
    // `createQueue`/`createWorker` take this same client instance.
    maxRetriesPerRequest = null,
    ...restOptions
  } = resolved;

  // ioredis only reads `url` from the first positional argument; an options
  // object carrying `url` is silently ignored and connects to localhost.
  const client = url
    ? new Redis(url, { ...restOptions, lazyConnect, maxRetriesPerRequest })
    : new Redis({ ...restOptions, lazyConnect, maxRetriesPerRequest });

  // A caller-supplied logger may implement only some of the levels. Completing
  // it here keeps `attachEvents` from throwing mid-connection-event.
  attachEvents(client, normalizeLogger(logger));

  return client;
}

export type { Logger } from "../logger.js";
