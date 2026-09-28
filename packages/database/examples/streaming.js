import { createDatabase } from "@oneunit/database";

const db = createDatabase({ application_name: "example-streaming" });

try {
    const cursor = await db.cursor("SELECT generate_series(1, 5) AS n");
    for await (const row of cursor) {
        console.log("row", row.n);
    }
} finally {
    await db.shutdown();
}
