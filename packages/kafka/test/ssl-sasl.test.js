import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createConfigAdapter, getSaslConfig, getSslConfig, KafkaConfigError } from "../src/index.js";

test("getSslConfig returns undefined without TLS config", () => {
    const config = createConfigAdapter({});
    assert.equal(getSslConfig({ config }), undefined);
});

test("getSslConfig reads PEM strings and files", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";
    const ssl = getSslConfig({ ca: pem, rejectUnauthorized: false });
    assert.deepEqual(ssl.ca, [pem]);
    assert.equal(ssl.rejectUnauthorized, false);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kafka-ssl-"));
    const caPath = path.join(dir, "ca.pem");
    fs.writeFileSync(caPath, pem);
    const fromFile = getSslConfig({ ca: caPath });
    assert.deepEqual(fromFile.ca, [pem]);
});

test("getSslConfig can enable TLS without certificates", () => {
    assert.equal(getSslConfig({ ssl: true }), true);
    const config = createConfigAdapter({ KAFKA_SSL: "true" });
    assert.equal(getSslConfig({ config }), true);
});

test("getSslConfig normalises a string rejectUnauthorized", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";

    assert.equal(getSslConfig({ ca: pem, rejectUnauthorized: "false" }).rejectUnauthorized, false);
    assert.equal(getSslConfig({ ca: pem, rejectUnauthorized: "no" }).rejectUnauthorized, false);
    assert.equal(getSslConfig({ ca: pem, rejectUnauthorized: "true" }).rejectUnauthorized, true);
    // Unrecognised input keeps verification on rather than silently disabling it.
    assert.equal(getSslConfig({ ca: pem, rejectUnauthorized: "maybe" }).rejectUnauthorized, true);
});

test("getSslConfig reads rejectUnauthorized from a config adapter", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";
    const config = createConfigAdapter({
        KAFKA_CA: pem,
        KAFKA_SSL_REJECT_UNAUTHORIZED: "false",
    });
    assert.equal(getSslConfig({ config }).rejectUnauthorized, false);
});

test("getSslConfig reports a certificate path that is not a file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kafka-ssl-dir-"));
    assert.throws(() => getSslConfig({ ca: dir }), KafkaConfigError);
});

test("getSaslConfig rejects an unknown mechanism", () => {
    assert.throws(
        () => getSaslConfig({ sasl: { mechanism: "bogus", username: "user", password: "secret" } }),
        KafkaConfigError,
    );
});

test("getSaslConfig accepts every mechanism KafkaJS supports", () => {
    // kafkajs SASLMechanism: plain, scram-sha-256, scram-sha-512, aws, oauthbearer.
    // Validation must never reject one of these; the shape this package models is
    // username/password, so the others resolve to undefined rather than throwing.
    for (const mechanism of ["plain", "scram-sha-256", "scram-sha-512", "aws", "oauthbearer"]) {
        assert.doesNotThrow(
            () => getSaslConfig({ sasl: { mechanism, username: "user", password: "secret" } }),
            `${mechanism} should not be rejected`,
        );
    }
});

test("getSaslConfig returns credentials from options or config adapter", () => {
    assert.equal(getSaslConfig(), undefined);

    const fromOptions = getSaslConfig({
        sasl: { mechanism: "plain", username: "user", password: "secret" },
    });
    assert.deepEqual(fromOptions, {
        mechanism: "plain",
        username: "user",
        password: "secret",
    });

    const config = createConfigAdapter({
        KAFKA_SASL_MECHANISM: "scram-sha-256",
        KAFKA_SASL_USERNAME: "alice",
        KAFKA_SASL_PASSWORD: "pw",
    });
    assert.deepEqual(getSaslConfig({ config }), {
        mechanism: "scram-sha-256",
        username: "alice",
        password: "pw",
    });
});

test("getSaslConfig falls back to top-level credentials", () => {
    const mixed = getSaslConfig({
        sasl: { mechanism: "plain" },
        username: "user",
        password: "secret",
    });
    assert.deepEqual(mixed, {
        mechanism: "plain",
        username: "user",
        password: "secret",
    });
});

test("getSaslConfig returns undefined when no mechanism is configured", () => {
    assert.equal(getSaslConfig({ username: "user", password: "secret" }), undefined);
});
