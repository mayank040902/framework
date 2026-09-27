import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createOAuth,
  createProvider,
  getProvider,
  builtinProviders,
  google,
  github,
  instagram,
  ValidationError,
  OAuthError,
} from "../src/index.js";
import type { ProviderDefinition } from "../src/index.js";

describe("oauth providers", () => {
  it("exposes built-in social providers", () => {
    for (const id of [
      "google",
      "github",
      "instagram",
      "facebook",
      "twitter",
      "discord",
      "apple",
      "linkedin",
      "microsoft",
      "reddit",
      "twitch",
      "slack",
      "spotify",
      "tiktok",
    ] as const) {
      assert.ok(builtinProviders[id], `missing provider ${id}`);
      assert.equal(getProvider(id).id === "twitter" || getProvider(id).id === id, true);
    }
    assert.equal(google.id, "google");
    assert.equal(github.id, "github");
    assert.equal(instagram.id, "instagram");
  });

  it("builds a google authorization url", () => {
    const oauth = createOAuth({
      redirectUri: "http://localhost:3000/auth/google/callback",
      providers: {
        google: { clientId: "google-client", clientSecret: "google-secret" },
      },
    });

    return oauth.authorize("google", { state: "abc123" }).then((result) => {
      const url = new URL(result.url);
      assert.equal(url.hostname, "accounts.google.com");
      assert.equal(url.searchParams.get("client_id"), "google-client");
      assert.equal(url.searchParams.get("state"), "abc123");
      assert.equal(url.searchParams.get("response_type"), "code");
      assert.match(url.searchParams.get("scope") ?? "", /openid/);
    });
  });

  it("builds github and instagram authorization urls", async () => {
    const oauth = createOAuth({
      providers: {
        github: {
          clientId: "gh",
          clientSecret: "secret",
          redirectUri: "http://localhost/callback/github",
        },
        instagram: {
          clientId: "ig",
          clientSecret: "secret",
          redirectUri: "http://localhost/callback/instagram",
        },
      },
    });

    const gh = await oauth.authorize("github");
    assert.match(gh.url, /github\.com\/login\/oauth\/authorize/);
    const ig = await oauth.authorize("instagram");
    assert.match(ig.url, /api\.instagram\.com\/oauth\/authorize/);
  });

  it("rejects unknown providers and missing codes", async () => {
    const oauth = createOAuth();
    assert.throws(() => oauth.get("missing"), ValidationError);
    await assert.rejects(() => oauth.callback("google", {}), ValidationError);
  });

  it("surfaces provider errors from the callback query", async () => {
    const oauth = createOAuth({
      providers: {
        google: { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/cb" },
      },
    });
    await assert.rejects(
      () => oauth.callback("google", { error: "access_denied", error_description: "user denied" }),
      OAuthError,
    );
  });

  it("creates a custom provider", () => {
    const custom = createProvider({
      id: "acme",
      authorizationUrl: "https://acme.example/oauth/authorize",
      tokenUrl: "https://acme.example/oauth/token",
      userInfoUrl: "https://acme.example/me",
      scopes: ["profile"],
      profileMap: { id: "id", email: "email" },
    });
    const { url } = custom.createAuthorizationUrl(
      { clientId: "acme-id", redirectUri: "http://localhost/cb" },
      { state: "s" },
    );
    assert.match(url, /acme\.example/);
  });

  it("rejects invalid custom provider definitions", () => {
    assert.throws(() => createProvider({ id: "x" } as ProviderDefinition), ValidationError);
  });

  it("stores and validates oauth state", async () => {
    const oauth = createOAuth({
      providers: {
        discord: {
          clientId: "d",
          clientSecret: "s",
          redirectUri: "http://localhost/discord",
        },
      },
    });
    const started = await oauth.authorize("discord", { state: "discord-state" });
    assert.equal(await oauth.verifyState(started.state, "discord"), true);
    assert.equal(await oauth.verifyState("missing"), false);
  });
});
