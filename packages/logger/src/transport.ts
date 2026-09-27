import pino from "pino";

export interface TransportOptions {
    target?: "pretty" | "file" | "stream";
    destination?: NodeJS.WritableStream | string;
    options?: Record<string, unknown>;
}

export function createTransport(
    options: TransportOptions = {},
): pino.TransportMultiOptions {
    const { target = "pretty", destination, options: targetOptions = {} } = options;

    switch (target) {
        case "pretty": {
            return {
                targets: [{
                    level: "trace",
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        translateTime: "SYS:standard",
                        ignore: "pid,hostname",
                        ...targetOptions,
                    },
                }],
            };
        }

        case "file": {
            if (!destination || typeof destination !== "string") {
                throw new Error("File transport requires a destination path");
            }
            return { targets: [{ level: "trace", target: "pino/file", options: { destination, ...targetOptions } }] };
        }

        case "stream": {
            if (!destination || typeof destination !== "object") {
                throw new Error("Stream transport requires a writable stream");
            }
            return { targets: [{ level: "trace", target: "pino/file", options: { destination, ...targetOptions } }] };
        }

        default:
            throw new Error(`Unknown transport target: ${target}`);
    }
}

export function createMultiTransport(
    transports: Array<{
        level?: string;
        target: "pretty" | "file" | "stream";
        destination?: NodeJS.WritableStream | string;
        options?: Record<string, unknown>;
    }>,
): pino.TransportMultiOptions {
    const targets: Array<pino.TransportTargetOptions> = [];

    for (const t of transports) {
        const transport = createTransport({
            target: t.target,
            destination: t.destination,
            options: t.options,
        });

        for (const target of transport.targets) {
            targets.push({ ...target, level: t.level ?? "trace" } as pino.TransportTargetOptions);
        }
    }

    return { targets };
}