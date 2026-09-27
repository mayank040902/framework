import fs from "node:fs";
import { envBoolean, envString } from "../env.js";
import { readConfigBoolean, readConfigString } from "../adapters/config.js";

function readCert(value: string | Buffer | Buffer[] | boolean | undefined): string | Buffer | Buffer[] | undefined {
    if (value === undefined || value === null || value === false) {
        return undefined;
    }

    if (Buffer.isBuffer(value) || Array.isArray(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    if (trimmed === "") {
        return undefined;
    }

    if (trimmed.includes("-----BEGIN") || trimmed.includes("\n")) {
        return trimmed;
    }

    if (fs.existsSync(trimmed)) {
        return fs.readFileSync(trimmed, "utf8");
    }

    return trimmed;
}

export function getSslConfig(options: Record<string, unknown> = {}): object | boolean | undefined {
    if (options.ssl === false) {
        return undefined;
    }

    if (options.ssl && typeof options.ssl === "object") {
        return options.ssl;
    }

    const ca = options.ca ?? readConfigString(options, "KAFKA_CA") ?? envString("KAFKA_CA");
    const cert = options.cert ?? readConfigString(options, "KAFKA_CERT") ?? envString("KAFKA_CERT");
    const key = options.key ?? readConfigString(options, "KAFKA_KEY") ?? envString("KAFKA_KEY");
    const enabled = options.ssl === true || readConfigBoolean(options, "KAFKA_SSL", false);

    let rejectUnauthorized = options.rejectUnauthorized;
    if (rejectUnauthorized === undefined && process.env.KAFKA_SSL_REJECT_UNAUTHORIZED !== undefined) {
        rejectUnauthorized = envBoolean("KAFKA_SSL_REJECT_UNAUTHORIZED", true);
    }

    const caValue = readCert(ca as string | Buffer | Buffer[] | boolean | undefined);
    const certValue = readCert(cert as string | Buffer | Buffer[] | boolean | undefined);
    const keyValue = readCert(key as string | Buffer | Buffer[] | boolean | undefined);
    const hasMaterial = caValue !== undefined || certValue !== undefined || keyValue !== undefined;

    if (!enabled && !hasMaterial) {
        return undefined;
    }

    const ssl: Record<string, unknown> = {};

    if (caValue !== undefined) {
        ssl.ca = Array.isArray(caValue) ? caValue : [caValue];
    }
    if (certValue !== undefined) {
        ssl.cert = certValue;
    }
    if (keyValue !== undefined) {
        ssl.key = keyValue;
    }
    if (rejectUnauthorized !== undefined) {
        ssl.rejectUnauthorized = rejectUnauthorized;
    }

    if (Object.keys(ssl).length === 0) {
        return true;
    }

    return ssl;
}