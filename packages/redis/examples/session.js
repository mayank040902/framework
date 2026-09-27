import { createClient, shutdown, silentLogger } from "../dist/index.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
const SESSION_TTL = 3600;

const client = createClient({ url }, process.env.REDIS_SILENT === "true" ? silentLogger : undefined);

const sessions = {
    async create(userId, data = {}) {
        const sessionId = crypto.randomUUID();
        const session = {
            id: sessionId,
            userId,
            createdAt: Date.now(),
            ...data,
        };
        await client.setex(`session:${sessionId}`, SESSION_TTL, JSON.stringify(session));
        return session;
    },
    
    async get(sessionId) {
        const data = await client.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    },
    
    async update(sessionId, data) {
        const session = await this.get(sessionId);
        if (!session) return null;
        
        const updated = { ...session, ...data, updatedAt: Date.now() };
        await client.setex(`session:${sessionId}`, SESSION_TTL, JSON.stringify(updated));
        return updated;
    },
    
    async delete(sessionId) {
        return client.del(`session:${sessionId}`);
    },
    
    async extend(sessionId, ttl = SESSION_TTL) {
        return client.expire(`session:${sessionId}`, ttl);
    },
};

async function runDemo() {
    console.log("=== Create session ===");
    const session = await sessions.create("user-123", { role: "admin", permissions: ["read", "write"] });
    console.log("Created:", session);
    
    console.log("\n=== Get session ===");
    const retrieved = await sessions.get(session.id);
    console.log("Retrieved:", retrieved);
    
    console.log("\n=== Update session ===");
    const updated = await sessions.update(session.id, { lastActivity: Date.now() });
    console.log("Updated:", updated);
    
    console.log("\n=== Extend session TTL ===");
    await sessions.extend(session.id, 7200);
    console.log("Extended to 2 hours");
    
    console.log("\n=== Delete session ===");
    await sessions.delete(session.id);
    const deleted = await sessions.get(session.id);
    console.log("Deleted, get returns:", deleted);
    
    await shutdown(client);
}

runDemo().catch(console.error);