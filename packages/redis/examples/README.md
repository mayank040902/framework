# Examples

Runnable scripts for `@oneunit/redis`. Each one is standalone and needs nothing
but a Redis server and the package built.

```bash
cd packages/redis
npm install
npm run build        # the example scripts import the package by name, which
                     # resolves through the exports map to dist/
```

Then start Redis (any 6.x or 7.x server) and run one:

```bash
npm run example:standalone      # client: health, read/write, TTL
npm run example:cache           # read-through cache with TTL and invalidation
npm run example:session         # session store: create, update, expire, delete
npm run example:pubsub          # publish/subscribe across two clients
npm run example:queue-worker    # BullMQ queue, worker, retries, queue events
npm run example:pipeline        # batching many commands into one round trip
```

`example:queue-worker` finishes on its own once the demo jobs settle. The others
exit immediately.

## Environment

| Variable             | Default                  | Purpose                                            |
| :------------------- | :----------------------- | :------------------------------------------------- |
| `REDIS_URL`          | `redis://localhost:6379` | Connection URL                                     |
| `REDIS_SILENT`       | unset                    | Set to `true` to suppress connection-event logging |
| `EXAMPLE_TIMEOUT_MS` | `5000`                   | Bound for the pub/sub subscription check           |

## What each one covers

**`standalone.js`** — the client on its own. Health check, `SET`/`GET`, the
atomic `INCRBY`, and `EXPIRE`/`TTL`. Shows the defaults that make one client work
for both plain commands and BullMQ.

**`cache.js`** — read-through caching. The same read served in ~1ms from Redis
versus ~50ms from the "database", plus cache invalidation and why `SCAN` is
preferred over `KEYS`.

**`session.js`** — a session store. Create, read, update, extend, and destroy,
including the sliding-TTL pattern and how to refresh a TTL without rewriting the
payload.

**`pubsub.js`** — two clients, because a Redis connection in subscriber mode
cannot issue other commands. Also shows why you confirm the subscription count
before publishing: pub/sub does not queue for a subscriber that is not attached.

**`queue-worker.js`** — the full BullMQ surface. Job defaults from `createQueue`,
a worker with retries and exponential backoff (one job deliberately fails all
three attempts), and `attachQueueEvents` observing completion and failure over
its own connection. Shows the shutdown order.

**`pipeline.js`** — `runPipeline` for batch work. Writes and reads 100 keys in
one round trip, then deliberately includes an `INCR` on a string key so a single
command fails: the batch still resolves, and the example prints which command
failed. That is the case a bare `client.pipeline()` hides. Also shows
`pipelineValues` and `throwOnError`.

Note the shape of every step: one command, and the step returns nothing. That is
the contract, not a style preference — `runPipeline` matches results to steps by
position, so a step that queued two commands would report a real value against
the wrong label, and it raises `PipelineStepError` rather than letting that
through. Each entry here is a single `void pipeline.<cmd>(...)`.

## Things the examples avoid

Queue names contain no `:` — BullMQ rejects them, which is what stops one queue
addressing another's keys.

`attachQueueEvents` takes no `prefix` here so it inherits the queue's. Setting a
prefix on the queue and worker but not the listener is the easy way to end up
with a worker polling one key and a listener subscribed to another, receiving no
events and no error.

Pub/sub uses explicit `sleep` between publishes instead of nesting `setTimeout`
callbacks, so an error in one publish is caught rather than becoming an unhandled
rejection after the script has already claimed success.

Every example reports failure through `run()` in `_setup.js`, which sets a
non-zero exit code. `catch(console.error)` on its own leaves the process exiting
`0`, so a broken example passes any check that looks at the exit status.
