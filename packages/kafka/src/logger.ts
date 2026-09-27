const LOGGER_KEYS = ["error", "warn", "info", "debug"] as const;
const OPTION_KEYS = [
    "brokers",
    "clientId",
    "groupId",
    "logger",
    "topic",
    "ssl",
    "sasl",
    "retry",
    "kafka",
    "producer",
    "consumer",
    "admin",
    "ca",
    "cert",
    "key",
    "logLevel",
    "partitioner",
    "createPartitioner",
    "rejectUnauthorized",
] as const;

export interface Logger {
    error(message: unknown, extra?: unknown): void;
    warn(message: unknown, extra?: unknown): void;
    info(message: unknown, extra?: unknown): void;
    debug(message: unknown, extra?: unknown): void;
    child?(bindings?: Record<string, unknown>): Logger;
}

export const silentLogger: Logger = Object.freeze({
    error() {},
    warn() {},
    info() {},
    debug() {},
});

export const consoleLogger: Logger = Object.freeze({
    error(message: unknown, extra?: unknown) {
        write(console.error, message, extra);
    },
    warn(message: unknown, extra?: unknown) {
        write(console.warn, message, extra);
    },
    info(message: unknown, extra?: unknown) {
        write(console.info, message, extra);
    },
    debug(message: unknown, extra?: unknown) {
        write(console.debug, message, extra);
    },
});

export function isLogger(value: unknown): value is Logger {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const hasLogFn = LOGGER_KEYS.some((key) => typeof (value as Record<string, unknown>)[key] === "function");
    if (!hasLogFn) {
        return false;
    }

    return !OPTION_KEYS.some((key) => Object.hasOwn(value, key));
}

export function createLogger(input?: Logger | null): Logger {
    if (!input) {
        return consoleLogger;
    }

    if (input === silentLogger || input === consoleLogger) {
        return input;
    }

    return {
        error(message, extra) {
            invoke(input, "error", message, extra);
        },
        warn(message, extra) {
            invoke(input, "warn", message, extra);
        },
        info(message, extra) {
            invoke(input, "info", message, extra);
        },
        debug(message, extra) {
            invoke(input, "debug", message, extra);
        },
    };
}

export function resolveLoggerAndOptions(
    loggerOrOptions: Logger | Record<string, unknown> | undefined,
    maybeOptions: Record<string, unknown> = {},
): { logger: Logger; options: Record<string, unknown> } {
    if (loggerOrOptions === undefined || loggerOrOptions === null) {
        return {
            logger: createLogger(),
            options: { ...maybeOptions },
        };
    }

    if (isLogger(loggerOrOptions)) {
        return {
            logger: createLogger(loggerOrOptions),
            options: { ...maybeOptions },
        };
    }

    const options = loggerOrOptions;
    return {
        logger: createLogger(options.logger as Logger),
        options: { ...options, ...maybeOptions },
    };
}

function write(fn: (...args: unknown[]) => void, message: unknown, extra?: unknown): void {
    if (extra === undefined) {
        fn(message);
        return;
    }
    fn(message, extra);
}

function invoke(logger: Logger, level: "error" | "warn" | "info" | "debug", message: unknown, extra?: unknown): void {
    const fn = typeof logger[level] === "function"
        ? logger[level]
        : typeof logger.info === "function"
            ? logger.info
            : undefined;

    if (typeof fn !== "function") {
        return;
    }

    if (extra === undefined) {
        fn.call(logger, message);
        return;
    }

    if (typeof logger.child === "function") {
        fn.call(logger, extra, message);
        return;
    }

    fn.call(logger, message, extra);
}