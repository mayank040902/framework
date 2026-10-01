import { normalizeLogger, type Logger } from "../logger.js";
import { redactError } from "./events.js";
import { type Redis as RedisClient } from "ioredis";

/**
 * How long to wait for QUIT before forcing the connection closed.
 *
 * QUIT is a queued command: ioredis only sends it on a live connection, so a
 * client stuck in `reconnecting` parks it in the offline queue and the promise
 * never settles. Without a bound, `shutdown` hangs for the lifetime of the
 * outage, which is exactly when a process most needs to be able to exit.
 */
const DEFAULT_TIMEOUT_MS = 5000;

const isClosed = (client: RedisClient): boolean =>
  client.status === "end" || FORCED.has(client);

/**
 * Clients this function already tore down by force.
 *
 * `disconnect()` only reaches ioredis's `closeHandler` from a live connection.
 * On a client sitting in `reconnecting` the connector has nothing to close, so
 * the status never becomes `end` even though `disconnect()` has cleared the
 * retry timer and the connection can never come back. Shutdown is registered on
 * both SIGINT and SIGTERM in most apps, so the second call would otherwise wait
 * out the full QUIT deadline again for a connection that is already gone.
 *
 * A `WeakSet` keeps this bookkeeping off the client object, so it does not
 * show up in `Object.keys`, in a serialised snapshot, or in BullMQ's own
 * inspection of the connection.
 */
const FORCED = new WeakSet<object>();

export async function shutdown(
  client: RedisClient | null | undefined,
  loggerInput?: Logger,
): Promise<void> {
  if (!client) {
    return;
  }

  // Completing the logger here matters more than anywhere else: shutdown runs
  // during teardown, so `logger?.info is not a function` would replace a clean
  // disconnect with a rejection on the way out.
  const logger = normalizeLogger(loggerInput);

  // Once ioredis reaches "end" the connection is gone for good and QUIT
  // rejects with "Connection is closed.". Shutdown is registered on both
  // SIGINT and SIGTERM in most apps, so a second call has to be a no-op
  // rather than an unhandled rejection during teardown.
  if (isClosed(client)) {
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), DEFAULT_TIMEOUT_MS);
  });

  try {
    const outcome = await Promise.race([
      client.quit().then(() => "quit" as const),
      expiry,
    ]);

    if (outcome === "timeout") {
      // The server never acknowledged QUIT. Tear the connection down
      // directly so the retry loop stops and the process can exit; the
      // caller asked to disconnect, and we are, one way or another.
      logger?.warn(
        `Redis did not acknowledge QUIT within ${DEFAULT_TIMEOUT_MS}ms, forcing the connection closed`,
      );
      client.disconnect();
      FORCED.add(client);

      return;
    }

    logger?.info("Redis disconnected");
  } catch (error) {
    // A connection that died mid-shutdown is already disconnected from the
    // caller's point of view, so treat it as success but still surface it.
    if (isClosed(client)) {
      logger?.warn(
        "Redis connection closed before QUIT completed",
        redactError(error),
      );
      return;
    }

    logger?.error("Failed to disconnect Redis", redactError(error));

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
