/**
 * Batching many commands into one round trip with `runPipeline`.
 *
 *   npm run example:pipeline
 *
 * Environment:
 *   REDIS_URL    connection URL (default redis://localhost:6379)
 *   REDIS_SILENT set to "true" to suppress connection-event logging
 *
 * The point of the pattern is that N commands cost one network round trip
 * instead of N. That only pays off for a batch you already have in hand: if
 * each command depends on the previous one's result, it is a sequential script
 * and a pipeline cannot help.
 *
 * The failure worth seeing is at the bottom. A command that fails inside a
 * pipeline does not fail the pipeline — ioredis resolves the batch and reports
 * the error per command — so a batch can look successful while having silently
 * dropped a write.
 */

import {
  createClient,
  health,
  pipelineValues,
  runPipeline,
  shutdown,
} from "@oneunit/redis";
import { REDIS_URL, exampleLogger, onFailure, release, run } from "./_setup.js";

const KEY_PREFIX = "example:pipeline:";
const BATCH_SIZE = 100;

await run("pipeline", async () => {
  const client = createClient({ url: REDIS_URL }, exampleLogger);
  onFailure(() => shutdown(client, exampleLogger));

  const healthResult = await health(client);
  if (healthResult.status === "down") {
    // Shut down before returning: ioredis retries in the background, so a
    // client left open keeps the event loop alive and the script never exits.
    console.log("Redis is not reachable, stopping here.");
    console.log("Health:", healthResult);
    await release();
    return;
  }

  // --- 1. A write batch ---------------------------------------------------
  // Every key is independent, so all of them can go in one round trip.
  const writes = Array.from({ length: BATCH_SIZE }, (_, index) => ({
    label: `set:${index}`,
    run: (pipeline) => void pipeline.set(`${KEY_PREFIX}item:${index}`, index),
  }));

  const started = Date.now();
  const writeResult = await runPipeline(client, writes, {
    logger: exampleLogger,
  });
  console.log(
    `Wrote ${writeResult.results.length} keys in ${writeResult.durationMs}ms ` +
      `(${Date.now() - started}ms wall clock).`,
  );

  // `pipelineValues` is the convenience path when every command is expected to
  // succeed. It throws rather than hand back a sparse array if any of them did
  // not, so a failed write cannot be mistaken for a successful one.
  const values = pipelineValues(writeResult.results);
  console.log(`  all writes reported OK: ${values.every((v) => v === "OK")}`);

  // --- 2. A read batch ----------------------------------------------------
  // MSET/MSETNX aside, reads are the case pipelines are built for: a dashboard
  // that renders 100 rows can fetch them all at once.
  const reads = Array.from({ length: BATCH_SIZE }, (_, index) => ({
    label: `get:${index}`,
    run: (pipeline) => void pipeline.get(`${KEY_PREFIX}item:${index}`),
  }));

  const readResult = await runPipeline(client, reads, {
    logger: exampleLogger,
  });
  const readValues = pipelineValues(readResult.results);
  console.log(
    `Read ${readValues.length} keys in ${readResult.durationMs}ms, ` +
      `all present: ${readValues.every((v) => v !== null)}.`,
  );

  // --- 3. A batch where one command fails ---------------------------------
  // INCR on a string key is a real Redis error: WRONGTYPE, not a connection
  // problem. The batch still resolves, and every other command still runs.
  await client.set(`${KEY_PREFIX}string`, "not-a-number");

  const mixed = await runPipeline(
    client,
    [
      {
        label: "incr:string",
        run: (pipeline) => void pipeline.incr(`${KEY_PREFIX}string`),
      },
      {
        label: "set:fine",
        run: (pipeline) => void pipeline.set(`${KEY_PREFIX}fine`, "1"),
      },
      {
        label: "get:fine",
        run: (pipeline) => void pipeline.get(`${KEY_PREFIX}fine`),
      },
    ],
    { logger: exampleLogger },
  );

  console.log(
    `\nMixed batch: ${mixed.failed} of ${mixed.results.length} failed.`,
  );
  for (const step of mixed.results) {
    // The per-command error is the whole reason to use runPipeline over a bare
    // `client.pipeline()`. Reading only the values here would show `null` for
    // the failed INCR and look like a successful batch.
    console.log(
      `  ${step.error ? "FAIL" : " ok "} ${step.label}: ` +
        (step.error ? step.error.message : JSON.stringify(step.value)),
    );
  }

  // `throwOnError: true` is the strict alternative for batches where a partial
  // write is not acceptable. It raises a PipelineCommandError carrying the
  // per-step results, so the caller can see which command broke without
  // re-running the batch.
  try {
    await runPipeline(
      client,
      [
        {
          label: "incr:string",
          run: (pipeline) => void pipeline.incr(`${KEY_PREFIX}string`),
        },
      ],
      { throwOnError: true },
    );
  } catch (error) {
    console.log(`\nWith throwOnError: ${error.name}: ${error.message}`);
  }

  // --- 4. Clean up --------------------------------------------------------
  const removals = Array.from({ length: BATCH_SIZE }, (_, index) => ({
    label: `del:${index}`,
    run: (pipeline) => void pipeline.del(`${KEY_PREFIX}item:${index}`),
  }));
  removals.push({
    label: "del:string",
    run: (pipeline) => void pipeline.del(`${KEY_PREFIX}string`),
  });
  removals.push({
    label: "del:fine",
    run: (pipeline) => void pipeline.del(`${KEY_PREFIX}fine`),
  });

  await runPipeline(client, removals, { logger: exampleLogger });
  console.log(`\nCleaned up ${removals.length} keys.`);

  await release();
  console.log("Disconnected cleanly.");
});
