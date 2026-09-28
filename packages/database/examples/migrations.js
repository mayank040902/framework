import { createDatabase } from "@oneunit/database";

const db = createDatabase({ application_name: "example-migrations" });

const migrations = [
    {
        id: "001_example_items",
        up: `
            CREATE TABLE IF NOT EXISTS example_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL
            )
        `,
        down: "DROP TABLE IF EXISTS example_items",
    },
];

try {
    const applied = await db.migrate.run({ migrations });
    const status = await db.migrate.status({ migrations });

    console.log("applied", applied);
    console.log("status", status);
} finally {
    await db.shutdown();
}
