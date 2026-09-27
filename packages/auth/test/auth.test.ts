import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Auth,
  createAuth,
  encode,
  decode,
  ConfigurationError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
} from "../src/index.js";
import type { LoginResult, OAuthProfile, UserRecord } from "../src/index.js";

const SECRET = "secret-key-for-testing-purposes-123456";

function memoryUsers(seed: UserRecord[] = []) {
  const users = new Map(seed.map((user) => [String(user.id), { ...user }]));
  let nextId = seed.length + 1;
  return {
    async findById(id: string | number) {
      return users.get(String(id)) ?? null;
    },
    async findByEmail(email: string) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findByUsername(username: string) {
      return [...users.values()].find((user) => user.username === username) ?? null;
    },
    async findByCredentials(identifier: string) {
      return (
        [...users.values()].find(
          (user) => user.email === identifier || user.username === identifier,
        ) ?? null
      );
    },
    async create(input: Record<string, unknown>) {
      const user = { id: nextId++, ...input } as UserRecord;
      users.set(String(user.id), user);
      return user;
    },
    async updatePassword(id: string | number, passwordHash: string) {
      const user = users.get(String(id));
      if (user) user.passwordHash = passwordHash;
    },
    async findByProvider(provider: string, providerId: string | number) {
      return (
        [...users.values()].find(
          (user) => user.provider === provider && String(user.providerId) === String(providerId),
        ) ?? null
      );
    },
    async createFromProvider(provider: string, profile: OAuthProfile) {
      const user: UserRecord = {
        id: nextId++,
        email: profile.email,
        username: profile.username,
        name: profile.name,
        provider,
        providerId: profile.id,
        roles: ["member"],
      };
      users.set(String(user.id), user);
      return user;
    },
    async linkProvider(id: string | number, provider: string, profile: OAuthProfile) {
      const user = users.get(String(id));
      if (user) {
        user.provider = provider;
        user.providerId = profile.id;
      }
    },
  };
}

describe("Auth", () => {
  it("requires a secret", () => {
    assert.throws(() => new Auth(), ConfigurationError);
    assert.ok(createAuth({ secret: SECRET }) instanceof Auth);
  });

  it("issues and verifies access tokens without built-in roles", async () => {
    const auth = createAuth({
      secret: SECRET,
      issuer: "auth.test",
      rbac: {
        defaultRole: "member",
        roles: {
          member: { permissions: ["article.read"] },
          editor: { inherits: "member", permissions: ["article.write"] },
        },
      },
    });

    const result = await auth.login({
      id: 42,
      email: "ada@example.com",
      username: "ada",
      roles: ["editor"],
    });

    assert.equal(typeof result.accessToken, "string");
    assert.equal(typeof result.refreshToken, "string");
    assert.equal(result.payload.userId, 42);
    assert.deepEqual(result.payload.roles, ["editor"]);
    assert.ok(result.payload.permissions?.includes("article.read"));
    assert.ok(result.payload.permissions?.includes("article.write"));

    const verified = await auth.verify(result.token);
    assert.equal(verified.email, "ada@example.com");
    assert.equal(verified.iss, "auth.test");
  });

  it("supports password registration and login", async () => {
    const auth = createAuth({
      secret: SECRET,
      userStore: memoryUsers(),
      rbac: { defaultRole: "member", roles: { member: { permissions: ["profile.read"] } } },
    });

    const created = await auth.register({
      email: "user@example.com",
      username: "user",
      password: "s3cret-pass",
    });
    assert.equal(created.user.email, "user@example.com");

    const session = await auth.loginWithPassword("user@example.com", "s3cret-pass");
    assert.equal(session.user.id, created.user.id);

    await assert.rejects(
      () => auth.loginWithPassword("user@example.com", "nope"),
      UnauthorizedError,
    );
  });

  it("refreshes and revokes refresh tokens", async () => {
    const store = memoryUsers([{ id: 1, email: "a@b.c", roles: ["member"] }]);
    const auth = createAuth({ secret: SECRET, userStore: store });
    const first = await auth.login({ id: 1, email: "a@b.c", roles: ["member"] });
    assert.ok(first.refreshToken);
    const next = await auth.refresh(first.refreshToken);
    assert.equal(next.user.id, 1);
    assert.notEqual(next.accessToken, first.accessToken);
    await assert.rejects(() => auth.refresh(first.refreshToken as string), UnauthorizedError);
    assert.equal(await auth.logout(next.refreshToken), true);
  });

  it("extracts bearer tokens from requests", async () => {
    const auth = createAuth({ secret: SECRET });
    const { accessToken } = await auth.login({ id: 9, roles: ["user"] });
    const claims = await auth.verifyRequest({
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(claims.userId, 9);

    const fromCookie = await auth.verifyRequest({
      headers: { cookie: `access_token=${accessToken}` },
    });
    assert.equal(fromCookie.userId, 9);
  });

  it("runs claim extractors and hooks", async () => {
    const auth = createAuth({ secret: SECRET });
    const seen: unknown[] = [];
    auth.registerExtractor("plan", async () => ({ plan: "pro" }));
    auth.hook("afterLogin", async (result) => {
      seen.push((result as LoginResult).payload.plan);
    });
    const result = await auth.login({ id: 3 });
    assert.equal(result.payload.plan, "pro");
    assert.deepEqual(seen, ["pro"]);
  });

  it("enforces generic permissions through Auth", async () => {
    const auth = createAuth({
      secret: SECRET,
      rbac: {
        roles: {
          reader: { permissions: ["doc.read"] },
        },
      },
    });
    const subject = { roles: ["reader"] };
    assert.equal(auth.can(subject, "doc.read"), true);
    assert.throws(() => auth.authorize(subject, "doc.write"), ForbiddenError);
    assert.equal(auth.hasRole(subject, "reader"), true);
  });

  it("rejects login without a user id", async () => {
    const auth = createAuth({ secret: SECRET });
    await assert.rejects(() => auth.login({} as UserRecord), ValidationError);
  });

  it("signs standalone tokens", () => {
    const auth = createAuth({ secret: SECRET, expiresIn: "1h" });
    const token = auth.sign({ hello: true });
    const claims = decode(token, SECRET);
    assert.equal(claims.hello, true);
  });

  it("works with encode/decode independently of Auth", () => {
    const token = encode({ custom: true }, SECRET, { expiresIn: "5m" });
    assert.equal(decode(token, SECRET).custom, true);
  });

  it("logs in with a custom oauth provider", async () => {
    const store = memoryUsers();
    const auth = createAuth({
      secret: SECRET,
      userStore: store,
      rbac: { defaultRole: "member", roles: { member: { permissions: ["profile.read"] } } },
      oauth: {
        providers: {
          acme: {
            clientId: "acme-id",
            provider: {
              id: "acme",
              pkce: false,
              createAuthorizationUrl() {
                return { url: "https://acme.example/authorize?client_id=acme-id", state: "st" };
              },
              async exchangeCode() {
                return { access_token: "provider-access" };
              },
              async fetchProfile() {
                return { id: "acme-user-1", email: "acme@example.com", name: "Acme User" };
              },
            },
          },
        },
      },
    });

    const started = await auth.getAuthorizationUrl("acme", { state: "st" });
    assert.match(started.url, /acme\.example/);

    const session = await auth.loginWithOAuth("acme", { code: "ok", state: "st" });
    assert.equal(session.user.email, "acme@example.com");
    assert.equal(session.payload.provider, "acme");
    assert.equal(session.oauth?.profile.id, "acme-user-1");
    const verified = await auth.verify(session.accessToken);
    assert.equal(verified.providerId, "acme-user-1");
  });
});

describe("express-style adapter helpers", () => {
  it("authenticates a request-like object", async () => {
    const { expressAdapter } = await import("../src/index.js");
    const auth = createAuth({ secret: SECRET });
    const { accessToken } = await auth.login({ id: 11, roles: ["member"] });
    const adapter = expressAdapter(auth);

    const req: { headers: { authorization: string }; user?: { userId?: string | number } | null } = {
      headers: { authorization: `Bearer ${accessToken}` },
    };
    const res = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(body: unknown) {
        this.body = body;
        return this;
      },
    };

    await new Promise<void>((resolve, reject) => {
      adapter.authenticate()(req, res, (error) => (error ? reject(error) : resolve()));
    });
    assert.equal(req.user?.userId, 11);
  });
});
