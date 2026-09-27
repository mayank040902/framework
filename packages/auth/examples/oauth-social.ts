import { createAuth } from "../src/index.js";

const auth = createAuth({
  secret: process.env.AUTH_SECRET ?? "change-me-in-production",
  redirectUri: "http://localhost:3000/auth/callback",
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/google/callback",
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

const { url, state } = await auth.getAuthorizationUrl("google");
console.log("Redirect users to:", url);
console.log("Store this state in a cookie or session:", state);

const fakeCallbackQuery = { code: "AUTH_CODE_FROM_PROVIDER", state };
console.log("On callback, exchange the code with auth.loginWithOAuth('google', query)");
console.log(fakeCallbackQuery);
