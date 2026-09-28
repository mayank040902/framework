# Architecture

`@oneunit/auth` is a framework-agnostic authentication package. It issues and
validates JWTs, evaluates RBAC, hashes passwords, and drives OAuth 2.0 / OIDC
social login, with thin adapters for Express, Fastify, Koa, and
uWebSockets.js.

It depends only on `jsonwebtoken` and Node's built-in `crypto`. It declares no
peer dependencies at all: the adapters never import Express, Fastify, or Koa,
they duck-type the request and response objects they are given. A consumer can
install `@oneunit/auth` in a worker with no HTTP framework present.

## Module layout

```text
src/
  index.ts       Public surface. Re-exports and the only file consumers should import.
  types.ts       Shared interfaces. No runtime code.
  errors.ts      AuthError hierarchy with `code` and `status`.
  utils.ts       Header/cookie/query parsing, TTL math, fetch helpers.
  jwt.ts         Thin wrapper over jsonwebtoken. encode / decode / PKCE-aware token types.
  rbac.ts        Roles, permission resolution, wildcard matching.
  password.ts    scrypt hashing with a self-describing hash format.
  oauth.ts       OAuth flow, state store, provider registry.
  providers.ts   Built-in provider definitions and the custom provider factory.
  adapters.ts    Express, Fastify, Koa, and uWS request/response glue.
  auth.ts        The Auth class: the composition point for everything above.
  roles.ts       Compatibility re-export of ./rbac.js.
  token.ts       Compatibility re-export of ./jwt.js.
```

`auth.ts` is the only module that knows about all the others. Everything else is
independently importable, which is why the JWT, RBAC, and password helpers are
exported standalone — a worker that only needs to verify a token should not pull
in the OAuth machinery.

## The Auth class

`createAuth(options)` returns an `Auth` instance. The constructor validates its
input, then wires four subsystems:

```mermaid
graph LR
    Auth["Auth"]
    Auth --> RBAC["RBAC<br/>roles and permissions"]
    Auth --> OAuth["OAuth<br/>providers and state"]
    Auth --> RS["RefreshStore<br/>rotation and revocation"]
    Auth --> JWT["jsonwebtoken<br/>sign and verify"]
    Auth --> PWD["scrypt<br/>password hashing"]
    Auth --> US["UserStore<br/>optional persistence"]
```

`UserStore` is entirely optional. Without it, `login()` still mints tokens for
a user record you supply; only `register()`, `loginWithPassword()`, and the
OAuth user-provisioning paths require it.

### Login pipeline

1. Reject a record without an `id`
2. Run `beforeLogin` hooks
3. Normalize `roles` from `user.roles` and `user.role`
4. Resolve permissions from those roles
5. Run registered claim extractors
6. Merge `sub`, `userId`, profile fields, roles, permissions, extra claims
7. Sign the access token, stamping a `jti` and `typ: "access"`
8. Unless `refresh: false`, sign the refresh token with its own `jti` and
   persist the record to the `RefreshStore`
9. Run `afterLogin` hooks and `onLogin`

Step 4 is the security-relevant one. Permissions are computed from roles only;
see [Trust boundaries](#trust-boundaries).

## Token lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Auth
    participant S as RefreshStore

    C->>A: login() / loginWithPassword()
    A->>A: sign access token (typ: access, jti)
    A->>A: sign refresh token (typ: refresh, jti)
    A->>S: save(record)
    A-->>C: { accessToken, refreshToken }

    C->>A: request + Bearer access token
    A->>A: verify signature, iss, aud, exp
    A->>A: reject if typ is refresh
    A-->>C: JwtPayload

    C->>A: refresh(refreshToken)
    A->>A: verify with refreshSecret
    A->>S: consume(jti) — atomic
    S-->>A: record | null
    A-->>C: new token pair
    Note over C,A: The presented token is now invalid.
```

### Two token types, one secret by default

Access and refresh tokens are both JWTs. `refreshSecret` defaults to `secret`,
so both are signed with the same key and distinguished only by the `typ` claim:

| | Access token | Refresh token |
| :--- | :--- | :--- |
| `typ` | `access` | `refresh` |
| Signed with | `secret` | `refreshSecret` |
| Default TTL | `15m` | `7d` |
| Carries | `roles`, `permissions`, profile | `sub`, `userId`, `roles` |
| Accepted by | `verify()` | `refresh()` only |
| Contains | identity claims | no permissions |

Set a distinct `refreshSecret` to get real key separation. Keeping one secret is
still safe, because `verify()` refuses a `typ: "refresh"` token outright.

### Refresh rotation

Every `refresh()` call consumes the presented token. This is the reason
`RefreshStore` has a `consume()` method:

```mermaid
sequenceDiagram
    participant R1 as Request A
    participant R2 as Request B
    participant S as Store

    R1->>S: consume(jti)
    S-->>R1: record
    R2->>S: consume(jti)
    S-->>R2: null
    Note over R2: rejected as revoked
```

`get()` followed by `revoke()` is two round-trips, so two concurrent requests
can both observe a valid token and both receive a fresh session. `consume()` must
be a single atomic operation:

| Store | Atomic primitive |
| :--- | :--- |
| Redis | `GETDEL key` |
| PostgreSQL | `DELETE FROM sessions WHERE id = $1 RETURNING *` |
| MongoDB | `findOneAndDelete({ _id })` |
| In-memory | `Map.get` then `Map.delete` with no `await` between |

`revoke()` and `consume()` are not optional. If a store implements neither,
`refresh()` and `logout()` throw `ConfigurationError` rather than report a
logout that never happened. For logout the two are interchangeable — both remove
one id — so a `consume`-only store supports both operations. Rotation is stricter:
having reached that path, `consume` is already absent, so `revoke` is required.

### What revocation does and does not cover

A refresh token is a revocable record. An access token is not — it is a signed
assertion that is checked and discarded, so nothing can un-sign it. That
distinction is worth being explicit about, because it determines what an
operator can promise when they say "log this user out".

| Action | Effect on a refresh token | Effect on an already-issued access token |
| :--- | :--- | :--- |
| `logout(refreshToken)` | Revoked immediately | Still valid until it expires |
| `revokeAllSessions(userId)` | All revoked immediately | All rejected immediately |
| Role or permission change | Refreshed tokens pick up the change on next `refresh()` | Still carry the old `roles` and `permissions` until expiry |
| `authTime` / "log out everywhere" | — | — |

So the row that surprises people is the third: **RBAC changes are not
retroactive.** An access token's `roles` and `permissions` are a snapshot taken
at login. Removing a role from a user record does not strip it from tokens
already in the wild, and `permissions` is compared by `rbac.can()` against those
claims, so the stale grant still authorizes. The window is bounded by
`accessTokenTtl`; the fix for a tighter bound is a shorter TTL, not a different
call.

`revokeAllSessions()` closes that window, which is what `SessionStore` is for.
It stamps a session version into each token and compares on every `verify()`
and `refresh()`:

```js
const auth = createAuth({
  secret,
  sessionStore: {
    getVersion: (userId) => db.getVersion(userId) ?? 0,
    bumpVersion: (userId) => db.incrementVersion(userId),
  },
});

await auth.revokeAllSessions(userId); // access + refresh, everywhere
```

Two things to know before configuring one:

- It costs **one store read per verification**, on the request path. That is why
  it is opt-in rather than always on, and why for a stateless deployment the
  usual answer is a short `accessTokenTtl` instead.
- A token minted before a `sessionStore` was configured carries no `sv` and is
  treated as version `0`, so adding one does not invalidate sessions that are
  already in flight. Bump the version to `1` if you want a clean cutover.

Without a `sessionStore`, `revokeAllSessions()` returns `false`. It does not
throw and it does not pretend to have worked, because a logout that silently
does nothing is the failure this package tries hardest to avoid.

## Trust boundaries

The package draws a hard line between values it derived and values it was
handed. Three boundaries matter most.

### Roles come from your code, not the request

`register()` discards a `roles` field in its input argument. A public sign-up
form posts straight into that argument, so honoring the field would let anyone
mint themselves an `admin` token. Pass roles through the second, server-side
argument:

```js
await auth.register({ email, password }, { roles: ["member"] });
```

`loginWithOAuth()` applies the same rule, taking roles from its options rather
than the provider profile.

### `auth.login()` expects a verified user record

`login()` is a low-level primitive: it signs whatever record you hand it. It
does not check passwords and does not know whether the roles are legitimate.
Resolve the user through `loginWithPassword()` or your own store first.

Never pass a request body straight into `login()`:

```js
// Vulnerable: the caller picks their own roles.
auth.login({ id: req.body.id, roles: req.body.roles });

// Correct: the roles come from your authorization rules.
const user = await store.findById(req.body.id);
auth.login({ ...user, roles: rolesFor(user) });
```

### Permissions are derived, not stored

A `permissions` array on the user record is **not** copied into the access
token. If it were, one attacker-writable database column would be equivalent to
full privilege escalation, and the RBAC configuration would be advisory.

Permissions come from `rbac` role definitions. Set `trustUserPermissions: true`
only when a separate write path guarantees the column is server-controlled.

Direct permissions still work for explicit subjects, where the caller supplies
them in code rather than from storage:

```js
rbac.can({ roles: ["member"], permissions: ["beta.access"] }, "beta.access");
```

### `defaultRole` applies to a null subject too

A subject with no roles — **including `null` and `undefined`** — is assigned
`defaultRole`. This is intentional, and it means:

```js
const rbac = createRBAC({ defaultRole: "admin", roles: { admin: { permissions: ["*"] } } });

rbac.can(null, "anything");   // true
rbac.can({}, "anything");     // true
```

So `defaultRole` is a grant to anonymous callers, not just a convenience for
roled users. Two consequences:

1. Keep `defaultRole` unprivileged. A guest/user default is the safe choice; an
   admin default turns any missed null check into full privilege escalation.
2. Always check for a subject before asking. The bundled adapters do this
   (`if (!req.user) return 401`) before calling `can`, but your own middleware
   may not:

```js
// Grants the default role to anonymous callers.
if (auth.can(ctx.state.user, "post.write")) { ... }

// Correct: no subject, no grant.
if (ctx.state.user && auth.can(ctx.state.user, "post.write")) { ... }
```

### Role inheritance

A role can inherit from parents, and resolution is cycle-safe. Permissions
resolve as: direct grants on the role, then every ancestor's grants.

```mermaid
graph TD
    admin["admin<br/>user.manage"]
    editor["editor<br/>inherits member<br/>post.write"]
    member["member<br/>profile.read"]

    admin --> editor
    editor --> member
```

## Wildcard matching

`matchPermission(granted, needed)` supports two wildcards:

| Granted | Matches | Does not match |
| :--- | :--- | :--- |
| `*` | anything | — |
| `posts.*` | `posts.create` | `posts.a.b`, `postsx.create` |
| `posts.**` | `posts.create`, `posts.a.b` | `comments.create` |

`*` stays within one dot-separated segment. `**` spans any number of segments.
Wildcards never cross a segment boundary, so `post.*` does not match
`posts.create`.

`can()` requires every requested permission to be satisfied. A granted `*`
satisfies all of them.

## Password hashing

Passwords use Node's `scrypt` with a self-describing format, so cost parameters
travel inside the hash and can be raised later without invalidating old ones:

```text
scrypt$N$r$p$keyLength$salt$hash
```

`needsRehash()` compares a stored hash against current defaults, and
`loginWithPassword()` transparently rehashes on a successful login when the
user store implements `updatePassword`.

Verification is constant-time via `timingSafeEqual`, and returns `false` rather
than throwing for any malformed or unparsable hash.

### Stored parameters are treated as hostile input

`N`, `r`, `p`, and `keyLength` travel inside the hash, which means they are
attacker-influenced anywhere an attacker can write a user row: a SQL injection
somewhere else, a restored backup, a bulk import, a support tool. They are
range-checked before scrypt is called, on both the hashing and the verifying
path.

This matters because Node's `maxmem` guard only covers the `128 * N * r` memory
block. `keyLength` and `p` sit outside it, so before these checks a single
stored hash of `scrypt$16384$8$1$1073741824$...` cost 25.3 seconds of CPU on a
default configuration — repeatable, on every login attempt, from one string.

| Parameter | Constraint |
| :--- | :--- |
| `N` (`cost`) | power of two, `[2, 2^20]` |
| `r` (`blockSize`) | `[1, 32]` |
| `N * r` | `[2^12, 196608]` — 24MB of working memory |
| `p` (`parallelism`) | `[1, 16]` |
| `keyLength` | `[16, 128]` |
| `saltBytes` | `[8, 64]` |

`N * r` is capped rather than `N` alone, because memory is the product, and the
ceiling is set below Node's 32MB limit so a hash the library accepts is one the
platform can actually run. `N * r` is floored as well: a stored hash asking for
trivial work (`N=2, r=1`) verifies instantly, which is a brute-force shortcut
rather than a valid hash.

A hash outside these bounds is reported as malformed and never computed.
`hashPassword()` throws `ValidationError` for the same reason, instead of
letting OpenSSL's error escape.

## OAuth

```mermaid
sequenceDiagram
    participant U as User
    participant A as App
    participant P as Provider

    A->>A: authorize() — generate state, optional PKCE verifier
    A->>A: stateStore.set(state, record, ttl)
    A-->>U: 302 to provider

    U->>A: /callback?code=...&state=...
    A->>A: stateStore.get(state), then delete
    A->>P: exchangeCode(code, redirectUri, codeVerifier)
    P-->>A: access + refresh tokens
    A->>P: fetchProfile(tokens)
    P-->>A: profile
    A->>A: resolve or provision user, then login()
```

State is single-use: it is read and deleted before the code exchange, so a
replayed callback fails. Public clients should enable `pkce`; without PKCE and
without state there is no CSRF binding on the callback.

`loginWithOAuth()` accepts the callback params as a full URL, a path with a
query, a leading `?code=...`, a bare query string, or a plain object.

### How each provider establishes identity

Most providers return a profile by calling the provider's userinfo endpoint with
the access token, so the **provider itself** verifies the identity. Those are
server-verified by construction.

`apple` is the exception: Sign in with Apple returns the profile inside the
`id_token` from the code exchange, so the claims are read locally. The token is
verified before any claim is read out of it:

- the **RS256 signature** is checked against Apple's published JWKS, with the
  algorithm pinned to `RS256` and a `kid` required;
- `iss`, `aud` (against your `clientId`), and `exp` are then checked, in that
  order, and a mismatch throws `ProviderError`.

The order matters. Claims inside a JWT are unauthenticated until the signature
is checked, so validating `iss` or `aud` first only proves the payload says what
the attacker wants it to say.

Keys are fetched from `https://appleid.apple.com/auth/keys` and cached for an
hour. An unknown `kid` triggers one refetch before failing, which is what makes
a routine Apple key rotation invisible to callers. You can supply keys yourself
if you already maintain a cache, or if you run in an environment without
outbound network access:

```js
// Use your own key source instead of Apple's endpoint.
const apple = { clientId, jwks: () => myKeyCache.get("apple") };
```

`exp` is **required**. A token without a numeric `exp` is rejected rather than
treated as never expiring.

> `verifyIdTokenSignature: false` disables the signature check. It exists for
> test harnesses. Do not use it in production — without it, anyone who can
> influence the token response chooses the user.

A profile must carry a stable subject id. Without one, the fallback user id
would be `` `${provider}:${profile.id}` `` and every user of that provider would
share the subject `"google:undefined"`, so the call throws `ProviderError`
instead. Map the identifier explicitly:

```js
const acme = createProvider({
  id: "acme",
  authorizationUrl: "...",
  tokenUrl: "...",
  userInfoUrl: "...",
  profileMap: { id: "account_id", email: "email", name: "full_name" },
});
```

The state store is in-memory by default. Provide your own `StateStore` backed by
Redis or your session layer to make the flow work across multiple instances.

## Adapters

Adapters are thin. Each one extracts a token, calls `verify()`, and maps errors
to a response. They do not cache, and they do not hold state between requests.

| Adapter | Reads token from | Attaches to | Notes |
| :--- | :--- | :--- | :--- |
| Express | `req.headers`, `req.cookies`, `req.query`, `req.getHeader` | `req.user`, `req.token` | `next(error)` when `passthrough` |
| Fastify | request headers, cookies, query | `request.user` | `optional` honored from plugin or route |
| Koa | `ctx.request` | `ctx.state.user` | downstream errors propagate to Koa |
| uWS | `getHeader`, `getQuery`, `forEach` | snapshot object | request snapshotted before any `await` |

### Header shapes

uWebSockets.js is not a normal Node request. It is single-threaded and its
`res` object is only valid until the next tick, so `snapshotUwsRequest()` copies
method, URL, query, and headers into a plain object before any `await`.

Two `forEach` conventions exist in the wild and both are supported:

| Source | Signature | Example |
| :--- | :--- | :--- |
| uWS `HttpRequest` | `(key, value)` | native to uWebSockets.js |
| WHATWG `Headers` | `(value, key)` | `fetch` / `Request` / `Response` |

`collectHeaders()` detects which one it is looking at. Conflating them silently
yields zero headers and a 401 on every request, so both paths have dedicated
tests.

### Error mapping

Every error extends `AuthError` and carries `code` and `status`. Adapters send
`{ error, message }` and never leak a stack.

| Class | `code` | HTTP |
| :--- | :--- | :--- |
| `InvalidTokenError` | `INVALID_TOKEN` | 401 |
| `TokenExpiredError` | `TOKEN_EXPIRED` | 401 |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 |
| `ForbiddenError` | `FORBIDDEN` | 403 |
| `OAuthError` | `OAUTH_ERROR` | 401 |
| `ProviderError` | `PROVIDER_ERROR` | 502 |
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `ConfigurationError` | `CONFIGURATION_ERROR` | 500 |

## Extension points

| Hook | Signature | Use |
| :--- | :--- | :--- |
| `registerExtractor(name, fn)` | `(user) => value` | Add a claim derived from the user || `hook("beforeLogin", fn)` | `(payload, auth)` | Reject or annotate before signing |
| `hook("afterLogin", fn)` | `(result, auth)` | Audit a successful login |
| `hook("afterVerify", fn)` | `(claims, auth)` | Audit a verification |
| `onLogin(result)` | `() => unknown` | Fire-and-forget login event |
| `onLink(event)` | `({ user, provider, profile })` | React to account linking |

A claim extractor that throws sets its claim to `null` rather than failing the
login, so one bad extractor cannot take down authentication.

Extractors and `additionalClaims` run *after* the derived claims, so a name
collision would otherwise rewrite the token's identity. These names are
reserved and refused:

`sub`, `userId`, `roles`, `permissions`, `typ`, `iss`, `aud`, `exp`, `iat`,
`nbf`, `jti`

`registerExtractor()` throws on a reserved name, reserved keys inside an
object returned by an extractor are dropped, and `login()` rejects an
`additionalClaims` entry that names one. Everything else — `name`, `email`,
`tier`, `tenantId` — is yours to set.

## Configuration reference

| Option | Default | Notes |
| :--- | :--- | :--- |
| `secret` | — | **Required.** Construction throws without it. |
| `refreshSecret` | `secret` | Set separately for key separation. |
| `issuer` / `audience` | — | Verified on every token. |
| `algorithm` | `HS256` | Pinned; never negotiated from the token header. |
| `accessTokenTtl` | `15m` | Also settable per login. |
| `refreshTokenTtl` | `7d` | Also settable per login. |
| `clockTolerance` | `0` | Seconds of leeway for `exp` / `nbf`. |
| `trustUserPermissions` | `false` | See [Trust boundaries](#trust-boundaries). |
| `rbac` / `roles` | `new RBAC()` | Accepts an `RBAC` instance or options. |
| `userStore` | `null` | Required only for register and password login. |
| `refreshStore` | in-memory | Should be shared and atomic. |
| `oauth` / `providers` | empty | Built-in or custom providers. |

A TTL must be a number of seconds or a timespan this package can parse: `s`,
`m`, `h`, `d`, `w`. Anything else (`"1y"`, `"2 hours"`) throws
`ValidationError` at signing time, so the signed token and any locally computed
expiry can never disagree.

## Security invariants

The behaviors below are covered by `test/security.test.ts`. If a change breaks
one, that test should fail.

1. `verify()` rejects a token whose `typ` is `refresh`
2. `register()` ignores roles in its input argument
3. Access token permissions come from roles, not the user record
4. `revoke()` and `refresh()` throw rather than no-op on a store that cannot invalidate
5. A refresh token is consumable exactly once, including under concurrency
6. `revoke()` pins the configured algorithm and rejects access tokens
7. The Koa adapter does not convert downstream errors into auth failures
8. The Fastify adapter honors `optional` set on the plugin
9. `alg: none`, cross-secret, and cross-algorithm tokens are rejected
10. Unparsable TTLs throw instead of silently defaulting
11. `loginWithOAuth()` refuses to mint a token without a provider subject id
12. Hostile scrypt parameters return `false` rather than throwing or hanging
13. RBAC inheritance cycles terminate, and `can()` denies an empty permission list
14. Extractors and `additionalClaims` cannot set a reserved identity or permission claim
15. A stored hash cannot make `verifyPassword()` do unbounded work
16. A refresh token with no `jti` is refused, so every refresh is revocable
17. The query string is not read for a token unless `query: true`
18. An Apple `id_token` signature is verified before any claim is read from it
19. `revokeAllSessions()` stops both `verify()` and `refresh()` for that user
20. `revokeAllSessions()` returns `false` when no `SessionStore` is configured

## Related

- [README.md](./README.md) — API tour
- [CHANGELOG.md](./CHANGELOG.md) — release history
- [../../docs/security.md](../../docs/security.md) — workspace-wide security notes
