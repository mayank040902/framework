import os from "node:os";
import pino from "pino";

const CENSOR = "[REDACTED]";

// Keys are compared lowercased, so both `accessToken` and `accesstoken`
// (and any other casing) are covered by a single entry.
const SENSITIVE_KEYS = new Set([
    "password",
    "passwordhash",
    "password_hash",
    "passwd",
    "pwd",
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "secret",
    "clientsecret",
    "client_secret",
    "privatekey",
    "private_key",
    "apikey",
    "api_key",
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "sessionid",
]);

/**
 * Keys whose string value is treated as a URL and has its query string removed.
 *
 * The request serializer strips the query from `req.url`, but an application log
 * that passes a URL directly — `logger.info({ url: request.url })`, a very
 * common shape — bypasses the serializer entirely. Without this, the default
 * "query strings are stripped" guarantee would hold only for the `req` key and
 * silently fail everywhere else, which is the worst possible failure mode for a
 * security default.
 *
 * Compared lowercased, like `SENSITIVE_KEYS`. Restricted to keys that are
 * unambiguously URL-bearing so a non-URL field is not truncated.
 */
const URL_KEYS = new Set([
    "url",
    "originalurl",
    "requesturl",
    "href",
    "referer",
    "referrer",
]);

/**
 * Returns `value` with any query string removed, or `value` unchanged when
 * there is no query.
 *
 * Returning the same reference when nothing changes matters: the caller
 * compares the result with the original to decide whether a copy is needed, so
 * returning a fresh equal string would clone the whole payload on every log
 * call.
 */
function stripQueryString(value: string): string {
    const index = value.indexOf("?");

    if (index === -1) {
        return value;
    }

    // `"/x?"` has an empty query and is left as-is rather than rewritten.
    return index === value.length - 1 ? value : value.slice(0, index);
}

/**
 * Paths handled by pino's `redact` rather than the walker below.
 *
 * `formatters.log` runs *before* pino's serializers, and the serializer then
 * runs on the walker's output. So the walker already sees a framework's parsed
 * `request.query` (an own enumerable property) and masks its sensitive keys
 * before the serializer copies it into the emitted line; a raw
 * `IncomingMessage` has no `query` property at all and `pino-std-serializers`
 * does not parse one out of the URL, so nothing is emitted for it.
 *
 * What the walker cannot see are fields that only exist *after* serialization,
 * such as `res.headers`. These paths cover that gap.
 */
const REDACT_PATHS: string[] = [
    "req.headers.authorization",
    "req.headers.Authorization",
    "req.headers['proxy-authorization']",
    "req.headers['Proxy-Authorization']",
    "req.headers.cookie",
    "req.headers.Cookie",
    "req.headers['set-cookie']",
    "req.headers['Set-Cookie']",
    "req.headers['x-api-key']",
    "req.headers['X-Api-Key']",
    "req.headers['x-auth-token']",
    "req.headers['X-Auth-Token']",
    "res.headers.authorization",
    "res.headers.Authorization",
    "res.headers.cookie",
    "res.headers.Cookie",
    "res.headers['set-cookie']",
    "res.headers['Set-Cookie']",
    "res.headers['x-api-key']",
    "res.headers['X-Api-Key']",
];

/**
 * Copies own enumerable properties, skipping any that throw when read.
 *
 * Spreading (`{ ...value }`) would evaluate every getter and propagate a
 * thrown error out of the logging call; pino tolerates such payloads by
 * catching during serialization, so redaction must not be stricter.
 */
function safeShallowCopy(value: object, into: Record<string, unknown>): void {
    for (const key of Object.keys(value)) {
        try {
            into[key] = (value as Record<string, unknown>)[key];
        } catch {
            // Unreadable property: leave it out rather than failing the log.
        }
    }

    for (const symbol of Object.getOwnPropertySymbols(value)) {
        try {
            (into as Record<symbol, unknown>)[symbol] = (value as Record<symbol, unknown>)[symbol];
        } catch {
            // Ignore unreadable symbol property.
        }
    }
}

/**
 * Upper bound on recursion. Deeply nested structures beyond this are left
 * untouched rather than risking a stack overflow, which would turn a log call
 * into a process crash. Realistic payloads nest far shallower.
 */
const MAX_DEPTH = 100;

/** Sentinel meaning "no usable `toJSON` result". */
const NOT_MATERIALIZABLE = Symbol("not-materializable");

/**
 * Invokes a `toJSON` method defensively.
 *
 * Returns `NOT_MATERIALIZABLE` when there is no usable result so the caller
 * can fall back to enumerating own properties. A throwing getter, a
 * non-function `toJSON`, and a `toJSON` that throws must never abort the log
 * call: pino tolerates unserializable payloads during serialization, so
 * redaction must not be stricter.
 */
function materializeToJSON(value: object): unknown {
    let toJSON: unknown;

    try {
        toJSON = (value as { toJSON?: unknown }).toJSON;
    } catch {
        return NOT_MATERIALIZABLE;
    }

    if (typeof toJSON !== "function") {
        return NOT_MATERIALIZABLE;
    }

    try {
        return (toJSON as () => unknown).call(value);
    } catch {
        return NOT_MATERIALIZABLE;
    }
}

/** `Object.keys` that cannot abort the log call on an exotic object. */
function safeKeys(value: object): string[] {
    try {
        return Object.keys(value);
    } catch {
        return [];
    }
}

/**
 * Copies a non-plain object while preserving its prototype and its
 * non-enumerable own properties.
 *
 * This exists for `Error`. `message` is an own but *non-enumerable* data
 * property, so a plain own-enumerable copy drops it. `formatters.log` runs
 * before pino's serializers, so a flattened error reaches the std `err`
 * serializer as a plain object, the serializer no longer recognizes it as an
 * `Error`, and the log line ends up with neither a message nor a stack trace.
 * Keeping the prototype makes the copy pass the serializer's
 * `instanceof Error` check.
 *
 * V8 implements `stack` as an own *accessor* that reads internal
 * `[[ErrorData]]` from its receiver. Copying that accessor onto a different
 * object yields `''`, because the new receiver has no error data, so
 * accessors are read once and stored as plain data properties.
 */
function safeShallowCopyPreserving(value: object, into: Record<string, unknown>): void {
    let descriptors: PropertyDescriptorMap;

    try {
        // One bulk call rather than one `getOwnPropertyDescriptor` per key: on
        // the error path this runs per logged error, and the single call is
        // markedly cheaper than N of them.
        descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
        return;
    }

    for (const [key, descriptor] of Object.entries(descriptors)) {
        let defined = false;

        if (descriptor.get || descriptor.set) {
            // Read the accessor once. A throwing getter is skipped rather than
            // aborting the log call, and the value is stored as a data property
            // because the accessor cannot be meaningfully re-bound.
            let accessed: unknown;

            try {
                accessed = (value as Record<string, unknown>)[key];
            } catch {
                accessed = undefined;
            }

            try {
                Object.defineProperty(into, key, {
                    value: accessed,
                    writable: true,
                    enumerable: descriptor.enumerable,
                    configurable: true,
                });
                defined = true;
            } catch {
                // Fall through to the plain-assignment fallback below.
            }
        } else {
            try {
                Object.defineProperty(into, key, descriptor);
                defined = true;
            } catch {
                // Non-configurable target slot: fall through to assignment.
            }
        }

        if (!defined) {
            try {
                into[key] = (value as Record<string, unknown>)[key];
            } catch {
                // Leave it out rather than failing the log call.
            }
        }
    }

    for (const symbol of Object.getOwnPropertySymbols(value)) {
        try {
            (into as Record<symbol, unknown>)[symbol] = (value as Record<symbol, unknown>)[symbol];
        } catch {
            // Ignore unreadable symbol property.
        }
    }
}

/**
 * Returns a copy of `value` with sensitive keys masked at any depth.
 *
 * Copy-on-write: objects are only cloned along paths that actually change, so
 * the common no-match case allocates nothing and the caller's data is never
 * mutated. Enumerating every nesting depth here is what an explicit
 * `redact.paths` list cannot do cheaply: fast-redact compiles one matcher per
 * path, and a path list covering top-level plus N depths costs 10x+ the
 * serialization time for the same coverage.
 *
 * Cycles are tolerated via `seen`, so a self-referencing `toJSON` cannot spin
 * forever or fall through unredacted.
 */
function redactDeep(
    value: unknown,
    seen: WeakSet<object>,
    depth = 0,
    bindingsMode = false,
): unknown {
    if (value === null || typeof value !== "object" || depth > MAX_DEPTH) {
        return value;
    }

    if (seen.has(value as object)) {
        return value;
    }

    seen.add(value as object);

    try {
        if (Array.isArray(value)) {
            let copy: unknown[] | undefined;

            for (let i = 0; i < value.length; i++) {
                const current = value[i];
                const next = redactDeep(current, seen, depth + 1, bindingsMode);

                if (next !== current) {
                    copy ??= value.slice();
                    copy[i] = next;
                }
            }

            return copy ?? value;
        }

        let isPlainObject: boolean;

        try {
            const prototype = Object.getPrototypeOf(value);
            isPlainObject = prototype === null || prototype === Object.prototype;
        } catch {
            // Exotic object (e.g. a Proxy with a throwing trap); treat it as a
            // plain object so a trap cannot abort the log call.
            isPlainObject = true;
        }

        // Plain objects and arrays are the overwhelmingly common case and
        // never carry a `toJSON`, so skip the lookup for them.
        if (!isPlainObject) {
            // In bindings mode a non-plain object (a live request, a model
            // instance) is left alone rather than walked.
            if (bindingsMode) {
                return value;
            }

            const materialized = materializeToJSON(value);

            if (materialized !== NOT_MATERIALIZABLE) {
                if (materialized === value) {
                    // `toJSON` returned the receiver. Recursing would hit the
                    // `seen` guard and hand back the *unredacted* original, so
                    // fall through and redact own properties instead.
                } else if (materialized !== null && typeof materialized === "object") {
                    return redactDeep(materialized, seen, depth + 1);
                } else {
                    return materialized;
                }
            }
        }

        let copy: Record<string, unknown> | undefined;
        let ownToJSON: (() => unknown) | undefined;

        /**
         * Lazily creates the copy-on-write target.
         *
         * For a non-plain object the copy keeps the prototype and the
         * non-enumerable own properties, so an `Error` still serializes with its
         * message and stack once pino's `err` serializer sees it.
         */
        const initCopy = (): Record<string, unknown> => {
            if (copy) {
                return copy;
            }

            if (isPlainObject) {
                copy = {};
                safeShallowCopy(value as object, copy);
            } else {
                let prototype: object | null;

                try {
                    prototype = Object.getPrototypeOf(value);
                } catch {
                    prototype = null;
                }

                copy = Object.create(prototype ?? Object.prototype) as Record<string, unknown>;
                safeShallowCopyPreserving(value as object, copy);
            }

            return copy;
        };

        for (const key of safeKeys(value as object)) {
            let current: unknown;

            try {
                current = (value as Record<string, unknown>)[key];
            } catch {
                continue;
            }

            // An own `toJSON` decides the serialized shape, so honour it even
            // on a plain object rather than dropping its output.
            if (key === "toJSON" && typeof current === "function") {
                ownToJSON = current as () => unknown;
                continue;
            }

            if (SENSITIVE_KEYS.has(key.toLowerCase())) {
                initCopy()[key] = CENSOR;
                continue;
            }

            // A URL passed straight into a log call carries its query string
            // past the request serializer, so strip it here too. The result is
            // compared by reference below, so a URL with no query costs nothing.
            if (typeof current === "string" && URL_KEYS.has(key.toLowerCase())) {
                const stripped = stripQueryString(current);

                if (stripped !== current) {
                    initCopy()[key] = stripped;
                }

                continue;
            }

            const next = redactDeep(current, seen, depth + 1, bindingsMode);

            if (next !== current) {
                initCopy()[key] = next;
            }
        }

        if (ownToJSON) {
            const materialized = materializeToJSON(value);

            if (materialized !== NOT_MATERIALIZABLE && materialized !== value) {
                return materialized !== null && typeof materialized === "object"
                    ? redactDeep(materialized, seen, depth + 1)
                    : materialized;
            }
        }

        return copy ?? value;
    } finally {
        seen.delete(value as object);
    }
}

/** Masks sensitive keys anywhere in a log payload. */
export function redactLogObject<T extends Record<string, unknown>>(object: T): T {
    return redactDeep(object, new WeakSet()) as T;
}

/**
 * Masks sensitive keys in logger bindings.
 *
 * Child bindings are serialized into a pre-built JSON string by pino
 * (`asChindings`) at child-creation time, so they never reach
 * `formatters.log` or the `redact` stringifiers. They must be masked here,
 * before `logger.child()` is called, or `child({ apiKey })` writes the secret
 * in plaintext. pino does support a `formatters.bindings` hook, but it drops
 * it on children (`proto.js` rebuilds a child's formatters with
 * `resetChildingsFormatter`), so it cannot be relied on.
 *
 * Only plain objects and arrays are traversed. Binding a live object such as an
 * `IncomingMessage` would otherwise walk its socket graph on every call
 * (~27us measured per request, and pino-http binds the raw request for each
 * one). Structured `req`/`res` bindings are already covered by the `redact`
 * paths, which pino applies to bindings as well.
 */
export function redactBindings(bindings: Record<string, unknown>): Record<string, unknown> {
    return redactDeep(bindings, new WeakSet(), 0, true) as Record<string, unknown>;
}

export function defineConfig(options: {
    mode?: "development" | "production" | "test";
} = {}): pino.LoggerOptions {
    const mode = options.mode ?? "production";

    const isProduction = mode === "production";
    const isTest = mode === "test";
    const isDevelopment = mode === "development";
    const isDevOrTest = isDevelopment || isTest;

    const defaults: pino.LoggerOptions = {
        level: isDevOrTest ? "trace" : "info",

        base: {
            pid: process.pid,
            hostname: os.hostname(),
        },

        formatters: {
            level(label) {
                return {
                    level: label,
                };
            },

            log: redactLogObject,
        },

        timestamp: pino.stdTimeFunctions.isoTime,

        // Redaction is applied in every mode: secrets must never reach a log
        // sink, including local development and test output.
        redact: {
            // Frozen so a caller mutating one logger's config cannot alter
            // every other logger built from this module.
            paths: Object.freeze([...REDACT_PATHS]) as unknown as string[],
            censor: CENSOR,
            remove: false,
        },
    };

    if (isProduction) {
        return {
            ...defaults,

            level: "info",
        };
    }

    if (isTest) {
        return {
            ...defaults,

            level: "silent",
        };
    }

    return defaults;
}
