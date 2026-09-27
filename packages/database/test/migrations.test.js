import test from "node:test";
import assert from "node:assert/strict";

import { createMigrator } from "../src/index.js";

function makeClient() {
    const state = { applied: [], executed: [] };

    const client = {
        released: false,
        async query(text, values = []) {
            const sqlText = String(text).trim();

            if (sqlText.startsWith("SELECT pg_advisory_lock") || sqlText.startsWith("SELECT pg_advisory_unlock")) {
                return {};
            }
            if (sqlText.includes("CREATE TABLE IF NOT EXISTS")) {
                return {};
            }
            if (sqlText.includes("SELECT id, name, checksum, applied_at")) {
                return { rows: state.applied.map((row) => ({ ...row })) };
            }
            if (sqlText.includes("INSERT INTO") && sqlText.includes("_writer_migrations")) {
                state.applied.push({
                    id: values[0],
                    name: values[1],
                    checksum: values[2],
                    applied_at: new Date().toISOString(),
                });
                return {};
            }
            if (sqlText.includes("DELETE FROM") && sqlText.includes("_writer_migrations")) {
                state.applied = state.applied.filter((row) => row.id !== values[0]);
                return {};
            }
            if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sqlText)) {
                return {};
            }

            state.executed.push(sqlText);
            return {};
        },
        release() {
            client.released = true;
        },
    };

    return { client, state };
}

const migrations = [
    {
        id: "001_create_users",
        name: "create users",
        up: "CREATE TABLE users (id serial primary key)",
        down: "DROP TABLE users",
    },
    {
        id: "002_add_email",
        name: "add email index",
        up: async (ctx) => {
            await ctx.query("CREATE INDEX idx_users_email ON users (email)");
        },
        down: async (ctx) => {
            await ctx.query("DROP INDEX idx_users_email");
        },
    },
];

test("migrator applies pending migrations and records them", async () => {
    const { client, state } = makeClient();
    const migrator = createMigrator({ connect: async () => client });

    const applied = await migrator.run({ migrations });

    assert.deepEqual(applied, ["001_create_users", "002_add_email"]);
    assert.equal(state.applied.length, 2);
    assert.equal(state.executed.length, 2);
    assert.equal(client.released, true);
});

test("migrator is idempotent for already applied migrations", async () => {
    const { client, state } = makeClient();
    const migrator = createMigrator({ connect: async () => client });

    await migrator.run({ migrations });
    const second = await migrator.run({ migrations });

    assert.deepEqual(second, []);
    assert.equal(state.applied.length, 2);
    assert.equal(state.executed.length, 2);
});

test("migrator reports status", async () => {
    const { client } = makeClient();
    const migrator = createMigrator({ connect: async () => client });

    await migrator.run({ migrations });
    const status = await migrator.status({ migrations });

    assert.deepEqual(status, [
        { id: "001_create_users", name: "create users", applied: true, appliedAt: status[0].appliedAt },
        { id: "002_add_email", name: "add email index", applied: true, appliedAt: status[1].appliedAt },
    ]);
    assert.ok(status[0].appliedAt);
});

test("migrator rolls back the most recent migration", async () => {
    const { client, state } = makeClient();
    const migrator = createMigrator({ connect: async () => client });

    await migrator.run({ migrations });
    const rolledBack = await migrator.rollback({ migrations, steps: 1 });

    assert.deepEqual(rolledBack, ["002_add_email"]);
    assert.equal(state.applied.length, 1);
    assert.ok(state.executed.includes("DROP INDEX idx_users_email"));
});

test("migrator refuses to roll back a migration without down()", async () => {
    const { client } = makeClient();
    const migrator = createMigrator({ connect: async () => client });

    await migrator.run({ migrations: [{ id: "001", up: "SELECT 1" }] });

    await assert.rejects(
        () => migrator.rollback({ migrations: [{ id: "001", up: "SELECT 1" }] }),
        /no down\(\) migration provided/,
    );
});
