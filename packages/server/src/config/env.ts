import path from "node:path";

/**
 * Reads a string environment variable with an optional fallback.
 *
 * Surrounding whitespace is trimmed. Empty or whitespace-only values
 * are treated as unset.
 *
 * @param name - Environment variable name.
 * @param fallback - Value returned when the variable is unset or empty.
 * @returns The trimmed environment value or the fallback.
 */
export function envString(
    name: string,
    fallback?: string,
): string | undefined {
    const value = process.env[name];

    if (value === undefined || value.trim() === "") {
        return fallback;
    }

    return value.trim();
}

/**
 * Reads a numeric environment variable.
 *
 * @param name - Environment variable name.
 * @param fallback - Value returned when the variable is unset or invalid.
 * @returns The parsed number or the fallback.
 */
export function envNumber(
    name: string,
    fallback?: number,
): number | undefined {
    const value = envString(name);

    if (value === undefined) {
        return fallback;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Reads a boolean environment variable.
 *
 * Truthy values:
 * - true
 * - 1
 * - yes
 * - on
 *
 * Falsy values:
 * - false
 * - 0
 * - no
 * - off
 *
 * Matching is case-insensitive.
 *
 * @param name - Environment variable name.
 * @param fallback - Value returned when the variable is unset or invalid.
 * @returns The parsed boolean or the fallback.
 */
export function envBool(
    name: string,
    fallback?: boolean,
): boolean | undefined {
    const value = envString(name);

    if (value === undefined) {
        return fallback;
    }

    switch (value.toLowerCase()) {
        case "true":
        case "1":
        case "yes":
        case "on":
            return true;

        case "false":
        case "0":
        case "no":
        case "off":
            return false;

        default:
            return fallback;
    }
}

/**
 * Reads a comma-separated environment variable into a string array.
 *
 * Empty items are removed and surrounding whitespace is trimmed.
 *
 * @param name - Environment variable name.
 * @param fallback - Value returned when the variable is unset or empty.
 * @returns The parsed list or the fallback.
 */
export function envList(
    name: string,
    fallback?: string[],
): string[] | undefined {
    const value = envString(name);

    if (value === undefined) {
        return fallback;
    }

    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

/**
 * Resolves the effective Node.js environment.
 *
 * @param nodeEnv - Optional environment value. Defaults to process.env.NODE_ENV.
 * @returns A normalized environment name.
 */
export function resolveNodeEnv(
    nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
    const value = (nodeEnv ?? "development").trim().toLowerCase();

    return value || "development";
}

/**
 * Determines whether the application is running in development.
 *
 * @param nodeEnv - Optional environment value. Defaults to process.env.NODE_ENV.
 * @returns True when the environment is "development".
 */
export function isDevelopment(
    nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
    return resolveNodeEnv(nodeEnv) === "development";
}

/**
 * Determines whether the application is running in test.
 *
 * @param nodeEnv - Optional environment value. Defaults to process.env.NODE_ENV.
 * @returns True when the environment is "test".
 */
export function isTest(
    nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
    return resolveNodeEnv(nodeEnv) === "test";
}

/**
 * Determines whether the application is running in production.
 *
 * @param nodeEnv - Optional environment value. Defaults to process.env.NODE_ENV.
 * @returns True when the environment is "production".
 */
export function isProduction(
    nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
    return resolveNodeEnv(nodeEnv) === "production";
}

/**
 * Resolves the environment file path.
 *
 * Examples:
 * - development → .env.development
 * - production  → .env.production
 * - test        → .env.test
 *
 * @param baseDir - The base directory containing the environment file.
 * @param nodeEnv - Optional environment value. Defaults to process.env.NODE_ENV.
 * @returns The resolved environment file path.
 */
export function envFile(
    baseDir: string,
    nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
    const nEnv = resolveNodeEnv(nodeEnv);

    return path.join(baseDir, `.env.${nEnv}`);
}