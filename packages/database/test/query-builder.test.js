import test from "node:test";
import assert from "node:assert/strict";

import { QueryBuilder, createQueryBuilder, sql, raw, quoteIdent } from "../src/index.js";

test("quoteIdent quotes schema-qualified names and escapes quotes", () => {
    assert.equal(quoteIdent("public.users"), '"public"."users"');
    assert.equal(quoteIdent('weird"name'), '"weird""name"');
    assert.equal(quoteIdent("*"), "*");
});

test("sql tagged template parameterizes values", () => {
    const fragment = sql`SELECT * FROM users WHERE id = ${1} AND status IN (${["a", "b"]})`;
    assert.equal(fragment.text, "SELECT * FROM users WHERE id = $1 AND status IN ($2, $3)");
    assert.deepEqual(fragment.values, [1, "a", "b"]);
});

test("sql nesting renumbers placeholders", () => {
    const fragment = sql`SELECT * FROM t WHERE (${sql`a = ${1} OR b = ${2}`}) AND c = ${3}`;
    assert.equal(fragment.text, "SELECT * FROM t WHERE (a = $1 OR b = $2) AND c = $3");
    assert.deepEqual(fragment.values, [1, 2, 3]);
});

test("sql.join merges nested values", () => {
    const fragment = sql`WHERE x IN (${sql.join([1, 2, 3])})`;
    assert.equal(fragment.text, "WHERE x IN ($1, $2, $3)");
    assert.deepEqual(fragment.values, [1, 2, 3]);
});

test("select builder produces parameterized SQL", () => {
    const query = new QueryBuilder({ table: "users" })
        .select(["id", "email"])
        .where({ status: "active" })
        .whereIn("role", ["admin", "user"])
        .whereNull("deleted_at")
        .orderBy("created_at", "desc")
        .limit(10)
        .offset(5);

    const { text, values } = query.toSQL();

    assert.equal(
        text,
        'SELECT "id", "email" FROM "users" WHERE "status" = $1 AND "role" IN ($2, $3) AND "deleted_at" IS NULL ORDER BY "created_at" DESC LIMIT $4 OFFSET $5',
    );
    assert.deepEqual(values, ["active", "admin", "user", 10, 5]);
});

test("whereIn with an empty list compiles to FALSE", () => {
    const { text, values } = new QueryBuilder({ table: "t" }).select().whereIn("id", []).toSQL();
    assert.match(text, /WHERE FALSE/);
    assert.deepEqual(values, []);
});

test("unsupported operators are rejected", () => {
    assert.throws(
        () => new QueryBuilder({ table: "t" }).select().where("id", "; DROP TABLE t", 1),
        /Unsupported SQL operator/,
    );
});

test("insert builder handles multi-row values and conflicts", () => {
    const { text, values } = new QueryBuilder({ table: "users" })
        .insert([{ a: 1, b: 2 }, { a: 3, b: 4 }])
        .onConflict({ columns: ["a"], update: ["b"] })
        .returning(["id"])
        .toSQL();

    assert.equal(
        text,
        'INSERT INTO "users" ("a", "b") VALUES ($1, $2), ($3, $4) ON CONFLICT ("a") DO UPDATE SET "b" = EXCLUDED."b" RETURNING "id"',
    );
    assert.deepEqual(values, [1, 2, 3, 4]);
});

test("update and delete builders are parameterized", () => {
    const update = new QueryBuilder({ table: "users" })
        .update({ name: "x" })
        .where({ id: 1 })
        .toSQL();
    assert.equal(update.text, 'UPDATE "users" SET "name" = $1 WHERE "id" = $2');
    assert.deepEqual(update.values, ["x", 1]);

    const remove = new QueryBuilder({ table: "users" }).delete().where({ id: 9 }).toSQL();
    assert.equal(remove.text, 'DELETE FROM "users" WHERE "id" = $1');
    assert.deepEqual(remove.values, [9]);
});

test("builder executes through the injected query function and is awaitable", async () => {
    const calls = [];
    const from = createQueryBuilder({
        query: async (text, values) => {
            calls.push({ text, values });
            return { rows: [{ id: 1 }], rowCount: 1 };
        },
    });

    const result = await from("users").select().where({ id: 1 });
    assert.deepEqual(result.rows, [{ id: 1 }]);
    assert.equal(calls.length, 1);

    const first = await from("users").select().where({ id: 2 }).first();
    assert.deepEqual(first, { id: 1 });
});

test("raw fragments can be used in select lists", () => {
    const { text } = new QueryBuilder({ table: "users" }).select(raw("COUNT(*)::int AS count")).toSQL();
    assert.equal(text, 'SELECT COUNT(*)::int AS count FROM "users"');
});
