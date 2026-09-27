import test from "node:test";
import assert from "node:assert/strict";

import { loadDatabaseConfig, parseSslConfig } from "../src/index.js";

test("loadDatabaseConfig maps the documented DATABASE_* variables", () => {
    const config = loadDatabaseConfig({}, {
        DATABASE_URL: "postgresql://u:p@db:5432/app",
        DATABASE_HOST: "db",
        DATABASE_PORT: "5433",
        DATABASE_NAME: "app",
        DATABASE_USER: "u",
        DATABASE_PASSWORD: "p",
        DB_MAX_CONN: "7",
        DB_MIN_CONN: "2",
        DB_IDLE_TIMEOUT: "1000",
        DB_CONN_TIMEOUT: "2000",
        DB_STATEMENT_TIMEOUT: "3000",
        DB_QUERY_TIMEOUT: "4000",
        DB_APP_NAME: "svc",
        DB_SSL: "false",
    });

    assert.equal(config.connectionString, "postgresql://u:p@db:5432/app");
    assert.equal(config.host, "db");
    assert.equal(config.port, 5433);
    assert.equal(config.database, "app");
    assert.equal(config.user, "u");
    assert.equal(config.password, "p");
    assert.equal(config.max, 7);
    assert.equal(config.min, 2);
    assert.equal(config.idleTimeoutMillis, 1000);
    assert.equal(config.connectionTimeoutMillis, 2000);
    assert.equal(config.statement_timeout, 3000);
    assert.equal(config.query_timeout, 4000);
    assert.equal(config.application_name, "svc");
    assert.equal(config.ssl, false);
});

test("explicit overrides win over environment values", () => {
    const config = loadDatabaseConfig(
        { host: "override", max: 99, ssl: { rejectUnauthorized: true } },
        { DATABASE_HOST: "env", DB_MAX_CONN: "1" },
    );

    assert.equal(config.host, "override");
    assert.equal(config.max, 99);
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});

test("undefined overrides are ignored rather than clearing env values", () => {
    const config = loadDatabaseConfig(
        { host: undefined, max: undefined },
        { DATABASE_HOST: "env", DB_MAX_CONN: "3" },
    );

    assert.equal(config.host, "env");
    assert.equal(config.max, 3);
});

test("DB_POOL_SIZE is accepted as an alias for pool size", () => {
    const config = loadDatabaseConfig({}, { DB_POOL_SIZE: "12" });
    assert.equal(config.max, 12);
});

test("DATABASE_POOL_* and timeout aliases are accepted", () => {
    const config = loadDatabaseConfig({}, {
        DATABASE_POOL_MAX: "9",
        DATABASE_POOL_MIN: "1",
        DATABASE_CONNECTION_TIMEOUT: "1500",
        DATABASE_QUERY_TIMEOUT: "2500",
        DATABASE_STATEMENT_TIMEOUT: "3500",
        DATABASE_SSL: "false",
    });

    assert.equal(config.max, 9);
    assert.equal(config.min, 1);
    assert.equal(config.connectionTimeoutMillis, 1500);
    assert.equal(config.query_timeout, 2500);
    assert.equal(config.statement_timeout, 3500);
});

test("parseSslConfig enables verification when a CA file exists", () => {
    const ssl = parseSslConfig({ DB_SSL: "true" });
    assert.deepEqual(ssl, { rejectUnauthorized: false });
});
