const LOGGER_KEYS = ["error", "warn", "info", "debug"] as const;

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

    return true;
}

export function createLogger(input?: Logger | null): Logger {
    if (!input) {
        return consoleLogger;
    }

    if (input === silentLogger || input === consoleLogger) {
        return input;
    }

    return {
        error(message: unknown, extra?: unknown) {
            invoke(input, "error", message, extra);
        },
        warn(message: unknown, extra?: unknown) {
            invoke(input, "warn", message, extra);
        },
        info(message: unknown, extra?: unknown) {
            invoke(input, "info", message, extra);
        },
        debug(message: unknown, extra?: unknown) {
            invoke(input, "debug", message, extra);
        },
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