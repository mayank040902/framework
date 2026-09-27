import { createClient, health, shutdown, silentLogger } from "../dist/index.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

const client = createClient({ url }, process.env.REDIS_SILENT === "true" ? silentLogger : undefined);

const CACHE_TTL = 60;

async function getUser(userId) {
    const cacheKey = `user:${userId}`;
    
    const cached = await client.get(cacheKey);
    if (cached) {
        console.log("Cache HIT for", cacheKey);
        return JSON.parse(cached);
    }
    
    console.log("Cache MISS for", cacheKey);
    const user = await fetchUserFromDatabase(userId);
    
    await client.setex(cacheKey, CACHE_TTL, JSON.stringify(user));
    return user;
}

async function fetchUserFromDatabase(userId) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { id: userId, name: `User ${userId}`, email: `user${userId}@example.com` };
}

async function runDemo() {
    console.log("=== First request (cache miss) ===");
    const user1 = await getUser("123");
    console.log("User:", user1);
    
    console.log("\n=== Second request (cache hit) ===");
    const user2 = await getUser("123");
    console.log("User:", user2);
    
    console.log("\n=== Health check ===");
    console.log(await health(client));
    
    await shutdown(client);
}

runDemo().catch(console.error);