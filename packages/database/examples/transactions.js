import { createDatabase } from "@oneunit/database";

const db = createDatabase({ application_name: "example-transactions" });

try {
    const result = await db.transaction(async (client) => {
        const { rows } = await client.query(
            "SELECT $1::int AS debit, $2::int AS credit",
            [10, 10],
        );

        await db.savepoint(client, "audit", async (tx) => {
            await tx.query("SELECT $1::text AS event", ["transfer"]);
        });

        return rows[0];
    }, {
        isolation: "READ COMMITTED",
        timeout: 5_000,
    });

    console.log("transfer", result);
} finally {
    await db.shutdown();
}
