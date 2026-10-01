/**
 * Session store on Redis.
 *
 *   npm run example:session
 *
 * Environment:
 *   REDIS_URL    connection URL (default redis://localhost:6379)
 *   REDIS_SILENT set to "true" to suppress connection-event logging
 *
 * Sessions belong in Redis rather than in process memory for two reasons: they
 * survive a restart, and they are visible to every instance behind a load
 * balancer. The TTL is what bounds their lifetime, so it is set on write and
 * refreshed on activity.
 */

import { randomUUID } from "node:crypto";
import { createClient, health, shutdown } from "@oneunit/redis";
import { REDIS_URL, exampleLogger, onFailure, release, run } from "./_setup.js";

const SESSION_TTL_SECONDS = 3600;
const KEY_PREFIX = "example:session:";

await run("session", async () => {
  const client = createClient({ url: REDIS_URL }, exampleLogger);
  onFailure(() => shutdown(client, exampleLogger));

  const healthResult = await health(client);
  if (healthResult.status === "down") {
    // Always shut down, including on this early exit: ioredis retries in the
    // background, so a client left open keeps the event loop alive and the
    // script never exits.
    console.log("Redis is not reachable, stopping here.");
    console.log("Health:", healthResult);
    await release();
    return;
  }

  const key = (sessionId) => `${KEY_PREFIX}${sessionId}`;

  const sessions = {
    async create(userId, data = {}) {
      const session = {
        id: randomUUID(),
        userId,
        createdAt: Date.now(),
        ...data,
      };

      await client.setex(
        key(session.id),
        SESSION_TTL_SECONDS,
        JSON.stringify(session),
      );

      return session;
    },

    async get(sessionId) {
      // Returns null rather than throwing for a missing session, so callers
      // treat "no session" and "expired session" the same way.
      const raw = await client.get(key(sessionId));
      return raw === null ? null : JSON.parse(raw);
    },

    async update(sessionId, patch) {
      const existing = await sessions.get(sessionId);
      if (!existing) {
        return null;
      }

      const updated = { ...existing, ...patch, updatedAt: Date.now() };

      // Rewriting with SETEX resets the TTL to the full window. Refresh on
      // a sliding window only; an absolute-expiry session would use PERSIST
      // here instead so the original deadline stands.
      await client.setex(
        key(sessionId),
        SESSION_TTL_SECONDS,
        JSON.stringify(updated),
      );

      return updated;
    },

    async extend(sessionId, ttlSeconds = SESSION_TTL_SECONDS) {
      // EXPIRE on a missing key returns 0, not 1, which is the cheapest way
      // to tell whether the session was still alive.
      return client.expire(key(sessionId), ttlSeconds);
    },

    async touch(sessionId) {
      // Refresh the TTL without reading or rewriting the payload.
      return sessions.extend(sessionId);
    },

    async destroy(sessionId) {
      return client.del(key(sessionId));
    },
  };

  console.log("Create:");
  const session = await sessions.create("user-123", {
    role: "admin",
    permissions: ["read", "write"],
  });
  console.log("  ", session);
  console.log("   TTL:", await client.ttl(key(session.id)), "seconds");

  console.log("\nGet:");
  console.log("  ", await sessions.get(session.id));

  console.log("\nGet a session that does not exist:");
  console.log("  ", await sessions.get("not-a-real-session"));

  console.log("\nUpdate:");
  const updated = await sessions.update(session.id, {
    lastActivity: Date.now(),
  });
  console.log(
    "   role:",
    updated.role,
    "| updatedAt set:",
    updated.updatedAt > updated.createdAt,
  );

  console.log("\nExtend the TTL to 2 hours:");
  const extended = await sessions.extend(session.id, 7200);
  console.log(
    "   EXPIRE returned",
    extended,
    "| TTL now:",
    await client.ttl(key(session.id)),
  );

  console.log("\nTouch (refresh TTL without rewriting the payload):");
  await sessions.touch(session.id);
  console.log("   TTL:", await client.ttl(key(session.id)));

  console.log("\nDestroy:");
  console.log("   DEL removed", await sessions.destroy(session.id), "key(s)");
  console.log("   get after destroy:", await sessions.get(session.id));

  await release();
  console.log("\nDisconnected cleanly.");
});
