import test from "node:test";
import assert from "node:assert/strict";

function freshImport() {
    return import(
        `../src/client/config.js?t=${Date.now()}-${Math.random()}`
    );
}

test("dbConfig parses environment variables", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/writer";
    process.env.DB_MAX_CONN = "5";
    process.env.DB_CONN_TIMEOUT = "1000";
    process.env.DB_IDLE_TIMEOUT = "2000";
    process.env.DB_SSL = "false";
    process.env.DB_APP_NAME = "writer-test";

    const { dbConfig } = await freshImport();

    assert.equal(
        dbConfig.connectionString,
        "postgresql://user:pass@localhost:5432/writer",
    );
    assert.equal(dbConfig.max, 5);
    assert.equal(dbConfig.connectionTimeoutMillis, 1000);
    assert.equal(dbConfig.idleTimeoutMillis, 2000);
    assert.equal(dbConfig.ssl, false);
    assert.equal(dbConfig.application_name, "writer-test");
});

test("dbConfig falls back to defaults when env is missing", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_MAX_CONN;
    delete process.env.DB_CONN_TIMEOUT;
    delete process.env.DB_IDLE_TIMEOUT;
    delete process.env.DB_SSL;
    delete process.env.DB_APP_NAME;

    const { dbConfig } = await freshImport();

    assert.equal(dbConfig.connectionString, undefined);
    assert.equal(dbConfig.max, 20);
    assert.equal(dbConfig.connectionTimeoutMillis, 5000);
    assert.equal(dbConfig.idleTimeoutMillis, 30000);
    assert.equal(dbConfig.ssl, false);
    assert.equal(dbConfig.application_name, "Unknown App");
});

test("dbConfig enables ssl without verification when CA is missing", async () => {
    process.env.DB_SSL = "true";
    process.env.DB_SSL_CA = "/nonexistent-ca.pem";

    const { dbConfig } = await freshImport();

    assert.deepEqual(dbConfig.ssl, { rejectUnauthorized: false });
});
