# Contributing to `@oneunit/kafka`

Thanks for helping. This package is small on purpose, and the bar for a change is
mostly "does it keep KafkaJS as the only runtime dependency, and is it covered by a
test".

## Prerequisites

- **Node.js 20 or newer** (`engines` in `package.json`)
- **pnpm**, if you are working across the monorepo. This package alone works with npm.

## Setup

From this directory:

```bash
npm install
```

From the repository root, install the whole workspace once instead:

```bash
pnpm install
```

## Scripts

| Command | What it does |
| :--- | :--- |
| `npm test` | Runs the test suite with the Node.js built-in runner |
| `npm run test:watch` | Same, in watch mode |
| `npm run smoke` | End-to-end checks against a real broker |
| `npm run typecheck` | `tsc --noEmit`; must be clean |
| `npm run lint` | ESLint — see the known gap below |
| `npm run build` | Emits `dist/` with type declarations |
| `npm run dev` | Rebuilds on change |
| `npm run pack:verify` | Packs a real tarball and checks what would ship |
| `npm run verify` | `typecheck` + `test` + `pack:verify`; runs on publish |

Run at minimum `npm test` and `npm run typecheck` before opening a pull request.

## Before publishing

`npm publish` runs `prepublishOnly`, which runs `npm run verify`. That gate packs a
real tarball, extracts it, imports it by package name from a throwaway project, and
fails the publish on any of the following:

- the version is missing a heading in `CHANGELOG.md`, or `CHANGELOG.md` still has
  content under `[Unreleased]`
- a required file (`dist/index.js`, declarations, `README.md`, `LICENSE`, ...) is
  missing from the tarball
- a test file, scratch file, or `.env` would be published
- a source map points at a file that is not in the tarball
- `import "@oneunit/kafka"` or `@oneunit/kafka/client` does not resolve through the
  `exports` map, or a public export is missing

It needs neither a broker nor network access, so it is safe in CI. Run
`npm run verify` locally to see exactly what CI will check.

`npm run smoke` needs a reachable broker (`KAFKA_BROKERS`, default
`localhost:9092`) and creates its topic if missing. It exercises the real wire path,
so run it when a change touches options forwarded to KafkaJS, encoding, or the
connection lifecycle.

> **Known gap:** `npm run lint` does not currently do anything. `eslint.config.js`
> matches `**/*.js`, but `src/` is TypeScript, so ESLint finds no files to check. If
> you touch the config, please make it cover `.ts` — that is a real improvement and
> a welcome first contribution.

Tests run against the TypeScript sources through `tsx`; you do not need to build
first.

## Layout

```
src/
  index.ts          public surface
  kafka-client.ts   KafkaClient, the high-level API
  client/           low-level factories, config, ssl, sasl, shutdown
  adapters/         logger, config, and codec adapters
  logger.ts         Logger type and helpers
  env.ts            environment readers
  errors.ts         error classes
test/               node:test suites + helpers.js mocks
examples/           runnable examples, one file per topic
```

`ARCHITECTURE.md` explains how the pieces fit together and why. Read it before a
non-trivial change.

## Conventions

- **ESM only.** `"type": "module"`, and every relative import carries the `.js`
  extension even though the sources are `.ts`.
- **4-space indentation**, double quotes, semicolons — match the surrounding file.
- **`verbatimModuleSyntax`** is on, so type-only imports must use `import type`.
- **No default exports.** Everything is a named export.
- **Public API changes are additive.** Renaming or removing an export is a breaking
  change and needs a major version bump.

## Testing

Tests use `node:test` and `node:assert/strict`. Add cases to the matching file in
`test/` rather than creating a new one per change.

`test/helpers.js` provides the fakes:

- `createMockKafka()` — a fake KafkaJS surface that records `send` payloads,
  subscriptions, and per-factory call counts
- `memoryLogger()` — a logger that captures entries for assertions
- `withEnv(vars, fn)` — sets environment variables and restores them afterwards

Two habits that have caught real bugs here:

- **Assert on call counts, not just outcomes.** `kafka.producerCalls`,
  `consumerCalls`, and `adminCalls` exist because "did this happen exactly once?" is
  how connection leaks and duplicate subscriptions get caught.
- **Test the shape users actually destructure.** The handler payload bug shipped
  because tests asserted `payload.value` while real users read `payload.message.offset`.

### Fixing a bug

1. Write a failing test that reproduces it, using the mock Kafka rather than a real
   broker.
2. Confirm it fails for the reason you expect.
3. Fix it.
4. Run the full suite — a fix that breaks another test is usually incomplete.

## Adding a feature

- Route logging, configuration, and serialization through the existing adapters.
  Do not add a dependency for any of them; that is the package's core constraint.
- New configuration options need a sensible default so existing code keeps working,
  and they should read from the config adapter and the environment like every other
  option does.
- Update `README.md` for user-facing changes, `ARCHITECTURE.md` if you change how
  something works internally, and `CHANGELOG.md` under `[Unreleased]`.

## Commit and pull request conventions

The repository uses [Conventional Commits](https://www.conventionalcommits.org/):

```
fix(kafka): keep message metadata in the consume payload
docs(kafka): document the connection lifecycle
test(kafka): cover concurrent getProducer calls
```

Keep the subject in the imperative mood and under about 72 characters.

A good pull request:

- changes one thing
- includes tests for the behaviour it adds or fixes
- keeps `npm test` and `npm run typecheck` green
- explains *why* in the description, not just what changed

## Reporting a bug

Open an issue with the KafkaJS version, the Node.js version, and a minimal
reproduction. If the bug involves encoding, include the bytes on the wire — most
encoding bugs are invisible in object form and obvious as bytes.

## Security

Do not open a public issue for a vulnerability. See `SECURITY.md` at the repository
root for the reporting process.
