import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createConfigAdapter, getSaslConfig, getSslConfig } from "../src/index.js";

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
