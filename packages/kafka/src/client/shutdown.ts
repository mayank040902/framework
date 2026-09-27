import { createLogger, isLogger, type Logger } from "../logger.js";

type Disconnectable = { disconnect: () => Promise<void> };

export async function shutdownClient(
    first?: Logger | Disconnectable,
    second?: Disconnectable | string,
    third?: string,
): Promise<void> {
    const { logger, client, name } = resolveShutdownArgs(first, second, third);

    if (!client) {
        return;
    }

    try {
        await client.disconnect();
        logger.info(`${name} disconnected`);
    } catch (error) {
        logger.error(`Failed to disconnect ${name}`, error);
        throw error;
    }
}

export function registerShutdown(
    loggerOrClients?: Logger | Record<string, unknown>,
    maybeClients?: Record<string, unknown>,
): (signal: string) => Promise<void> {
    const { logger, clients } = resolveRegisterArgs(loggerOrClients, maybeClients);
    const { producer, consumer, admin, clients: extraClients = [], exit = true } = clients as {
        producer?: Disconnectable;
        consumer?: Disconnectable;
        admin?: Disconnectable;
        clients?: Disconnectable[];
        exit?: boolean;
    };

    async function handleShutdown(signal: string): Promise<void> {
        logger.info(`${signal} received`);
        const baseTargets: Array<[Disconnectable | undefined, string]> = [
            [producer, "Kafka producer"],
            [consumer, "Kafka consumer"],
            [admin, "Kafka admin"],
        ];
        const extraTargets: Array<[Disconnectable | undefined, string]> = extraClients.map(
            (client: Disconnectable, index: number) => [client, `Kafka client ${index + 1}`] as [Disconnectable | undefined, string],
        );
        const targets = [...baseTargets, ...extraTargets];
        await Promise.allSettled(
            targets.map(([client, name]) => shutdownClient(logger, client, name)),
        );
        if (exit) {
            process.exit(0);
        }
    }

    process.once("SIGTERM", () => {
        handleShutdown("SIGTERM");
    });
    process.once("SIGINT", () => {
        handleShutdown("SIGINT");
    });

    return handleShutdown;
}

function resolveShutdownArgs(
    first: Logger | Disconnectable | undefined,
    second: Disconnectable | string | undefined,
    third: string | undefined,
): { logger: Logger; client: Disconnectable | undefined; name: string } {
    if (isDisconnectable(first) && second === undefined) {
        return {
            logger: createLogger(),
            client: first,
            name: "Kafka client",
        };
    }

    if (isDisconnectable(first)) {
        return {
            logger: createLogger(),
            client: first,
            name: typeof second === "string" ? second : "Kafka client",
        };
    }

    return {
        logger: createLogger(first),
        client: isDisconnectable(second) ? second : undefined,
        name: third ?? "Kafka client",
    };
}

function resolveRegisterArgs(
    loggerOrClients: Logger | Record<string, unknown> | undefined,
    maybeClients: Record<string, unknown> | undefined,
): { logger: Logger; clients: Record<string, unknown> } {
    if (maybeClients !== undefined) {
        return {
            logger: createLogger(loggerOrClients as Logger),
            clients: maybeClients ?? {},
        };
    }

    if (isLogger(loggerOrClients)) {
        return {
            logger: createLogger(loggerOrClients),
            clients: {},
        };
    }

    return {
        logger: createLogger(),
        clients: loggerOrClients ?? {},
    };
}

function isDisconnectable(value: unknown): value is Disconnectable {
    return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).disconnect === "function");
}