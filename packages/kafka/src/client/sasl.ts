import { envString } from "../env.js";
import { KafkaConfigError } from "../errors.js";
import { readConfigString } from "../adapters/config.js";

// Mirrors SASLMechanism in kafkajs. Keep this in sync with the KafkaJS version.
const SASL_MECHANISMS = new Set([
    "plain",
    "scram-sha-256",
    "scram-sha-512",
    "aws",
    "oauthbearer",
]);

type SaslSource = Record<string, unknown> & {
    mechanism?: string;
    username?: string;
    password?: string;
};

export function getSaslConfig(options: Record<string, unknown> = {}): object | undefined {
    if (options.sasl === false) {
        return undefined;
    }

    const source = (options.sasl && typeof options.sasl === "object" ? options.sasl : options) as SaslSource;

    const mechanism = String(
        source.mechanism ?? readConfigString(options, "KAFKA_SASL_MECHANISM", "") ?? envString("KAFKA_SASL_MECHANISM", ""),
    )
        .trim()
        .toLowerCase();

    if (!mechanism) {
        return undefined;
    }

    if (!SASL_MECHANISMS.has(mechanism)) {
        throw new KafkaConfigError(
            `Unknown SASL mechanism "${mechanism}". Supported: ${[...SASL_MECHANISMS].join(", ")}`,
        );
    }

    const username = source.username ?? (options as SaslSource).username ?? readConfigString(options, "KAFKA_SASL_USERNAME") ?? envString("KAFKA_SASL_USERNAME");
    const password = source.password ?? (options as SaslSource).password ?? readConfigString(options, "KAFKA_SASL_PASSWORD") ?? envString("KAFKA_SASL_PASSWORD");

    if (!username || !password) {
        return undefined;
    }

    return {
        mechanism,
        username,
        password,
    };
}