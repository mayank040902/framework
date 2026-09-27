import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, needsRehash, ValidationError } from "../src/index.js";

describe("password", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.match(hash, /^scrypt\$/);
    assert.equal(await verifyPassword("correct horse battery staple", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });

  it("rejects empty passwords", async () => {
    await assert.rejects(() => hashPassword(""), ValidationError);
  });

  it("returns false for malformed hashes", async () => {
    assert.equal(await verifyPassword("secret", "not-a-hash"), false);
    assert.equal(await verifyPassword("secret", null as unknown as string), false);
  });

  it("detects when a hash needs rehashing", async () => {
    const hash = await hashPassword("secret", { cost: 16384 });
    assert.equal(needsRehash(hash, { cost: 16384 }), false);
    assert.equal(needsRehash(hash, { cost: 32768 }), true);
    assert.equal(needsRehash("bcrypt$thing"), true);
  });
});
