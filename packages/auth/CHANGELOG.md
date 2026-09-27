# Changelog

## 1.0.0

- Published independently as `@bootstrap-framework/auth`
- Node.js 20+, MIT, author mayank

## 2.2.0

- Convert the package to TypeScript with generated `.d.ts` declarations
- Publish compiled ESM from `dist/` (`main`, `types`, and `exports`)
- Add `typescript` / `@types/node` / `@types/jsonwebtoken` / `tsx` for build and tests
- Type adapters, tests, and examples

## 2.1.0

- Add uWebSockets.js adapter with request snapshots (required after `await`)
- Read tokens from uWS `getHeader` / `getQuery` and header maps
- Optional `uWebSockets.js` peer dependency
- npm packaging: `exports`, `prepack`, and `package.json` export

## 2.0.0

- Independent, framework-agnostic auth package
- Replace `@fastify/jwt` with `jsonwebtoken`
- Remove workspace and framework runtime dependencies
- Generic RBAC (consumer-defined roles and permissions)
- Social OAuth 2.0 / OIDC providers (Google, GitHub, Instagram, and others)
- Password hashing via Node.js `scrypt`
- Express, Fastify, and Koa adapters
- Access and refresh tokens
- Tests, examples, types, and npm package metadata
