import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encode,
  decode,
  decodeUnsafe,
  encodeAccessToken,
  encodeRefreshToken,
  InvalidTokenError,
  TokenExpiredError,
  ValidationError,
} from "../src/index.js";
import type { JwtPayload } from "../src/index.js";

const SECRET = "test-secret-key-for-jwt-signing-32b";

describe("jwt", () => {
  it("signs and verifies a payload", () => {
    const token = encode({ userId: 7, role: "member" }, SECRET, {
      expiresInSeconds: 60,
      subject: "7",
    });
    assert.equal(typeof token, "string");
    const claims = decode(token, SECRET);
    assert.equal(claims.userId, 7);
    assert.equal(claims.role, "member");
    assert.equal(claims.sub, "7");
  });

  it("rejects missing secrets", () => {
    assert.throws(() => encode({}, ""), ValidationError);
    assert.throws(() => decode("token", ""), ValidationError);
  });

  it("rejects invalid tokens", () => {
    assert.throws(() => decode("not.a.token", SECRET), InvalidTokenError);
    assert.throws(() => decode("", SECRET), InvalidTokenError);
  });

  it("rejects expired tokens", () => {
    const token = encode({ userId: 1 }, SECRET, { expiresIn: "1s" });
    const claims = decode(token, SECRET, { ignoreExpiration: true });
    assert.equal(claims.userId, 1);
  });

  it("throws TokenExpiredError for expired tokens", () => {
    const token = encode({ userId: 1 }, SECRET, { expiresIn: 0 });
    assert.throws(() => decode(token, SECRET), TokenExpiredError);
  });

  it("decodes without verification", () => {
    const token = encode({ hello: "world" }, SECRET);
    const unsafe = decodeUnsafe(token) as JwtPayload;
    assert.equal(unsafe.hello, "world");
    assert.equal(decodeUnsafe(""), null);
  });

  it("creates access and refresh tokens with typ claims", () => {
    const access = encodeAccessToken({ userId: 9 }, SECRET, { subject: "9" });
    const refresh = encodeRefreshToken({ userId: 9 }, SECRET, { subject: "9" });
    assert.equal(decode(access, SECRET).typ, "access");
    assert.equal(decode(refresh, SECRET).typ, "refresh");
  });

  it("rejects non-object payloads", () => {
    assert.throws(() => encode("nope" as unknown as object, SECRET), ValidationError);
    assert.throws(() => encode(["array"] as unknown as object, SECRET), ValidationError);
  });

  it("honors issuer and audience", () => {
    const token = encode({ userId: 1 }, SECRET, {
      issuer: "auth.example",
      audience: "api.example",
    });
    const claims = decode(token, SECRET, {
      issuer: "auth.example",
      audience: "api.example",
    });
    assert.equal(claims.iss, "auth.example");
    assert.equal(claims.aud, "api.example");
    assert.throws(
      () => decode(token, SECRET, { issuer: "other" }),
      InvalidTokenError,
    );
  });
});
