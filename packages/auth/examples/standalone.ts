import { createAuth, encode, decode } from "../src/index.js";

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
    },
  },
});

const session = await auth.login({
  id: "user_01",
  email: "ada@example.com",
  name: "Ada",
  roles: ["admin"],
});

console.log("access token", session.accessToken);
console.log("refresh token", session.refreshToken);
console.log("permissions", session.payload.permissions);

const claims = await auth.verify(session.accessToken);
console.log("verified subject", claims.sub);

const raw = encode({ job: "export" }, auth.secret, { expiresIn: "5m" });
console.log("ad-hoc token", decode(raw, auth.secret).job);

console.log("can manage users?", auth.can(session.payload, "user.manage"));
