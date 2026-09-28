import { createDatabase, id, timestamp } from "@oneunit/database";

const db = createDatabase({ application_name: "example-models" });

try {
    await db.schema.create.table("example_users", {
        ...id(),
        email: "TEXT NOT NULL",
        ...timestamp("created_at"),
    });

    const users = db.model("example_users");
    const created = await users.insert({ email: "ada@example.com" });
    const found = await users.findOne({ email: "ada@example.com" });

    console.log("created", created?.id);
    console.log("found", found?.email);
} finally {
    await db.schema.drop.table("example_users", { cascade: true }).catch(() => {});
    await db.shutdown();
}
