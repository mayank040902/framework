import { createAuth, encode, decode } from "@oneunit/auth";

const auth = createAuth({
  secret: process.env.AUTH_SECRET ?? "change-me-in-production",
  issuer: "example-app",
  accessTokenTtl: "15m",
  refreshTokenTtl: "7d",
  rbac: {
    defaultRole: "member",
    roles: {
      member: { permissions: ["profile.read"] },
      billing: { permissions: ["invoice.read", "invoice.pay"] },
      admin: { inherits: ["member", "billing"], permissions: ["user.manage"] },
      // `**` spans any depth; `*` stays within one segment.
      reporter: { permissions: ["ticket.*", "audit.**"] },
    },
  },
});

const session = await auth.login({
  id: "user_01",
  email: "ada@example.com",
  name: "Ada",
  roles: ["admin"],
});

console.log("access token ", session.accessToken);
console.log("refresh token", session.refreshToken);
console.log("permissions  ", session.payload.permissions);

const claims = await auth.verify(session.accessToken);
console.log("verified subject", claims.sub);

// A refresh token is not an access token, even though both are signed with the
// same secret and differ only by the `typ` claim.
try {
  await auth.verify(session.refreshToken!);
} catch (error) {
  console.log("refresh token rejected by verify():", (error as Error).message);
}

// Rotation consumes the presented token. A second attempt fails.
const rotated = await auth.refresh(session.refreshToken!);
console.log("rotated refresh token differs:", rotated.refreshToken !== session.refreshToken);
try {
  await auth.refresh(session.refreshToken!);
} catch (error) {
  console.log("replayed refresh token rejected:", (error as Error).message);
}

// Wildcard matching.
const reporter = { roles: ["reporter"] };
console.log("reporter can read ticket.42: ", auth.can(reporter, "ticket.42"));
console.log("reporter can read audit.a.b:  ", auth.can(reporter, "audit.a.b"));
console.log("reporter can read audit:      ", auth.can(reporter, "audit"));

const raw = encode({ job: "export" }, auth.secret, { expiresIn: "5m" });
console.log("ad-hoc token", decode(raw, auth.secret).job);

// An unparsable TTL throws instead of silently defaulting to 24 hours.
try {
  encode({ job: "export" }, auth.secret, { expiresIn: "1y" });
} catch (error) {
  console.log("invalid expiresIn rejected:", (error as Error).message);
}

console.log("can manage users?", auth.can(session.payload, "user.manage"));
