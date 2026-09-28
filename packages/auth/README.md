# @oneunit/auth

Framework-agnostic TypeScript authentication for Node.js. Use it from a plain script or plug it into Express, Fastify, Koa, or uWebSockets.js.

[![CI](https://github.com/mayank040902/framework/actions/workflows/auth.yml/badge.svg)](https://github.com/mayank040902/framework/actions/workflows/auth.yml)
[![npm](https://img.shields.io/npm/v/@oneunit/auth.svg)](https://www.npmjs.com/package/@oneunit/auth)
[![license](https://img.shields.io/npm/l/@oneunit/auth.svg)](./LICENSE)

Monorepo: https://github.com/mayank040902/framework

- JWT access and refresh tokens via `jsonwebtoken` (HS256 by default)
- Generic RBAC: you define roles and permissions
- Password hashing with scrypt
- Social login: Google, GitHub, Instagram, Facebook, X/Twitter, Discord, Apple, LinkedIn, Microsoft, Reddit, Twitch, Slack, Spotify, TikTok
- Works standalone or with HTTP frameworks

Requires Node.js 20+.

Docs: [README](./README.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [CHANGELOG](./CHANGELOG.md) · [Security](../../docs/security.md)

Upgrading from 1.x? See the [2.0.0 migration notes](./CHANGELOG.md#migration).

## Install

```bash
npm install @oneunit/auth
```

## Quick start

```ts
import { createAuth } from "@oneunit/auth";

const auth = createAuth({
  secret: process.env.AUTH_SECRET,
  issuer: "my-app",
  accessTokenTtl: "15m",
  refreshTokenTtl: "7d",
  rbac: {
    defaultRole: "member",
    roles: {
      member: { permissions: ["profile.read"] },
      editor: { inherits: "member", permissions: ["post.write"] },
      admin: { inherits: "editor", permissions: ["user.manage"] },
    },
  },
});

const { accessToken, refreshToken, payload } = await auth.login({
  id: 42,
  email: "ada@example.com",
  roles: ["editor"],
});

const claims = await auth.verify(accessToken);
auth.can(claims, "post.write");
```

There are no built-in product roles. Pass whatever role names your app uses.

## JWT helpers

Use these without creating an `Auth` instance:

```js
import { encode, decode } from "@oneunit/auth";

const token = encode(
  { userId: 123 },
  process.env.AUTH_SECRET,
  { expiresIn: "1h", subject: "123" },
);

const claims = decode(token, process.env.AUTH_SECRET);
```

`encodeAccessToken` and `encodeRefreshToken` add a `typ` claim (`access` or `refresh`).

## RBAC

```js
import { createRBAC } from "@oneunit/auth";

const rbac = createRBAC({
  roles: {
    support: { permissions: ["ticket.read", "ticket.reply"] },
    lead: { inherits: "support", permissions: ["ticket.assign"] },
  },
});

rbac.grant("lead", "ticket.close");
rbac.can({ roles: ["lead"] }, "ticket.reply");
rbac.authorize({ roles: ["support"] }, "ticket.read");
```

Permission wildcards:

| Granted | Matches | Does not match |
| :--- | :--- | :--- |
| `*` | anything | — |
| `invoice.*` | `invoice.read` | `invoice.read.all`, `invoices.read` |
| `invoice.**` | `invoice.read`, `invoice.read.all` | `payment.read` |

`*` stays within one dot-separated segment. `**` spans any number of segments.

Direct permissions on a user still work:

```js
rbac.can({ roles: ["member"], permissions: ["beta.access"] }, "beta.access");
```

These are evaluated against a subject you construct in code. A `permissions`
array on a stored user record is not copied into access tokens — see
[Access token claims](#access-token-claims).

> **`defaultRole` is a grant to anonymous callers.** A subject with no roles —
> including `null` and `undefined` — is assigned `defaultRole`, so
> `can(null, "post.write")` is `true` if `defaultRole` carries that permission.
> Keep `defaultRole` unprivileged, and check for a subject before asking:
>
> ```js
> if (ctx.state.user && auth.can(ctx.state.user, "post.write")) { ... }
> ```
>
> The bundled adapters check for a missing user before calling `can`.

## Passwords

```js
import { hashPassword, verifyPassword } from "@oneunit/auth";

const passwordHash = await hashPassword("correct horse battery staple");
await verifyPassword("correct horse battery staple", passwordHash);
```

With a user store, `auth.register()` and `auth.loginWithPassword()` hash and verify for you.

```js
const auth = createAuth({
  secret: process.env.AUTH_SECRET,
  userStore: {
    async findByCredentials(identifier) {},
    async create(input) {},
    async updatePassword(id, passwordHash) {},
  },
});

await auth.register({ email: "ada@example.com", password: "s3cret-pass" });
await auth.loginWithPassword("ada@example.com", "s3cret-pass");
```

`register()` ignores a `roles` field in its first argument so a public sign-up
form cannot self-assign a role. Pass roles as the second, server-side argument.

## Social login

Built-in providers: `google`, `github`, `instagram`, `facebook`, `twitter` (X), `discord`, `apple`, `linkedin`, `microsoft`, `reddit`, `twitch`, `slack`, `spotify`, `tiktok`.

```js
const auth = createAuth({
  secret: process.env.AUTH_SECRET,
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/google/callback",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/github/callback",
    },
    instagram: {
      clientId: process.env.INSTAGRAM_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/instagram/callback",
    },
  },
});

const { url, state } = await auth.getAuthorizationUrl("google");

const session = await auth.loginWithOAuth("google", {
  code: req.query.code,
  state: req.query.state,
});
```

The callback params also accept a string: a full URL, a path with a query, a
leading `?code=...`, or a bare `"code=...&state=..."`.

### PKCE

Public clients should set `pkce: true`. The package generates and stores the
verifier for you. To manage it yourself, use the exported helpers:

```js
import { pkceVerifier, pkceChallenge } from "@oneunit/auth";

const verifier = pkceVerifier();
const challenge = pkceChallenge(verifier); // S256, base64url
```

Optional user-store methods for linking accounts:

- `findByProvider(provider, providerId)`
- `findByEmail(email)`
- `createFromProvider(provider, profile, tokens)`
- `linkProvider(userId, provider, profile)`

If no store is configured, login still works and uses a synthetic id such as
`google:123`. That id is built from the provider profile's `id`, so
`profileMap` must map a stable identifier — a profile without one throws
`ProviderError` rather than collapsing every user of that provider onto the
same subject.

Custom providers:

```js
import { createProvider, createOAuth } from "@oneunit/auth";

const acme = createProvider({
  id: "acme",
  authorizationUrl: "https://acme.example/oauth/authorize",
  tokenUrl: "https://acme.example/oauth/token",
  userInfoUrl: "https://acme.example/me",
  scopes: ["profile"],
  profileMap: { id: "id", email: "email", name: "name" },
});

const oauth = createOAuth();
oauth.use("acme", { provider: acme, clientId: "...", clientSecret: "..." });
```

## Framework adapters

The adapters never import a web framework. They read the request and response
objects you pass them structurally, so `@oneunit/auth` has no peer dependencies
at all and works whether or not Express, Fastify, Koa, or uWebSockets.js is
installed. Install your framework as usual alongside this package.

This also means the adapters are not tied to a framework's major version: they
depend on a small shape (`headers`, `cookies`, `query`, a `send`-style reply)
rather than on a class.

### Express

```js
import { createAuth, expressAdapter } from "@oneunit/auth";

const auth = createAuth({ secret: process.env.AUTH_SECRET });
const { authenticate, requirePermission, requireRole } = expressAdapter(auth);

app.get("/me", authenticate(), (req, res) => res.json(req.user));
app.get("/admin", authenticate(), requireRole("admin"), handler);
app.get("/reports", authenticate(), requirePermission("report.read"), handler);
```

### Fastify

```js
import { createAuth, fastifyAdapter } from "@oneunit/auth";

await fastify.register(fastifyAdapter(auth));
fastify.get("/me", { preHandler: [fastify.authenticate()] }, async (req) => req.user);
```

### Koa

```js
import { createAuth, koaAdapter } from "@oneunit/auth";

const { authenticate, requirePermission } = koaAdapter(auth);
app.use(authenticate());
```

### uWebSockets.js

uWS request/response objects are invalid after the first `await`. The adapter snapshots headers and query first.

```js
import uWS from "uWebSockets.js";
import { createAuth, uwsAdapter } from "@oneunit/auth";

const auth = createAuth({ secret: process.env.AUTH_SECRET });
const { authenticate, requirePermission, json } = uwsAdapter(auth);

uWS.App()
  .get("/me", authenticate()((res, _req, request) => {
    json(res, 200, { user: request.user });
  }))
  .get("/stats", authenticate()(requirePermission("stats.read")((res, _req, request) => {
    json(res, 200, { ok: true, userId: request.user.userId });
  })))
  .listen(3000, (token) => {
    if (!token) throw new Error("listen failed");
  });
```

### Standalone HTTP

```js
const claims = await auth.verifyRequest(req);
```

Tokens are read from `Authorization: Bearer`, an `access_token` cookie, or `?access_token=`.

## Refresh tokens

```js
const session = await auth.login(user);
const next = await auth.refresh(session.refreshToken);
await auth.logout(next.refreshToken);
```

Refresh tokens rotate on every use: `auth.refresh()` invalidates the token it
consumes. A refresh token is never accepted by `verify()` or `verifyRequest()`,
so it cannot be replayed as an access credential.

Persist tokens with a custom `refreshStore`:

| Method | Required | Purpose |
| --- | --- | --- |
| `save(record)` | yes | Store a newly issued refresh token |
| `get(id)` | yes | Look up a record |
| `consume(id)` | recommended | Atomically look up **and** remove a record |
| `revoke(id)` | required unless `consume` exists | Invalidate a record on logout |

Implement `consume` whenever you can. `get` followed by `revoke` is two
round-trips, so two concurrent requests presenting the same token can both
pass the validity check and each receive a new session. `consume` must be a
single atomic operation (`GETDEL` in Redis, a `DELETE ... RETURNING` in SQL).

`revoke` and `consume` are not optional in practice: if neither exists,
`auth.refresh()` and `auth.logout()` throw `ConfigurationError` rather than
report a logout that never happened. A store implementing only `consume()` is
enough for both rotation and logout.

### Access token claims

Permissions in an access token are derived from RBAC roles. A `permissions`
array on the user record is ignored unless you opt in:

```js
const auth = createAuth({ secret, trustUserPermissions: true });
```

Roles assigned during registration come from the server-side options argument,
never the request body:

```js
await auth.register({ email, password }, { roles: ["member"] });
```

### Reserved claims

`sub`, `userId`, `roles`, `permissions`, `typ`, `iss`, `aud`, `exp`, `iat`,
`nbf`, and `jti` are derived from the authenticated user and RBAC, and cannot be
replaced by a claim extractor or by `additionalClaims`. Doing so throws rather
than silently minting a token for someone else:

```js
auth.registerExtractor("sub", fn);                            // throws
auth.login(user, { additionalClaims: { roles: ["admin"] } }); // throws
```

Any other name is yours — `name`, `email`, `tier`, `tenantId`, and so on.

## Errors

All errors extend `AuthError` and include `code` and `status`:

| Class | Code | Status |
| --- | --- | --- |
| `InvalidTokenError` | `INVALID_TOKEN` | 401 |
| `TokenExpiredError` | `TOKEN_EXPIRED` | 401 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 |
| `ForbiddenError` | `FORBIDDEN` | 403 |
| `ConfigurationError` | `CONFIGURATION_ERROR` | 500 |
| `OAuthError` | `OAUTH_ERROR` | 401 |
| `ProviderError` | `PROVIDER_ERROR` | 502 |
| `ValidationError` | `VALIDATION_ERROR` | 400 |

## Examples

| File | Shows |
| :--- | :--- |
| `examples/standalone.ts` | Login, rotation, replay rejection, wildcards, TTL validation |
| `examples/express.ts` | Middleware, `optional` auth, refresh and logout routes, OAuth |
| `examples/fastify.ts` | Plugin registration, plugin-level `optional`, preHandlers |
| `examples/uwebsockets.ts` | Abort-safe handlers, request snapshots, provider lookup |
| `examples/oauth-social.ts` | Provider config, PKCE, state handling |

They import from `@oneunit/auth`, so they run against a real install:

```bash
npm run example:standalone
npm run example:oauth
```

From an installed copy:

```bash
npx tsx node_modules/@oneunit/auth/examples/standalone.ts
```

The OAuth example needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; it exits
with a note otherwise, because provider config is validated at `authorize()`
time rather than at `createAuth()` time.

## Scripts

```bash
npm test
npm run typecheck
npm run build
npm run pack:check
```

CI runs typecheck, tests, build, `pack:check`, and `pnpm audit` on Node 20, 22,
and 24, then installs the packed tarball into a clean project and exercises the
public API and the shipped examples against it.

## License

MIT. Copyright (c) 2026 mayank.
