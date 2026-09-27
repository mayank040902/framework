import test from "node:test";
import assert from "node:assert/strict";
import * as kafka from "../src/index.js";

test("public API exports are present", () => {
    const names = [
        "createKafka",
        "createKafkaClient",
        "KafkaClient",
        "createProducer",
        "createConsumer",
        "createAdmin",
        "subscribeToTopic",
        "consumeMessages",
        "registerShutdown",
        "shutdownClient",
        "isKafkaConfigured",
        "getSslConfig",
        "getSaslConfig",
        "createKafkaMessage",
        "parseKafkaMessage",
        "createLoggerAdapter",
        "createCodecAdapter",
        "createConfigAdapter",
        "jsonCodec",
        "bytesCodec",
        "encode",
        "decode",
        "silentLogger",
        "consoleLogger",
        "KafkaConfigError",
        "KafkaConnectionError",
        "KafkaDecodeError",
    ];

    for (const name of names) {
        assert.equal(kafka[name] === undefined, false, `${name} should be exported`);
    }
});
