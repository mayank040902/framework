import {
    resolveNodeEnv,
    isDevelopment,
    isProduction,
    isTest,
    envNumber,
    envString,
} from "./env.js";

/**
 * Resolve the service configuration.
 *
 * Environment variables override the supplied defaults.
 *
 * @param port - Default service port.
 * @param host - Default service host.
 * @param serviceName - Default service name.
 * @param nodeEnv - Optional Node.js environment.
 * @returns The service configuration.
 */
export function serviceConfig(
    port: number,
    host: string,
    serviceName: string,
    nodeEnv: string = resolveNodeEnv(),
) {
    const environment = resolveNodeEnv(nodeEnv);

    return {
        port: envNumber("PORT", port)!,
        host: envString("HOST", host)!,
        serviceName: envString("SERVICE_NAME", serviceName)!,

        nodeEnv: environment,

        isDevelopment: isDevelopment(environment),
        isProduction: isProduction(environment),
        isTest: isTest(environment),
    };
}

/**
 * Resolves the current Node.js environment.
 *
 * @returns Lowercased environment name.
 */
export function nodeEnv(): string {
    return resolveNodeEnv();
}