# Contributing

Repository: https://github.com/mayank040902/framework

## Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Node.js 20+ and pnpm 11.9.0 are required.

## Layout

- `packages/*` — independently published libraries
- `docs/` — architecture, security, combining packages, env, examples
- `examples/combined` — one service using every package

## Packages

Each package has its own tests, README, CHANGELOG, and LICENSE. Do not add `workspace:` to published `dependencies`. Optional siblings belong in `peerDependencies` with `peerDependenciesMeta.optional`.

Run one package:

```bash
pnpm --filter @bootstrap-framework/auth test
pnpm --filter @bootstrap-framework/server build
```

## Docs

When you change a public API, update that package README and the matching file under `docs/packages/`. Integration changes go in `docs/architecture.md`, `docs/combining-packages.md`, and `docs/security.md`.
