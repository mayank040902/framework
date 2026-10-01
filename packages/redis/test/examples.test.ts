import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(HERE, "..", "examples");

const RUNNING_REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
// Nothing listens here, so every example takes its early-exit path.
const UNREACHABLE_REDIS_URL = "redis://127.0.0.1:6399";

const EXAMPLE_NAMES = [
  "standalone",
  "cache",
  "session",
  "pubsub",
  "queue-worker",
  "pipeline",
];

interface RunOptions {
  url: string;
  timeoutMs?: number;
  inject?: { file: string; after: string; code: string };
}

/** Run an example, optionally with a bug injected at a specific line. */
function runExample(name: string, options: RunOptions) {
  const { url, timeoutMs = 30_000, inject } = options;
  const file = join(EXAMPLES, `${name}.js`);

  if (!inject) {
    return spawnSync(process.execPath, [file], {
      encoding: "utf8",
      timeout: timeoutMs,
      env: {
        ...process.env,
        REDIS_URL: url,
        REDIS_SILENT: "true",
      },
    });
  }

  // Run a copy with the bug injected, so the checked-in example is untouched.
  const original = readFileSync(join(EXAMPLES, inject.file), "utf8");
  const injected = original.replace(
    inject.after,
    `${inject.after}\n${inject.code}`,
  );

  assert.notEqual(injected, original, "injection anchor not found");

  const tmp = join(EXAMPLES, `.injected-${name}.mjs`);
  writeFileSync(tmp, injected);

  try {
    return spawnSync(process.execPath, [tmp], {
      encoding: "utf8",
      timeout: timeoutMs,
      cwd: EXAMPLES,
      env: {
        ...process.env,
        REDIS_URL: url,
        REDIS_SILENT: "true",
      },
    });
  } finally {
    rmSync(tmp, { force: true });
  }
}

for (const url of [RUNNING_REDIS_URL, UNREACHABLE_REDIS_URL]) {
  const reachable = url === RUNNING_REDIS_URL;

  test(`every example exits 0 against ${reachable ? "a running" : "an unreachable"} Redis`, () => {
    for (const name of EXAMPLE_NAMES) {
      const result = runExample(name, { url });

      assert.equal(
        result.status,
        0,
        `${name} exited ${result.status} (${result.signal ?? "no signal"}) against ${url}\n${result.stderr}`,
      );
    }
  });
}

test("an example that throws after opening a connection fails instead of hanging", () => {
  // Every example creates its own clients, and ioredis keeps a socket open for
  // each. `run()` used to swallow the error without closing anything, so the
  // open socket kept the event loop alive: the process had to be killed from
  // outside, and a script checking `$?` saw a timeout rather than a failure.
  //
  // Injected right after each resource is registered, because a throw between
  // construction and registration is exactly the gap that leaked.
  const cases: { file: string; after: string }[] = [
    {
      file: "standalone.js",
      after: "onFailure(() => shutdown(client, exampleLogger));",
    },
    {
      file: "cache.js",
      after: "onFailure(() => shutdown(client, exampleLogger));",
    },
    {
      file: "session.js",
      after: "onFailure(() => shutdown(client, exampleLogger));",
    },
    {
      file: "pubsub.js",
      after: "onFailure(() => shutdown(publisher, exampleLogger));",
    },
    {
      file: "queue-worker.js",
      after: "onFailure(() => queue.close());",
    },
    {
      file: "pipeline.js",
      after: "onFailure(() => shutdown(client, exampleLogger));",
    },
  ];

  for (const { file, after } of cases) {
    const name = file.replace(/\.js$/, "");
    const result = runExample(name, {
      url: RUNNING_REDIS_URL,
      inject: {
        file,
        after,
        code: 'throw new Error("injected failure");',
      },
    });

    assert.equal(
      result.status,
      1,
      `${name} should exit 1 on a failure, got ${result.status} (${result.signal ?? "no signal"} = hung)\n${result.stderr}`,
    );
  }
});
