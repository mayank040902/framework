import { normalizeLogger, type Logger } from "../logger.js";
import { type Redis as RedisClient } from "ioredis";

/** Command names whose arguments must never be logged. */
const SECRET_COMMANDS = new Set(["auth", "hello"]);

/**
 * Strip credentials before an error reaches a logger.
 *
 * ioredis attaches the failing command to its errors, and for `AUTH` that
 * command's args are the username and the password in plaintext:
 *
 *   { command: { name: "auth", args: ["default", "hunter2-real-secret"] } }
 *
 * Logging the error as-is writes the Redis password to whatever the app logs
 * to, on every failed authentication. The message itself is safe; only the
 * attached command is not, so only that part is replaced.
 */
/** An ioredis error, which carries the failing command alongside the message. */
type CommandError = Error & {
  command?: { name?: unknown; args?: unknown } | null;
};

export function redactError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  const command = (error as CommandError).command;

  if (
    typeof command === "object" &&
    command !== null &&
    SECRET_COMMANDS.has(String(command.name).toLowerCase())
  ) {
    // Copy rather than mutate: ioredis may still be using this error, and the
    // caller has no reason to lose the original for their own handling.
    //
    // `message` is deliberately kept. Redis error text is what tells an
    // operator *why* authentication failed, and it never echoes the password
    // back. Only the attached command's args carry it.
    const safe = new Error(error.message) as CommandError;
    safe.name = error.name;
    safe.stack = error.stack;
    safe.command = { ...command, args: "[redacted]" };

    return safe;
  }

  return error;
}

/**
 * Marks a client this function has already wired up.
 *
 * `attachEvents` is exported and `createClient` calls it. A caller reaching for
 * the exported helper on a client from `createClient` would otherwise get a
 * second full set of listeners, logging every connection event twice. BullMQ
 * adds listeners to the same client too, so crossing the default limit of 10
 * and tripping `MaxListenersExceededWarning` should not be something a
 * consumer causes by accident.
 *
 * A global symbol is used so two copies of this package in one dependency tree
 * still recognise a client the other already wired.
 */
const WIRED = Symbol.for("oneunit.redis.eventsAttached");

export function attachEvents(client: RedisClient, loggerInput?: Logger): void {
  if ((client as unknown as Record<symbol, boolean>)[WIRED]) {
    return;
  }

  Object.defineProperty(client, WIRED, {
    value: true,
    enumerable: false,
  });

  const logger = normalizeLogger(loggerInput);

  client.on("connect", () => {
    logger?.info("redis connect");
  });

  client.on("ready", () => {
    logger?.info("redis ready");
  });

  client.on("reconnecting", (delay: number) => {
    logger?.warn(
      delay ? `redis reconnecting in ${delay}ms` : "redis reconnecting",
    );
  });

  client.on("error", (err: Error) => {
    logger?.error("redis error", { err: redactError(err) });
  });

  client.on("close", () => {
    logger?.info("redis close");
  });
}
