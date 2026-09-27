import pino from "pino";
import * as pinoHttp from "pino-http";
import type { HttpLogger } from "pino-http";

import { defineConfig } from "./config.js";

export interface HttpLoggerOptions {
    loggerOptions?: Parameters<typeof defineConfig>[0];
    logger?: pino.Logger;
}

export function createHttpLogger(
    options: HttpLoggerOptions = {},
): HttpLogger {
    const loggerOptions = defineConfig(options.loggerOptions);

    // @ts-expect-error - pinoHttp default export is callable
    return pinoHttp.default({
        logger: options.logger ?? pino(loggerOptions),

        serializers: {
            req(req: any) {
                return {
                    id: req.id,
                    method: req.method,
                    url: req.url,
                    remoteAddress: req.socket?.remoteAddress,
                };
            },

            res(res: any) {
                return {
                    statusCode: res.statusCode,
                };
            },

            err(err: any) {
                return {
                    type: err.type,
                    message: err.message,
                    stack: err.stack,
                    code: err.code,
                };
            },
        },
    });
}