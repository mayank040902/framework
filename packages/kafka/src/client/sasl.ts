import { envString } from "../env.js";
import { readConfigString } from "../adapters/config.js";

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

    const username = source.username ?? readConfigString(options, "KAFKA_SASL_USERNAME") ?? envString("KAFKA_SASL_USERNAME");
    const password = source.password ?? readConfigString(options, "KAFKA_SASL_PASSWORD") ?? envString("KAFKA_SASL_PASSWORD");

    if (!username || !password) {
        return undefined;
    }

    return {
        mechanism,
        username,
        password,
    };
}