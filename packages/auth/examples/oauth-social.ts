import { createAuth } from "@oneunit/auth";

const auth = createAuth({
  secret: process.env.AUTH_SECRET ?? "change-me-in-production",
  redirectUri: "http://localhost:3000/auth/callback",
  // Roles are assigned from your rules, not from the provider profile. Without
  // a defaultRole and no roles option, every social user signs in with none.
  rbac: {
    defaultRole: "member",
    roles: {
      member: { permissions: ["profile.read"] },
      admin: { inherits: "member", permissions: ["user.manage"] },
    },
  },
  providers: {
    // Public clients should set `pkce: true`. State alone is not enough to bind
    // the callback to the browser that started the flow.
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/google/callback",
      pkce: true,
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
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/discord/callback",
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/twitter/callback",
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/facebook/callback",
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/apple/callback",
    },
  },
});

// Building the authorization URL requires a real client id. Provider
// configuration is validated lazily, so nothing above throws until this call.
if (!process.env.GOOGLE_CLIENT_ID) {
  console.log("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to run this example.");
  console.log("Provider config is validated at authorize() time, not at createAuth() time.");
  process.exit(0);
}

const { url, state, codeVerifier } = await auth.getAuthorizationUrl("google");
console.log("Redirect users to:", url);
console.log("Store this state in a cookie or session:", state);
if (codeVerifier) {
  console.log("Keep the PKCE verifier for the callback:", codeVerifier);
}

// The state store is in-memory by default, so it works for a single instance.
// Behind more than one instance, supply a Redis- or session-backed StateStore.

const fakeCallbackQuery = { code: "AUTH_CODE_FROM_PROVIDER", state };
console.log("On callback, exchange the code with auth.loginWithOAuth('google', query)");
console.log("State is single-use: a replayed callback throws OAuthError.");
console.log(fakeCallbackQuery);

// With a userStore providing findByProvider / findByEmail / createFromProvider,
// loginWithOAuth links the social account to an existing user instead of
// creating a duplicate for every provider.

