# Contributing to `@oneunit/logger`

Contributions are welcome — bug reports, tests, docs, and code. No CLA to sign
and no maintainer approval needed to open a pull request. The package is MIT
licensed, so your work stays yours.

Repository-wide conventions live in the
[root CONTRIBUTING.md](../../CONTRIBUTING.md). This file covers what is specific
to a logging library, and — more importantly — the behaviors in here that are
deliberate and must not be "fixed" by accident.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) before changing `src/`. Almost every
non-obvious line in `config.ts` exists because of the pino ordering described
there.

## Reporting a security vulnerability first

**Do not open a public issue or pull request for a security report.** A flaw in
a redaction library is a flaw in every application that logs through it, and a
public issue with a working bypass hands attackers a head start while the fix is
written.

Report privately, in order of preference:

1. **GitHub Security Advisories** — the repository's *Security* tab →
   *Report a vulnerability*. Private thread, maintainers only.
2. **Email** the maintainer at `04mayank09@gmail.com`.

Please include the affected version, a minimal reproduction, and the path the
secret takes to the sink. You will get an acknowledgement, and you will be
credited in the release notes unless you would rather not be.

Everything else — a confusing error message, a missing test, an API that is hard
to use — is a normal issue and welcome as one.

## Getting set up

Requires **Node.js 20+** and **pnpm 11.9.0**:

```bash
corepack enable
pnpm install
```

## Checks a pull request must pass

The package is independently testable:

```bash
pnpm --filter @oneunit/logger verify     # build + typecheck + examples + test + pack
```

`verify` is the same set `prepublishOnly` runs, so a change that passes it can
be published. The individual steps:

```bash
pnpm --filter @oneunit/logger test        # 248 tests
pnpm --filter @oneunit/logger typecheck   # source AND tests
pnpm --filter @oneunit/logger build
```

`typecheck` runs two passes: `tsconfig.json` for the published build and
`tsconfig.test.json` for the test suite. The test pass is not optional — a large
share of the value of this package is in the tests, and type errors there are
real errors.

`typecheck:examples` is separate because the examples import from `dist`, so it
requires a build first. Folding it into `typecheck` would make a cold checkout
fail for a reason that has nothing to do with the change under review.

Targeted suites, useful while iterating:

```bash
pnpm --filter @oneunit/logger test:security      # redaction and invariants
pnpm --filter @oneunit/logger test:integration   # real Fastify + pino-http
pnpm --filter @oneunit/logger test:serializers   # req/res shape and edge cases
pnpm --filter @oneunit/logger test:perf          # cost-shape regressions
pnpm --filter @oneunit/logger test:api           # public export surface
```

> **`pnpm lint` runs and is expected to pass.** Linting is configured at the
> repository root and covers this package. The root pins `typescript@^5.9`
> because `typescript-eslint@8` does not yet support TypeScript 7; if a
> dependency bump reintroduces TypeScript 7, lint fails with
> `typescript-eslint does not support TS 7.0` before checking anything, and that
> is a toolchain signal rather than something to fix in your diff.

## Writing a test for a security fix

Every discovered bypass gets a regression test, and the test must assert on the
**emitted log line**, not on an intermediate object. This is not pedantry: a
serializer can return a perfectly redacted object that never reaches the sink,
and a field the serializer never touched can leak anyway.

Use the shared helpers rather than raw pino:

```ts
import { capture, collector, REDACTED } from "./helpers.js";

it("masks the secret", () => {
    const { logger, records } = capture();

    logger.info({ user: { password: "s3cret" } }, "msg");

    expect(records[0].user.password).toBe(REDACTED);
});
```

`capture()` builds a real `createLogger()` writing to an in-memory stream. Do not
reach into pino internals: child-binding redaction and the redaction formatter
are both wired up by `createLogger`, so a logger built with `pino()` directly
exercises different code and can hide a real defect.

Prefer asserting individual parsed fields. Reserve whole-string assertions for
the rare cases where the formatting itself is the behavior under test.

## Behaviors that look like bugs but are not

Do not "fix" these without discussion. Each is asserted in the test suite, so a
change will fail loudly — which is the point.

**Class instances bound as values are not recursively redacted.**
`logger.child({ user: new UserModel() }).info()` leaves `user.password` visible.
Non-plain objects are passed by reference on purpose; walking them cost roughly
26.8 us/call against roughly 0.7 us/call. If a real use case needs this covered,
the fix is to bind a plain object or redact at the call site, not to re-enable
traversal.

**`Error` objects are copied with their prototype and non-enumerable properties
preserved.** Copying accessors verbatim looks tempting and is wrong: V8's
`stack` accessor reads `[[ErrorData]]` from its receiver, so re-binding it to a
new object yields `""`. Accessors are read once and stored as data properties.

**Recursion stops at `MAX_DEPTH = 100`.** Deeper structures are left untouched
rather than risking a stack overflow, which would turn a log call into a process
crash.

**`redactBindings` only walks plain objects and arrays.** See the first item.

**The `bindings` formatter is deliberately absent from `defineConfig`.** pino
cannot rely on it across children, and keeping a broken one masked a real
redaction path.

**`level` and `redact` are overridable through the `pino` escape hatch, but
`serializers` and `formatters.log` are re-applied afterwards.** They are
security-relevant and must not be replaceable by accident.

## Adding a sensitive key

Add it to `SENSITIVE_KEYS` in `config.ts`, lowercased — the walker compares
`key.toLowerCase()`, so one entry covers every casing. Then add a case to the
`SENSITIVE_KEYS` list in `test/security.test.ts`. If the key can also appear as
a header that only exists after serialization, add it to `REDACT_PATHS` too, in
both the lowercased and capitalized forms already used there.

## Changing redaction behavior

If you change *what* gets walked, you are changing a security contract. The
change needs, at minimum:

1. A new or updated test in `test/security.test.ts` pinning the new behavior,
   including the case that documents what is **no longer** covered.
2. A benchmark in `test/performance.test.ts` if the change affects traversal
   cost, asserting a ratio or a shape rather than an absolute threshold.
3. A README section update, if the user-visible contract moved. The redaction
   scope section in the README is the one consumers rely on.
4. A CHANGELOG entry, and a note in ARCHITECTURE.md if the reasoning changed.

## Performance tests

Do not add absolute ops/sec thresholds. Machine speed varies too much for a
fixed gate to be meaningful, and a flaky performance gate gets deleted, which
is worse than having none. Assert cost *shape*: two inputs where one is much
larger, with the expected relationship between them. Where a non-traversal is
the real property, prefer a deterministic identity assertion
(`redactBindings({ req: x }).req === x`) alongside the timing.

## Commit style

Branch from `main`: `fix/error-stack-trace`, `docs/architecture-redaction`.
Commits follow Conventional Commits with a scope, matching the rest of the
repository: `fix(logger): preserve error stack when redacting`.

Keep diffs focused. A refactor bundled with a behavior change makes the change
hard to review and impossible to revert.
