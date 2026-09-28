import { createDatabase } from "@oneunit/database";

const db = createDatabase({
    application_name: "example-basic",
    logger: console,
});

try {
    const now = await db.queryOne("SELECT NOW() AS now");
    console.log("connected", now);

    const health = await db.health();
    console.log("health", health.status, health.latency);
} finally {
    await db.shutdown();
}
