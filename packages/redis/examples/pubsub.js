/**
 * Publish/subscribe.
 *
 *   npm run example:pubsub
 *
 * Environment:
 *   REDIS_URL    connection URL (default redis://localhost:6379)
 *   REDIS_SILENT set to "true" to suppress connection-event logging
 *
 * A Redis connection in subscriber mode can only issue subscribe-family commands,
 * so pub/sub always needs two clients. `subscribe` and `psubscribe` are also
 * fire-and-forget: Redis does not queue a message published before a subscriber
 * is attached, which is why this example subscribes and waits for the
 * subscription count to confirm before publishing anything.
 */

import { createClient, shutdown } from "@oneunit/redis";
import {
  REDIS_URL,
  exampleLogger,
  onFailure,
  release,
  run,
  sleep,
  within,
} from "./_setup.js";

const NOTIFICATIONS = "example:notifications";
const ALERTS = "example:alerts";

await run("pubsub", async () => {
  // Two clients on purpose: one cannot both subscribe and publish. Each is
  // registered the moment it exists, and release() closes in reverse order, so
  // the subscriber goes first.
  const publisher = createClient({ url: REDIS_URL }, exampleLogger);
  onFailure(() => shutdown(publisher, exampleLogger));

  const subscriber = createClient({ url: REDIS_URL }, exampleLogger);
  onFailure(() => shutdown(subscriber, exampleLogger));

  const received = [];

  subscriber.on("message", (channel, message) => {
    received.push({ channel, message });
    console.log(`  [${channel}]`, message);
  });

  // subscribe() resolves with the number of channels this client is now
  // attached to. That count is the confirmation we need: a client already in
  // subscriber mode may not run `PUBSUB CHANNELS`, since only subscriber
  // commands are permitted in that mode.
  //
  // The wait is bounded because subscribe() is a queued command. Against an
  // unreachable server it never settles, and nothing else would notice.
  const attached = await within(
    subscriber.subscribe(NOTIFICATIONS, ALERTS),
    5000,
  );

  if (attached !== 2) {
    console.log(
      attached === "timeout"
        ? "Subscribe did not complete within 5s. Is Redis running?"
        : `Expected to attach to 2 channels, attached to ${attached}.`,
    );
    await release();
    return;
  }

  console.log(`Subscribed to ${attached} channels. Publishing...\n`);

  await publisher.publish(
    NOTIFICATIONS,
    JSON.stringify({ type: "info", message: "Deploy finished" }),
  );
  await sleep(50);

  await publisher.publish(
    ALERTS,
    JSON.stringify({ level: "warning", message: "High memory usage" }),
  );
  await sleep(50);

  await publisher.publish(
    NOTIFICATIONS,
    JSON.stringify({ type: "info", message: "Second message" }),
  );
  await sleep(100);

  console.log(`\nReceived ${received.length} of 3 published messages.`);

  // unsubscribe() resolves with how many channels the client is *still*
  // subscribed to, so 0 here means both channels were detached. A client that
  // has been in subscriber mode cannot issue any other command afterwards, so
  // unsubscribe before reusing it as a normal client.
  const stillSubscribed = await subscriber.unsubscribe(NOTIFICATIONS, ALERTS);
  console.log(`Unsubscribed; ${stillSubscribed} channel(s) still attached.`);

  await release();
  console.log("Disconnected cleanly.");
});
