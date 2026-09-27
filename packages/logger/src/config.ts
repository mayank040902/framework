import os from "node:os";
import pino from "pino";

export function defineConfig(options: {
    mode?: "development" | "production" | "test";
} = {}): pino.LoggerOptions {
    const mode = options.mode ?? "production";

    const isDevelopment = mode === "development";
    const isProduction = mode === "production";
    const isTest = mode === "test";
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

            bindings(bindings) {
                return {
                    pid: bindings.pid,
                    hostname: bindings.hostname,
                };
            },
        },

        timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (isProduction) {
        return {
            ...defaults,

            level: "info",

            redact: {
                paths: [
                    "req.headers.authorization",
                    "req.headers.cookie",
                    "res.headers['set-cookie']",
                    "*.password",
                    "*.token",
                    "*.accessToken",
                    "*.refreshToken",
                    "*.secret",
                ],
                censor: "[REDACTED]",
            },
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