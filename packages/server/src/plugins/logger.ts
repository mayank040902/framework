import type { FastifyInstance } from "fastify";

export interface LoggerPluginOptions {
    useHttpLogger?: boolean;
    serviceName?: string;
    mode?: "development" | "production" | "test";
    serializers?: Record<string, unknown>;
    childBindings?: Record<string, unknown>;
}

async function loggerPlugin(
    server: FastifyInstance,
    options: LoggerPluginOptions = {},
): Promise<void> {
    let createLogger: (options: Record<string, unknown>) => unknown;
    let createHttpLogger: (options: Record<string, unknown>) => { logger: unknown };

    try {
        const loggerModule = await import("@bootstrap-framework/logger") as {
            createLogger: typeof createLogger;
            createHttpLogger: typeof createHttpLogger;
        };
        createLogger = loggerModule.createLogger;
        createHttpLogger = loggerModule.createHttpLogger;
    } catch (err) {
        server.log.warn({ err }, "logger package not installed, using default Fastify logger");
        return;
    }

    const { useHttpLogger = true, serviceName, mode, serializers, childBindings, ...rest } = options;

    const effectiveServiceName = serviceName ?? (server as any).name;

    const loggerOptions = {
        mode,
        childBindings: effectiveServiceName ? { service: effectiveServiceName } : childBindings,
        serializers,
        ...rest,
    };

    const logger = createLogger(loggerOptions);
    server.log = logger as any;

    if (useHttpLogger) {
        const httpLogger = createHttpLogger({
            loggerOptions: { mode },
            logger,
        });
        server.log = httpLogger.logger as typeof server.log;
    }

    server.decorate("logger", logger);
}

export default loggerPlugin;
export { loggerPlugin };