import { describe, it, expect, vi } from "vitest";

import { createLogger, createChildLogger } from "../src/logger.js";
import { defineConfig } from "../src/config.js";
import { createSerializers } from "../src/serialize.js";
import { createTransport, createMultiTransport } from "../src/transport.js";
import { createHttpLogger } from "../src/http.js";

describe("logger", () => {
    it("should create a logger with default options", () => {
        const logger = createLogger();
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe("function");
        expect(typeof logger.error).toBe("function");
        expect(typeof logger.warn).toBe("function");
        expect(typeof logger.debug).toBe("function");
        expect(typeof logger.trace).toBe("function");
    });

    it("should create a logger with development mode", () => {
        const logger = createLogger({ mode: "development" });
        expect(logger).toBeDefined();
    });

    it("should create a logger with production mode", () => {
        const logger = createLogger({ mode: "production" });
        expect(logger).toBeDefined();
    });

    it("should create a logger with test mode", () => {
        const logger = createLogger({ mode: "test" });
        expect(logger).toBeDefined();
    });

    it("should create a child logger with bindings", () => {
        const logger = createLogger();
        const child = createChildLogger(logger, { requestId: "123", userId: "456" });
        expect(child).toBeDefined();
        expect(child.bindings().requestId).toBe("123");
        expect(child.bindings().userId).toBe("456");
    });

    it("should create logger with custom serializers", () => {
        const logger = createLogger({ serializers: { excludeHeaders: true } });
        expect(logger).toBeDefined();
    });
});

describe("defineConfig", () => {
    it("should return default config for development", () => {
        const config = defineConfig({ mode: "development" });
        expect(config.level).toBe("trace");
        expect(config.base).toBeDefined();
        expect(config.timestamp).toBeDefined();
    });

    it("should return production config with redaction", () => {
        const config = defineConfig({ mode: "production" });
        expect(config.level).toBe("info");
        expect(config.redact).toBeDefined();
        expect(config.redact?.paths).toContain("req.headers.authorization");
        expect(config.redact?.paths).toContain("*.password");
    });

    it("should return silent config for test", () => {
        const config = defineConfig({ mode: "test" });
        expect(config.level).toBe("silent");
    });
});

describe("createSerializers", () => {
    it("should create custom serializers", () => {
        const serializers = createSerializers();
        expect(serializers.err).toBeDefined();
        expect(serializers.req).toBeDefined();
        expect(serializers.res).toBeDefined();
    });

    it("should exclude headers when option is set", () => {
        const serializers = createSerializers({ excludeHeaders: true });
        const mockReq = {
            method: "GET",
            url: "/test",
            host: "localhost",
            hostname: "localhost",
            headers: { "x-custom": "value" },
            remoteAddress: "127.0.0.1",
            remotePort: 1234,
            protocol: "http",
            queryString: "",
        };
        const result = serializers.req(mockReq);
        expect(result.headers).toBeUndefined();
    });

    it("should exclude query when option is set", () => {
        const serializers = createSerializers({ excludeQuery: true });
        const mockReq = {
            method: "GET",
            url: "/test?foo=bar",
            host: "localhost",
            hostname: "localhost",
            headers: {},
            remoteAddress: "127.0.0.1",
            remotePort: 1234,
            protocol: "http",
            queryString: "foo=bar",
        };
        const result = serializers.req(mockReq);
        expect(result.query).toBeUndefined();
    });
});

describe("createTransport", () => {
    it("should create pretty transport", () => {
        const transport = createTransport({ target: "pretty" });
        expect(transport).toBeDefined();
        expect("targets" in transport).toBe(true);
    });

    it("should create file transport", () => {
        const transport = createTransport({ target: "file", destination: "/tmp/test.log" });
        expect(transport).toBeDefined();
        expect("targets" in transport).toBe(true);
    });

    it("should throw for file transport without destination", () => {
        expect(() => createTransport({ target: "file" })).toThrow("File transport requires a destination path");
    });

    it("should create stream transport", () => {
        const stream = process.stdout;
        const transport = createTransport({ target: "stream", destination: stream });
        expect(transport).toBeDefined();
        expect("targets" in transport).toBe(true);
    });

    it("should throw for stream transport without destination", () => {
        expect(() => createTransport({ target: "stream" })).toThrow("Stream transport requires a writable stream");
    });

    it("should throw for unknown target", () => {
        expect(() => createTransport({ target: "unknown" as any })).toThrow("Unknown transport target");
    });
});

describe("createMultiTransport", () => {
    it("should create multi transport", () => {
        const transport = createMultiTransport([
            { target: "pretty", level: "info" },
            { target: "file", destination: "/tmp/test.log", level: "debug" },
        ]);
        expect(transport).toBeDefined();
        expect(transport.targets).toHaveLength(2);
        expect(transport.targets[0].level).toBe("info");
        expect(transport.targets[1].level).toBe("debug");
    });
});

describe("createHttpLogger", () => {
    it("should create http logger middleware", () => {
        const middleware = createHttpLogger();
        expect(middleware).toBeDefined();
        expect(typeof middleware).toBe("function");
    });

    it("should create http logger with custom options", () => {
        const middleware = createHttpLogger({ loggerOptions: { mode: "development" } });
        expect(middleware).toBeDefined();
    });
});