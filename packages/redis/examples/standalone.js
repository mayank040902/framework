import { createClient, health, shutdown, silentLogger } from "../dist/index.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

const client = createClient({ url }, process.env.REDIS_SILENT === "true" ? silentLogger : undefined);

console.log("Connected to Redis");

const result = await health(client);
console.log("Health check:", result);

await client.set("hello", "world");
const value = await client.get("hello");
console.log("GET hello:", value);

await shutdown(client);
console.log("Disconnected");