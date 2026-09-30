import pino from "pino";

import { defineConfig, redactBindings } from "./config.js";
import { createSerializers } from "./serialize.js";
import type { SerializerOptions } from "./serialize.js";

export interface LoggerOptions {
    mode?: "development" | "production" | "test";
    serializers?: SerializerOptions;
    childBindings?: Record<string, unknown>;
    /**
     * Where log lines are written. Defaults to stdout. Pass a stream here (or
     * a `pino.transport()` worker) to route output somewhere else; note that
     * pino only accepts a destination as a separate argument, not as an
     * option key.
     */
    destination?: NodeJS.WritableStream;
    /** Escape hatch for any remaining pino options. */
    pino?: Omit<pino.LoggerOptions, "serializers" | "formatters" | "base" | "timestamp">;
}

/** Marks a logger whose `child` method has already been wrapped. */
const SAFE_CHILD = Symbol.for("@oneunit/logger.safeChild");

/**
 * Wraps `child` so bindings are redacted however the child is created.
 *
 * pino serializes child bindings into a pre-built JSON string at
 * child-creation time, so they bypass `formatters.log` and `redact`
 * entirely. Redacting inside `createChildLogger` alone would not be enough:
 * `logger.child(...)` is a documented way to make a child, so the method
 * itself is wrapped.
 *
 * pino builds children with `Object.create(this)`, so this own property is
 * inherited by every descendant and a single wrap covers the whole tree. The
 * original method is captured from the prototype and invoked with `this`, so
 * nested children keep their inherited bindings instead of re-rooting.
 */
function installSafeChild(logger: pino.Logger): pino.Logger {
    const alreadyInstalled = (logger as unknown as Record<symbol, unknown>)[SAFE_CHILD];

    if (alreadyInstalled) {
        return logger;
    }

    const prototype = Object.getPrototypeOf(logger) as pino.Logger | null;
    const originalChild = prototype?.child as
        ((this: pino.Logger, bindings: pino.Bindings, childOptions?: pino.ChildLoggerOptions) => pino.Logger)
        | undefined;

    if (typeof originalChild !== "function") {
        return logger;
    }

    Object.defineProperty(logger, SAFE_CHILD, {
        value: true,
        enumerable: false,
        configurable: true,
    });

    Object.defineProperty(logger, "child", {
        value: function safeChild(
            this: pino.Logger,
            bindings: pino.Bindings,
            childOptions?: pino.ChildLoggerOptions,
        ): pino.Logger {
            const safeBindings = bindings && typeof bindings === "object"
                ? redactBindings(bindings as Record<string, unknown>)
                : bindings;

            return originalChild.call(this, safeBindings, childOptions);
        },
        writable: true,
        configurable: true,
        enumerable: false,
    });

    return logger;
}

export function createLogger(options: LoggerOptions = {}): pino.Logger {
    const {
        mode,
        serializers,
        childBindings,
        pino: pinoOptions,
        destination,
    } = options;

    const loggerOptions = defineConfig({ mode });
    const customSerializers = createSerializers(serializers);

    // `formatters` is excluded from the public `pino` option type, but a plain
    // JavaScript caller can still pass one; merge it so a custom formatter
    // cannot silently drop the redaction formatter.
    const overrideFormatters = (pinoOptions as pino.LoggerOptions | undefined)?.formatters;

    const logger = installSafeChild(pino({
        ...loggerOptions,

        // Explicit pino overrides are applied last. `level` and `redact` stay
        // overridable by design.
        ...pinoOptions,

        // Re-applied after the overrides: serializers and redaction are
        // security-relevant and must not be replaceable by accident.
        formatters: {
            ...loggerOptions.formatters,
            ...overrideFormatters,
            log: loggerOptions.formatters?.log,
        },

        serializers: {
            ...loggerOptions.serializers,
            ...customSerializers,
        },

        // pino only accepts a destination as a separate argument, so an
        // options key of the same name is silently ignored.
    }, destination));

    if (childBindings && Object.keys(childBindings).length > 0) {
        return logger.child(childBindings);
    }

    return logger;
}

export function createChildLogger(
    logger: pino.Logger,
    bindings: Record<string, unknown> = {},
): pino.Logger {
    // `logger.child()` throws "missing bindings for child Pino" when called
    // without arguments, so short-circuit the no-op case.
    if (!bindings || Object.keys(bindings).length === 0) {
        return logger;
    }

    return logger.child(bindings);
}
