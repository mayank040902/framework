/**
 * BullMQ queue and worker.
 *
 *   npm run example:queue-worker
 *
 * Environment:
 *   REDIS_URL    connection URL (default redis://localhost:6379)
 *   REDIS_SILENT set to "true" to suppress connection-event logging
 *
 * Demonstrates the whole queue surface: `createQueue` applies job defaults,
 * `createWorker` processes jobs with retries and backoff, and
 * `attachQueueEvents` observes progress from a separate connection. One client
 * serves all three, which works because `createClient` defaults
 * `maxRetriesPerRequest` to null as BullMQ requires.
 *
 * `prefix` is per-call on all three factories and must match. `attachQueueEvents`
 * inherits it from the queue when you do not pass one, so setting it on the
 * queue and worker is enough.
 *
 * The script exits once the demo jobs settle. Press Ctrl+C to stop early; the
 * signal handler closes everything in reverse order of creation.
 */

import {
  createClient,
  createQueue,
  createWorker,
  attachQueueEvents,
  shutdown,
} from "@oneunit/redis";
import {
  REDIS_URL,
  exampleLogger,
  isReady,
  onFailure,
  release,
  run,
} from "./_setup.js";

const QUEUE_NAME = "example-demo-jobs";

await run("queue-worker", async () => {
  const client = createClient({ url: REDIS_URL }, exampleLogger);
  onFailure(() => shutdown(client, exampleLogger));

  // Job defaults from createQueue: 3 attempts with exponential backoff,
  // keeping the last 100 completed and 1000 failed jobs. Retention matters
  // because BullMQ keeps finished jobs in Redis until something removes them.
  const queue = createQueue({ name: QUEUE_NAME, connection: client });
  onFailure(() => queue.close());

  // Events come from a separate listener with its own blocking connection, so
  // they cannot interfere with the worker's polling.
  const events = attachQueueEvents({ queue, logger: exampleLogger });
  onFailure(() => events.close());

  // Every readiness wait is bounded and rejection-tolerant. BullMQ polls Redis
  // with commands that ioredis queues while reconnecting, so against an
  // unreachable server these never settle and the script would hang
  // indefinitely with BullMQ's reconnect loops still running.
  if (!(await isReady(queue.waitUntilReady(), "Queue"))) {
    return;
  }

  if (!(await isReady(events.waitUntilReady(), "Queue events"))) {
    return;
  }

  const completed = [];
  const failures = [];

  // `concurrency` is optional. Omitting it leaves BullMQ's default of 1, which
  // is deliberately not overridden by an explicit undefined.
  const worker = createWorker({
    name: QUEUE_NAME,
    connection: client,
    concurrency: 2,
    processor: async (job) => {
      console.log(
        `  processing ${job.name} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 3})`,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      // One in four jobs fails, to show the retry and backoff path.
      if (job.name === "report" && job.data.fail) {
        throw new Error("report generation failed");
      }

      return { processed: true, jobId: job.id, name: job.name };
    },
  });

  // Registered before the readiness wait, since a worker that is never ready
  // still holds its blocking connection open.
  onFailure(() => worker.close(true));

  if (!(await isReady(worker.waitUntilReady(), "Worker"))) {
    return;
  }

  // Track settlement per job so the script knows when the demo is finished.
  const settled = new Map();
  const markSettled = (jobId, outcome) => {
    settled.set(jobId, outcome);
  };

  events.on("completed", ({ jobId, returnvalue }) => {
    completed.push(jobId);
    console.log(`  completed ${jobId} ->`, returnvalue);
    markSettled(jobId, "completed");
  });

  events.on("failed", ({ jobId, failedReason }) => {
    failures.push({ jobId, failedReason });
    console.log(`  failed ${jobId} -> ${failedReason}`);
    markSettled(jobId, "failed");
  });

  // Clear anything left by a previous run so the counts below are meaningful.
  // Clear anything a previous run left behind. obliterate() refuses an
  // active queue, hence force.
  await queue.obliterate({ force: true }).catch(() => {});

  console.log("Enqueuing jobs...\n");

  const welcome = await queue.add("welcome", {
    userId: "user-1",
    message: "Welcome!",
  });
  const notification = await queue.add("notification", {
    type: "email",
    to: "user@example.com",
  });
  // Succeeds on the first attempt.
  await queue.add("report", { format: "pdf" });
  // Fails every attempt, so it exercises the full retry budget.
  const doomed = await queue.add("report", { format: "csv", fail: true });

  console.log(
    `Enqueued 4 jobs (${welcome.id}, ${notification.id}, ${doomed.id}, +1).\n`,
  );

  // Wait for all four to reach a terminal state. Bounded, so a worker that
  // never picks the jobs up cannot hang the script forever.
  // Clear the loser of the race. A pending timer keeps the event loop alive, so
  // leaving it armed would hold the process open for the full 20s even after
  // every job has settled.
  let deadline;
  const allSettled = await Promise.race([
    new Promise((resolve) => {
      const check = setInterval(() => {
        if (settled.size >= 4) {
          clearInterval(check);
          resolve(true);
        }
      }, 50);
    }),
    new Promise((resolve) => {
      deadline = setTimeout(() => resolve(false), 20000);
    }),
  ]).finally(() => clearTimeout(deadline));

  if (!allSettled) {
    console.log("Timed out waiting for jobs to settle.");
  }

  const counts = await queue.getJobCounts();
  console.log("\nQueue counts:", counts);
  console.log(
    `Completed: ${completed.length}, failed permanently: ${failures.length}`,
  );

  if (failures.length > 0) {
    const attemptsMade = await queue
      .getJob(doomed.id)
      .then((job) => job?.attemptsMade);
    console.log(
      `The failing job was attempted ${attemptsMade} times before BullMQ gave up.`,
    );
  }

  // Close in reverse order of creation: worker, events, queue, then the shared
  // client. BullMQ closes its own blocking connections for the first three.
  await worker.close();
  await release();

  console.log("\nClosed cleanly.");
});
