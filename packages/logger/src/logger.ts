import pino from "pino";

import { defineConfig } from "./config.js";
import { createSerializers } from "./serialize.js";
import type { SerializerOptions } from "./serialize.js";

export interface LoggerOptions {
    mode?: "development" | "production" | "test";
    serializers?: SerializerOptions;
    childBindings?: Record<string, unknown>;
}

export function createLogger(options: LoggerOptions = {}): pino.Logger {
    const { mode, serializers, childBindings, ...rest } = options;

    const loggerOptions = defineConfig({ mode });
    const customSerializers = createSerializers(serializers);

    const logger = pino({
        ...loggerOptions,
        ...rest,
        serializers: {
            ...loggerOptions.serializers,
            ...customSerializers,
        },
    });

    if (childBindings) {
        return logger.child(childBindings);
    }

    return logger;
}

export function createChildLogger(
    logger: pino.Logger,
    bindings: Record<string, unknown>,
): pino.Logger {
    return logger.child(bindings);
}