import {
    createLogger,
    isLogger,
    resolveLoggerAndOptions as resolveLoggerAndOptionsBase,
    type Logger,
} from "../logger.js";

export function createLoggerAdapter(
    input?: Logger | ((level: string, message: unknown, extra?: unknown) => void) | null,
): Logger {
    if (!input) {
        return createLogger();
    }

    if (typeof input === "function") {
        return {
            error(message, extra) {
                input("error", message, extra);
            },
            warn(message, extra) {
                input("warn", message, extra);
            },
            info(message, extra) {
                input("info", message, extra);
            },
            debug(message, extra) {
                input("debug", message, extra);
            },
        };
    }

    return createLogger(input);
}

export function resolveLoggerAndOptions(
    loggerOrOptions: Logger | Record<string, unknown> | undefined,
    maybeOptions: Record<string, unknown> = {},
): { logger: Logger; options: Record<string, unknown> } {
    return resolveLoggerAndOptionsBase(loggerOrOptions, maybeOptions);
}

export { isLogger };
