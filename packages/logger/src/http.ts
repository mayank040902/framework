import pino from "pino";
import * as pinoHttp from "pino-http";
import type { HttpLogger } from "pino-http";

import { defineConfig } from "./config.js";
import { createSerializers } from "./serialize.js";
import type { SerializerOptions } from "./serialize.js";

export interface HttpLoggerOptions {
    loggerOptions?: Parameters<typeof defineConfig>[0];
    logger?: pino.Logger;
    serializers?: SerializerOptions;
    /** Redact the request query string from the logged URL. Defaults to true. */
    excludeQueryString?: boolean;
}

export function createHttpLogger(
    options: HttpLoggerOptions = {},
): HttpLogger {
    const {
        loggerOptions,
        logger,
        serializers,
        excludeQueryString = true,
    } = options;

    // Only build a logger when one was not supplied; previously `defineConfig`
    // ran unconditionally and its result was discarded.
    const resolvedLogger = logger ?? pino(defineConfig(loggerOptions));

    const customSerializers = createSerializers({
        ...serializers,
        excludeQueryString,
    });

    // `pino-http`'s published types do not expose the `serializers` option, so
    // the call is suppressed here. The serializer functions are passed through
    // as-is: a type assertion would be erased at runtime and would only
    // re-introduce `any` at this boundary.
    // @ts-expect-error - pinoHttp default export is callable and untyped
    return pinoHttp.default({
        logger: resolvedLogger,

        serializers: {
            req: customSerializers.req,
            res: customSerializers.res,
            err: customSerializers.err,
        },
    });
}
