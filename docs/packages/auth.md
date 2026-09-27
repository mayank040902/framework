# @bootstrap-framework/auth

Framework-agnostic TypeScript authentication for Node.js. JWT, generic RBAC, scrypt passwords, and social OAuth.

Works standalone or with Express, Fastify, Koa, or uWebSockets.js.

Package README: `packages/auth/README.md`

## Install

```bash
npm install @bootstrap-framework/auth
```

## Quick start

```javascript
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
      admin: { inherits: "member", permissions: ["user.manage"] },
    },
  },
});

const { accessToken, refreshToken, payload } = await auth.login({
  id: 42,
  email: "ada@example.com",
  roles: ["member"],
});
```

`secret` is required.

## Fastify adapter

```javascript
import { createAuth, fastifyAdapter } from "@bootstrap-framework/auth";

await fastify.register(fastifyAdapter(auth));
fastify.get("/me", { preHandler: [fastify.authenticate()] }, async (req) => req.user);
fastify.get("/admin", { preHandler: [fastify.authenticate(), fastify.requireRole("admin")] }, handler);
```

Tokens are read from `Authorization: Bearer`, an `access_token` cookie, or `?access_token=`.

## Also included

- `encode` / `decode` JWT helpers
- `createRBAC`, permission wildcards (`*`, `invoice.*`)
- `hashPassword` / `verifyPassword` (scrypt)
- `auth.register` / `auth.loginWithPassword` with a `userStore`
- Built-in OAuth providers (Google, GitHub, and others)
- `expressAdapter`, `koaAdapter`, `uwsAdapter`

See `docs/security.md` for production token and password guidance.
