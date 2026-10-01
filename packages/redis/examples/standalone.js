/**
 * Standalone client: connect, check health, read and write, disconnect.
 *
 *   npm run example:standalone
 *
 * Environment:
 *   REDIS_URL    connection URL (default redis://localhost:6379)
 *   REDIS_SILENT set to "true" to suppress connection-event logging
 *
 * `createClient` returns a plain ioredis instance, so every ioredis command is
 * available on it. The defaults are chosen so one client works for both plain
 * commands and BullMQ: `url` falls back to REDIS_URL, `lazyConnect` avoids
 * opening a socket at construction, and `maxRetriesPerRequest: null` is what
 * BullMQ requires.
 */

import { createClient, health, shutdown } from "@oneunit/redis";
import { REDIS_URL, exampleLogger, onFailure, release, run } from "./_setup.js";

await run("standalone", async () => {
  const client = createClient({ url: REDIS_URL }, exampleLogger);
  onFailure(() => shutdown(client, exampleLogger));

  // `lazyConnect` is on, so nothing is connected until the first command.
  // `health` issues PING and reports how long it took.
  const healthResult = await health(client);

  if (healthResult.status === "down") {
    // Always shut the client down, including on this early exit. ioredis
    // retries in the background, so a client left open keeps the event loop
    // alive and the script never exits.
    console.log("Redis is not reachable, stopping here.");
    console.log("Set REDIS_URL if your server is not on localhost:6379.");
    console.log("Health:", healthResult);
    await release();
    return;
  }

  console.log("Health:", healthResult);

  await client.set("greeting", "hello from @oneunit/redis");
  console.log("GET greeting:", await client.get("greeting"));

  // INCR is atomic in Redis, so concurrent callers cannot interleave.
  await client.set("visits", 0);
  const visits = await client.incrby("visits", 5);
  console.log("INCRBY visits 5 ->", visits);

  // EXPIRE sets a TTL in seconds. A key with no TTL lives forever, which is
  // the usual cause of a Redis instance quietly filling up.
  await client.expire("greeting", 60);
  console.log("TTL greeting:", await client.ttl("greeting"), "seconds");

  await client.del("greeting", "visits");

  await release();
  console.log("\nDisconnected cleanly.");
});
