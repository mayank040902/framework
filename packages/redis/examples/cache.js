/**
 * Read-through cache: Redis in front of a slow "database".
 *
 *   npm run example:cache
 *
 * Environment:
 *   REDIS_URL    connection URL (default redis://localhost:6379)
 *   REDIS_SILENT set to "true" to suppress connection-event logging
 *
 * The point of the pattern is that the cache key, the TTL, and the
 * serialisation all live in one place, so callers only ever see a plain object.
 * The two failure modes worth knowing about are both shown below: a TTL that is
 * too long serves stale data, and no TTL at all grows Redis without limit.
 */

import { createClient, health, shutdown } from "@oneunit/redis";
import { REDIS_URL, exampleLogger, onFailure, release, run } from "./_setup.js";

const CACHE_TTL_SECONDS = 60;
const KEY_PREFIX = "example:cache:";

await run("cache", async () => {
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

  async function fetchUserFromDatabase(userId) {
    // Stands in for a real query. The delay is what makes the cache worth
    // having and makes the timing difference visible below.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
    };
  }

  async function getUser(userId) {
    const key = `${KEY_PREFIX}user:${userId}`;

    const cached = await client.get(key);
    if (cached !== null) {
      console.log(`  HIT  ${key}`);
      return JSON.parse(cached);
    }

    console.log(`  MISS ${key}`);
    const user = await fetchUserFromDatabase(userId);

    // SETEX writes the value and its TTL in one round trip, so the key can
    // never end up stored without an expiry if the process dies midway.
    await client.setex(key, CACHE_TTL_SECONDS, JSON.stringify(user));

    return user;
  }

  console.log("First request:");
  const started = Date.now();
  const first = await getUser(123);
  console.log("  ->", first, `(${Date.now() - started}ms, hit the database)`);

  console.log("\nSecond request:");
  const cachedStart = Date.now();
  const second = await getUser(123);
  console.log(
    "  ->",
    second,
    `(${Date.now() - cachedStart}ms, served from Redis)`,
  );

  const ttl = await client.ttl(`${KEY_PREFIX}user:123`);
  console.log(`\nCached entry expires in ${ttl}s.`);

  // A negative TTL means the key has no expiry set, which is the bug to avoid
  // in production: it survives deploys and restarts indefinitely.
  if (ttl === -1) {
    console.log("  WARNING: key has no TTL; it will never expire on its own.");
  }

  // Cache invalidation: delete the key so the next read repopulates it.
  await client.del(`${KEY_PREFIX}user:123`);
  console.log("\nInvalidated the entry.");

  // SCAN rather than KEYS. KEYS blocks the server for the length of the scan,
  // which on a large keyspace is a production outage.
  const cursor = "0";
  const [next, keys] = await client.scan(
    cursor,
    "MATCH",
    `${KEY_PREFIX}*`,
    "COUNT",
    100,
  );
  console.log(
    `SCAN from ${cursor} returned cursor ${next} and ${keys.length} matching keys.`,
  );

  await client.del(`${KEY_PREFIX}user:123`);
  await release();
  console.log("\nDisconnected cleanly.");
});
