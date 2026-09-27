import test from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "../src/index.js";
import { readFileSync } from "node:fs";

test("createDatabase exposes the original and extended surface", () => {
    const db = createDatabase({
        host: "127.0.0.1",
        port: 5432,
        database: "unused",
        user: "unused",
        password: "unused",
        max: 1,
    });

    assert.equal(typeof db.query, "function");
    assert.equal(typeof db.getClient, "function");
    assert.equal(typeof db.releaseClient, "function");
    assert.equal(typeof db.transaction, "function");
    assert.equal(typeof db.savepoint, "function");
    assert.equal(typeof db.stream, "function");
    assert.equal(typeof db.cursor, "function");
    assert.equal(typeof db.check, "function");
    assert.equal(typeof db.shutdown, "function");
    assert.equal(typeof db.schema.create.table, "function");

    assert.equal(typeof db.queryOne, "function");
    assert.equal(typeof db.prepare, "function");
    assert.equal(typeof db.health, "function");
    assert.equal(typeof db.batch.insertMany, "function");
    assert.equal(typeof db.from, "function");
    assert.equal(typeof db.model, "function");
    assert.equal(typeof db.migrate.run, "function");
    assert.ok(db.metrics);

    return db.shutdown();
});

test("package.json has no workspace runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };

    for (const [name, version] of Object.entries(deps)) {
        assert.equal(String(version).includes("workspace:"), false, `${name}@${version}`);
    }
});
