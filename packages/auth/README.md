# @bootstrap-framework/auth

Framework-agnostic TypeScript authentication for Node.js. Use it from a plain script or plug it into Express, Fastify, Koa, or uWebSockets.js.

Monorepo: https://github.com/mayank040902/framework

- JWT access and refresh tokens via `jsonwebtoken` (HS256 by default)
- Generic RBAC: you define roles and permissions
- Password hashing with scrypt
- Social login: Google, GitHub, Instagram, Facebook, X/Twitter, Discord, Apple, LinkedIn, Microsoft, Reddit, Twitch, Slack, Spotify, TikTok
- Works standalone or with HTTP frameworks

Requires Node.js 20+.

## Install

```bash
npm install @bootstrap-framework/auth
```

## Quick start

```ts
import { createAuth } from "@bootstrap-framework/auth";

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
import { encode, decode } from "@bootstrap-framework/auth";

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
import { createRBAC } from "@bootstrap-framework/auth";

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

Permission wildcards: `*` matches everything, `invoice.*` matches `invoice.read`.

Direct permissions on a user still work:

```js
rbac.can({ roles: ["member"], permissions: ["beta.access"] }, "beta.access");
```

## Passwords

```js
import { hashPassword, verifyPassword } from "@bootstrap-framework/auth";

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

Optional user-store methods for linking accounts:

- `findByProvider(provider, providerId)`
- `findByEmail(email)`
- `createFromProvider(provider, profile, tokens)`
- `linkProvider(userId, provider, profile)`

If no store is configured, login still works and uses a synthetic id: `google:123`.

Custom providers:

```js
import { createProvider, createOAuth } from "@bootstrap-framework/auth";

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

Adapters are optional. Express, Fastify, and Koa are optional peer dependencies. uWebSockets.js is supported via adapter but is not an npm peer (install it from its GitHub package if needed).

### Express

```js
import { createAuth, expressAdapter } from "@bootstrap-framework/auth";

const auth = createAuth({ secret: process.env.AUTH_SECRET });
const { authenticate, requirePermission, requireRole } = expressAdapter(auth);

app.get("/me", authenticate(), (req, res) => res.json(req.user));
app.get("/admin", authenticate(), requireRole("admin"), handler);
app.get("/reports", authenticate(), requirePermission("report.read"), handler);
```

### Fastify

```js
import { createAuth, fastifyAdapter } from "@bootstrap-framework/auth";

await fastify.register(fastifyAdapter(auth));
fastify.get("/me", { preHandler: [fastify.authenticate()] }, async (req) => req.user);
```

### Koa

```js
import { createAuth, koaAdapter } from "@bootstrap-framework/auth";

const { authenticate, requirePermission } = koaAdapter(auth);
app.use(authenticate());
```

### uWebSockets.js

uWS request/response objects are invalid after the first `await`. The adapter snapshots headers and query first.

```js
import uWS from "uWebSockets.js";
import { createAuth, uwsAdapter } from "@bootstrap-framework/auth";

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

Pass a custom `refreshStore` with `save`, `get`, and `revoke` to persist tokens.

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

See `examples/standalone.ts`, `examples/express.ts`, `examples/fastify.ts`, `examples/uwebsockets.ts`, and `examples/oauth-social.ts`.

## Scripts

```bash
npm test
npm run typecheck
npm run build
```

## License

MIT. Copyright (c) 2026 mayank.
