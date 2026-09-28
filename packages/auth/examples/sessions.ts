/**
 * Session revocation, and the limits of token revocation in general.
 *
 * A refresh token is a revocable record: `logout()` removes it. An access token
 * is not. It is a signed assertion that is checked and thrown away, so nothing
 * can un-sign it — which means revoking a session does not, by itself, cut off
 * an access token that was already handed out.
 *
 * This example shows what you get from each option:
 *
 *   1. no sessionStore        — logout kills one refresh token
 *   2. sessionStore           — revokeAllSessions kills access and refresh, everywhere
 *   3. scrypt parameter bounds
 *   4. claims that cannot be forged
 */
import {
  createAuth,
  encodeRefreshToken,
  hashPassword,
  verifyPassword,
} from "@oneunit/auth";
import type { UserRecord, ValidationError } from "@oneunit/auth";

const SECRET = process.env.AUTH_SECRET ?? "change-me-in-production";

function banner(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

const user: UserRecord = { id: "user_01", email: "ada@example.com", roles: ["member"] };

// ---------------------------------------------------------------------------
// 1. Without a sessionStore: logout revokes exactly one refresh token
// ---------------------------------------------------------------------------

banner("1. logout() without a sessionStore");

const stateless = createAuth({ secret: SECRET, rbac: { roles: { member: { permissions: ["profile.read"] } } } });

const first = await stateless.login(user);
const second = await stateless.login(user);

await stateless.logout(first.refreshToken);

const revoked = await stateless.refresh(first.refreshToken!).then(() => "STILL VALID", () => "revoked");
const survivor = await stateless.refresh(second.refreshToken!).then((s) => "still valid", () => "revoked");
console.log("logged-out session  :", revoked);
console.log("other session       :", survivor);

// The access token from the logged-out session keeps working until it expires.
// It is signed and stateless, so the server has no way to take it back.
const staleAccess = await stateless.verify(first.accessToken).then(() => "STILL VALID", () => "rejected");
console.log("its access token    :", staleAccess, "(expires on its own)");

// ---------------------------------------------------------------------------
// 2. With a sessionStore: revokeAllSessions cuts off everything, immediately
// ---------------------------------------------------------------------------

banner("2. revokeAllSessions() with a sessionStore");

// Stands in for a counter in your database. The only requirement is that
// getVersion() returns a number that increases when sessions are invalidated.
const versions = new Map<string, number>();

const auth = createAuth({
  secret: SECRET,
  rbac: { roles: { member: { permissions: ["profile.read"] } } },
  sessionStore: {
    getVersion: (userId) => versions.get(String(userId)) ?? 0,
    bumpVersion: (userId) => {
      const next = (versions.get(String(userId)) ?? 0) + 1;
      versions.set(String(userId), next);
      return next;
    },
  },
});

const phone = await auth.login(user);
const laptop = await auth.login(user);
console.log("phone session sv    :", phone.payload.sv);
console.log("laptop session sv   :", laptop.payload.sv);

console.log("\nbefore revoking:");
console.log("  phone access      :", await auth.verify(phone.accessToken).then(() => "valid", () => "rejected"));
console.log("  laptop access     :", await auth.verify(laptop.accessToken).then(() => "valid", () => "rejected"));
console.log("  phone refresh     :", await auth.refresh(phone.refreshToken!).then(() => "valid", () => "rejected"));

// One call: every device, both token types.
const bumped = await auth.revokeAllSessions(user.id);
console.log(`\nrevokeAllSessions() : ${bumped} (version is now ${versions.get("user_01")})`);

console.log("\nafter revoking:");
console.log("  phone access      :", await auth.verify(phone.accessToken).then(() => "STILL VALID", () => "rejected"));
console.log("  laptop access     :", await auth.verify(laptop.accessToken).then(() => "STILL VALID", () => "rejected"));
// refresh() is covered too, so a stolen refresh token cannot mint a new session.
console.log("  phone refresh     :", await auth.refresh(phone.refreshToken!).then(() => "STILL VALID", () => "rejected"));

const after = await auth.login(user);
console.log("\na fresh login works  :", await auth.verify(after.accessToken).then(() => "yes", () => "no"), `(sv=${after.payload.sv})`);

// Another user is untouched.
const other = await auth.login({ id: "user_02", email: "bob@example.com", roles: ["member"] });
console.log("other user unaffected:", await auth.verify(other.accessToken).then(() => "yes", () => "no"));

// Without a sessionStore the call cannot work, so it says so instead of
// pretending to have logged anyone out.
console.log("no store configured :", await stateless.revokeAllSessions(user.id), "(false = nothing was revoked)");

// ---------------------------------------------------------------------------
// 3. Password hashing cannot be made to do unbounded work
// ---------------------------------------------------------------------------

banner("3. Password hashing bounds");

const stored = await hashPassword("correct horse battery staple");
console.log("hash round-trip     :", await verifyPassword("correct horse battery staple", stored));
console.log("wrong password      :", await verifyPassword("wrong", stored));

// The cost parameters travel inside the hash, so they are attacker-influenced
// anywhere an attacker can write a user row. They are range-checked before any
// work happens. This used to cost ~25 seconds of CPU.
const salt = Buffer.alloc(16).toString("base64url");
const bomb = ["scrypt", 16384, 8, 1, 2 ** 30, salt, "AAAA"].join("$");
const started = Date.now();
const bombResult = await verifyPassword("guess", bomb);
console.log(`bomb hash            : ${bombResult} (${Date.now() - started}ms, was ~25000ms)`);

// A hash asking for trivial work is a brute-force shortcut, not a valid hash.
const weak = ["scrypt", 2, 1, 1, 64, salt, "AAAA"].join("$");
console.log("downgraded hash      :", await verifyPassword("guess", weak));

try {
  await hashPassword("pw", { keyLength: 1e9 });
} catch (error) {
  console.log("over-budget options  :", (error as ValidationError).message.slice(0, 62) + "...");
}

// ---------------------------------------------------------------------------
// 4. Identity and permission claims cannot be forged
// ---------------------------------------------------------------------------

banner("4. Reserved claims");

// A collision on a derived claim used to be applied last and win, so this
// minted a token claiming sub "admin" for user_01.
try {
  await auth.login(user, { additionalClaims: { roles: ["admin"] } });
} catch (error) {
  console.log("additionalClaims     :", (error as ValidationError).message.slice(0, 62) + "...");
}

try {
  auth.registerExtractor("permissions", () => ["*"]);
} catch (error) {
  console.log("reserved extractor   :", (error as ValidationError).message.slice(0, 62) + "...");
}

// A refresh token with no jti has no store record, so nothing can revoke it.
const jtiLess = encodeRefreshToken({ sub: "user_01", userId: "user_01", roles: ["member"] }, SECRET, {
  expiresIn: "30d",
});
console.log("jti-less refresh     :", await auth.refresh(jtiLess).then(() => "ACCEPTED", () => "rejected"));

// Non-reserved names still work.
const custom = await auth.login(user, { additionalClaims: { tenantId: "acme" } });
console.log("custom claims        :", `tenantId=${custom.payload.tenantId}`);

console.log();
