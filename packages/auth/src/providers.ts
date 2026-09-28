import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
import { ProviderError, ValidationError } from "./errors.js";
import type {
  AuthorizationUrlOptions,
  AuthorizationUrlResult,
  ExchangeCodeOptions,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthTokens,
  ProfileMapValue,
  ProviderDefinition,
} from "./types.js";
import { buildUrl, formEncode, requestJson } from "./utils.js";

export function pkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function requireConfig(config: OAuthProviderConfig, keys: Array<keyof OAuthProviderConfig>): void {
  for (const key of keys) {
    if (!config[key]) {
      throw new ValidationError(`OAuth provider is missing ${String(key)}`);
    }
  }
}

function mapProfile(source: unknown, mapping: Record<string, ProfileMapValue>): Record<string, unknown> {
  const profile: Record<string, unknown> = {};
  const record = isRecord(source) ? source : {};
  for (const [key, path] of Object.entries(mapping)) {
    profile[key] = typeof path === "function" ? path(record) : getPath(record, path);
  }
  return profile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPath(object: unknown, path: string): unknown {
  if (!path) {
    return undefined;
  }
  return String(path).split(".").reduce<unknown>((acc, key) => {
    if (!isRecord(acc) && !Array.isArray(acc)) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, object);
}

function errorMessage(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    if (typeof body.error_description === "string") return body.error_description;
    if (typeof body.error === "string") return body.error;
  }
  return fallback;
}

export function createProvider(definition: ProviderDefinition): OAuthProvider {
  const {
    id,
    name = id,
    authorizationUrl,
    tokenUrl,
    userInfoUrl,
    scopes = [],
    profileMap = {},
    tokenAuthMethod = "body",
    pkce = false,
    extraAuthParams = {},
    extraTokenParams = {},
    userInfoHeaders = {},
    parseProfile,
  } = definition;

  if (!id || !authorizationUrl || !tokenUrl) {
    throw new ValidationError("Provider requires id, authorizationUrl, and tokenUrl");
  }

  return {
    id,
    name,
    authorizationUrl,
    tokenUrl,
    userInfoUrl,
    scopes,
    pkce,
    tokenAuthMethod,

    createAuthorizationUrl(
      config: OAuthProviderConfig,
      { state, redirectUri, codeVerifier, extraParams = {} }: AuthorizationUrlOptions = {},
    ): AuthorizationUrlResult {
      requireConfig(config, ["clientId"]);
      const params: Record<string, unknown> = {
        client_id: config.clientId,
        redirect_uri: redirectUri ?? config.redirectUri,
        response_type: "code",
        scope: (config.scopes ?? scopes).join(" "),
        state,
        ...extraAuthParams,
        ...(config.extraAuthParams ?? {}),
        ...extraParams,
      };

      let verifier: string | undefined;
      if (pkce || config.pkce) {
        verifier = codeVerifier ?? pkceVerifier();
        params.code_challenge = pkceChallenge(verifier);
        params.code_challenge_method = "S256";
      }

      return {
        url: buildUrl(authorizationUrl, "", params),
        state,
        codeVerifier: verifier,
      };
    },

    async exchangeCode(
      config: OAuthProviderConfig,
      { code, redirectUri, codeVerifier }: ExchangeCodeOptions = {},
    ): Promise<OAuthTokens> {
      requireConfig(config, ["clientId"]);
      if (!code) {
        throw new ValidationError("Authorization code is required");
      }

      const body: Record<string, unknown> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri ?? config.redirectUri,
        ...extraTokenParams,
        ...(config.extraTokenParams ?? {}),
      };

      if (codeVerifier) {
        body.code_verifier = codeVerifier;
      }

      const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      };

      if ((config.tokenAuthMethod ?? tokenAuthMethod) === "basic") {
        const credentials = Buffer.from(`${config.clientId}:${config.clientSecret ?? ""}`).toString("base64");
        headers.authorization = `Basic ${credentials}`;
      } else {
        body.client_id = config.clientId;
        if (config.clientSecret) {
          body.client_secret = config.clientSecret;
        }
      }

      const response = await requestJson(tokenUrl, {
        method: "POST",
        headers,
        body: formEncode(body),
      });

      if (!response.ok) {
        throw new ProviderError(errorMessage(response.body, `${name} token exchange failed`), {
          status: response.status,
        });
      }

      return (isRecord(response.body) ? response.body : {}) as OAuthTokens;
    },

    async fetchProfile(config: OAuthProviderConfig, tokens: OAuthTokens): Promise<OAuthProfile> {
      if (typeof parseProfile === "function") {
        return parseProfile(tokens, config);
      }

      if (!userInfoUrl) {
        return { provider: id, ...mapProfile(tokens, profileMap) };
      }

      const accessToken = tokens?.access_token;
      if (!accessToken) {
        throw new ProviderError(`${name} did not return an access token`);
      }

      const response = await requestJson(userInfoUrl, {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...userInfoHeaders,
          ...(config.userInfoHeaders ?? {}),
        },
      });

      if (!response.ok) {
        throw new ProviderError(errorMessage(response.body, `${name} profile fetch failed`), {
          status: response.status,
        });
      }

      return {
        raw: response.body,
        provider: id,
        ...mapProfile(response.body, profileMap),
      };
    },
  };
}

export const google = createProvider({
  id: "google",
  name: "Google",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "email", "profile"],
  extraAuthParams: { access_type: "offline", prompt: "consent" },
  profileMap: {
    id: "sub",
    email: "email",
    emailVerified: "email_verified",
    name: "name",
    firstName: "given_name",
    lastName: "family_name",
    avatar: "picture",
    locale: "locale",
  },
});

export const github = createProvider({
  id: "github",
  name: "GitHub",
  authorizationUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  userInfoUrl: "https://api.github.com/user",
  scopes: ["read:user", "user:email"],
  userInfoHeaders: { "user-agent": "@oneunit/auth" },
  async parseProfile(tokens) {
    const accessToken = tokens?.access_token;
    if (!accessToken) {
      throw new ProviderError("GitHub did not return an access token");
    }

    const headers = {
      authorization: `Bearer ${accessToken}`,
      "user-agent": "@oneunit/auth",
      accept: "application/vnd.github+json",
    };
    const userRes = await requestJson("https://api.github.com/user", { headers });
    if (!userRes.ok) {
      throw new ProviderError("GitHub profile fetch failed", { status: userRes.status });
    }

    const data = isRecord(userRes.body) ? userRes.body : {};
    let email = typeof data.email === "string" ? data.email : undefined;
    if (!email) {
      const emailsRes = await requestJson("https://api.github.com/user/emails", { headers });
      if (emailsRes.ok && Array.isArray(emailsRes.body)) {
        const emails = emailsRes.body as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
        const primary = emails.find((item) => item.primary && item.verified)
          ?? emails.find((item) => item.verified)
          ?? emails[0];
        email = primary?.email;
      }
    }

    return {
      provider: "github",
      id: data.id as string | number | undefined,
      username: data.login as string | undefined,
      name: data.name as string | undefined,
      email,
      avatar: data.avatar_url as string | undefined,
      profileUrl: data.html_url as string | undefined,
      raw: data,
    };
  },
});

export const instagram = createProvider({
  id: "instagram",
  name: "Instagram",
  authorizationUrl: "https://api.instagram.com/oauth/authorize",
  tokenUrl: "https://api.instagram.com/oauth/access_token",
  userInfoUrl: "https://graph.instagram.com/me?fields=id,username,account_type,name",
  scopes: ["user_profile"],
  profileMap: {
    id: "id",
    username: "username",
    name: "name",
    accountType: "account_type",
  },
});

export const facebook = createProvider({
  id: "facebook",
  name: "Facebook",
  authorizationUrl: "https://www.facebook.com/v21.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
  userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email,picture.type(large)",
  scopes: ["email", "public_profile"],
  profileMap: {
    id: "id",
    name: "name",
    email: "email",
    avatar: (data) => {
      const picture = data.picture;
      if (isRecord(picture) && isRecord(picture.data)) {
        return picture.data.url;
      }
      return undefined;
    },
  },
});

export const twitter = createProvider({
  id: "twitter",
  name: "X",
  authorizationUrl: "https://twitter.com/i/oauth2/authorize",
  tokenUrl: "https://api.twitter.com/2/oauth2/token",
  userInfoUrl: "https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username",
  scopes: ["tweet.read", "users.read", "offline.access"],
  pkce: true,
  tokenAuthMethod: "basic",
  extraAuthParams: { code_challenge_method: "S256" },
  profileMap: {
    id: "data.id",
    username: "data.username",
    name: "data.name",
    avatar: "data.profile_image_url",
  },
});

export const discord = createProvider({
  id: "discord",
  name: "Discord",
  authorizationUrl: "https://discord.com/oauth2/authorize",
  tokenUrl: "https://discord.com/api/oauth2/token",
  userInfoUrl: "https://discord.com/api/users/@me",
  scopes: ["identify", "email"],
  profileMap: {
    id: "id",
    username: "username",
    email: "email",
    emailVerified: "verified",
    avatar: (data) =>
      typeof data.avatar === "string"
        ? `https://cdn.discordapp.com/avatars/${String(data.id)}/${data.avatar}.png`
        : undefined,
    locale: "locale",
  },
});

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * Fetched signing keys, shared across providers and kept past a single request
 * so a burst of logins does not turn into a burst of JWKS traffic. An entry
 * whose kid is missing triggers a single refetch before failing, which is what
 * makes a routine Apple key rotation invisible to callers.
 */
const jwksCache = new Map<string, { set: Record<string, unknown>; expiresAt: number }>();

function clearJwksCache(url: string): void {
  jwksCache.delete(url);
}

async function loadJwks(url: string, ttlMs: number, refresh: boolean): Promise<Record<string, unknown>> {
  if (!refresh) {
    const cached = jwksCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.set;
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new ProviderError(`Could not fetch signing keys from ${url}: HTTP ${response.status}`);
  }
  const set = (await response.json()) as Record<string, unknown>;
  jwksCache.set(url, { set, expiresAt: Date.now() + ttlMs });
  return set;
}

async function resolveJwks(config: OAuthProviderConfig): Promise<Record<string, unknown>> {
  if (typeof config.jwks === "function") {
    return (await config.jwks()) as Record<string, unknown>;
  }
  if (config.jwks && typeof config.jwks === "object") {
    return config.jwks;
  }
  const url = typeof config.jwksUrl === "string" ? config.jwksUrl : APPLE_JWKS_URL;
  const ttl = typeof config.jwksCacheTtlMs === "number" ? config.jwksCacheTtlMs : DEFAULT_JWKS_TTL_MS;
  return loadJwks(url, ttl, false);
}

function findJwk(set: Record<string, unknown>, kid: string): Record<string, unknown> | undefined {
  const keys = set.keys;
  if (!Array.isArray(keys)) {
    return undefined;
  }
  return keys.find((entry): entry is Record<string, unknown> =>
    typeof entry === "object" && entry !== null && (entry as { kid?: unknown }).kid === kid);
}

/**
 * Verifies the RS256 signature over an id_token's header and payload against
 * the provider's published keys, and returns the decoded payload.
 *
 * The claims inside a token are unauthenticated until this runs. Checking `iss`
 * or `aud` on an unverified payload only proves the payload says what the
 * attacker wants it to say, so the signature has to be checked first and the
 * claim checks read the verified bytes.
 */
async function verifyIdToken(idToken: string, config: OAuthProviderConfig, providerName: string): Promise<Record<string, unknown>> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new ProviderError(`${providerName} id_token is not a well-formed JWT`);
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

  let header: { alg?: unknown; kid?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: unknown; kid?: unknown };
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ProviderError(`${providerName} id_token has undecodable segments`);
  }

  if (config.verifyIdTokenSignature === false) {
    return payload;
  }

  // Pinning the algorithm is what stops the classic JWT confusion attack: a
  // token declaring "alg": "none", or an HMAC algorithm keyed with the RSA
  // public key, would otherwise be accepted.
  if (header.alg !== "RS256") {
    throw new ProviderError(`${providerName} id_token must be signed with RS256, got ${String(header.alg)}`);
  }
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    throw new ProviderError(`${providerName} id_token is missing a kid`);
  }

  const ttl = typeof config.jwksCacheTtlMs === "number" ? config.jwksCacheTtlMs : DEFAULT_JWKS_TTL_MS;
  const url = typeof config.jwksUrl === "string" ? config.jwksUrl : APPLE_JWKS_URL;
  const usesCache = typeof config.jwks !== "function" && typeof config.jwks !== "object";

  let jwk = findJwk(await resolveJwks(config), header.kid);
  if (!jwk && usesCache) {
    // An unknown kid is either a rotation or an attack. Refetch once, since a
    // rotation is the common case and the attacker has to survive the retry.
    clearJwksCache(url);
    jwk = findJwk(await loadJwks(url, ttl, true), header.kid);
  }
  if (!jwk) {
    throw new ProviderError(`${providerName} id_token was signed by an unknown key (kid: ${header.kid})`);
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new ProviderError(`${providerName} id_token signing key could not be read`);
  }

  const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
  let signature: Buffer;
  try {
    signature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new ProviderError(`${providerName} id_token has an undecodable signature`);
  }
  if (signature.length === 0 || !verifySignature("RSA-SHA256", signed, publicKey, signature)) {
    throw new ProviderError(`${providerName} id_token signature is invalid`);
  }

  return payload;
}

export const apple = createProvider({
  id: "apple",
  name: "Apple",
  authorizationUrl: "https://appleid.apple.com/auth/authorize",
  tokenUrl: "https://appleid.apple.com/auth/token",
  scopes: ["name", "email"],
  extraAuthParams: { response_mode: "form_post" },
  async parseProfile(tokens, config) {
    const idToken = tokens?.id_token;
    if (!idToken) {
      return { provider: "apple", raw: tokens };
    }

    // Apple is the only built-in provider whose profile comes from a token in
    // the response rather than a server-side userinfo call, so the token is
    // verified here. See ARCHITECTURE.md for why the signature is checked even
    // though the token usually arrives over a server-side TLS exchange.
    const payload = await verifyIdToken(idToken, config, "Apple");

    const iss = typeof payload.iss === "string" ? payload.iss : undefined;
    if (iss !== APPLE_ISSUER) {
      throw new ProviderError(`Apple id_token has an unexpected issuer: ${String(iss)}`);
    }

    const aud = payload.aud;
    const clientId = config.clientId;
    if (clientId) {
      const matches = Array.isArray(aud) ? aud.includes(clientId) : aud === clientId;
      if (!matches) {
        throw new ProviderError("Apple id_token audience does not match the configured clientId");
      }
    }

    // Required rather than checked when present. A token with no usable exp
    // would otherwise be treated as never expiring, which turns a leaked token
    // into permanent access.
    const exp = payload.exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) {
      throw new ProviderError("Apple id_token is missing a numeric exp claim");
    }
    if (exp <= Math.floor(Date.now() / 1000)) {
      throw new ProviderError("Apple id_token has expired");
    }

    // Apple only returns these on the first authorization for an account, so
    // callers must not depend on them being present.
    return {
      provider: "apple",
      id: payload.sub as string | undefined,
      email: payload.email as string | undefined,
      emailVerified: payload.email_verified === "true" || payload.email_verified === true,
      raw: { tokens, claims: payload },
    };
  },
});

export const linkedin = createProvider({
  id: "linkedin",
  name: "LinkedIn",
  authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
  tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
  userInfoUrl: "https://api.linkedin.com/v2/userinfo",
  scopes: ["openid", "profile", "email"],
  profileMap: {
    id: "sub",
    name: "name",
    email: "email",
    emailVerified: "email_verified",
    avatar: "picture",
    locale: "locale",
  },
});

export const microsoft = createProvider({
  id: "microsoft",
  name: "Microsoft",
  authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
  scopes: ["openid", "profile", "email", "offline_access"],
  profileMap: {
    id: "sub",
    email: "email",
    name: "name",
    firstName: "given_name",
    lastName: "family_name",
    avatar: "picture",
  },
});

export const reddit = createProvider({
  id: "reddit",
  name: "Reddit",
  authorizationUrl: "https://www.reddit.com/api/v1/authorize",
  tokenUrl: "https://www.reddit.com/api/v1/access_token",
  userInfoUrl: "https://oauth.reddit.com/api/v1/me",
  scopes: ["identity"],
  tokenAuthMethod: "basic",
  extraAuthParams: { duration: "permanent" },
  userInfoHeaders: { "user-agent": "@oneunit/auth" },
  profileMap: {
    id: "id",
    username: "name",
    avatar: "icon_img",
  },
});

export const twitch = createProvider({
  id: "twitch",
  name: "Twitch",
  authorizationUrl: "https://id.twitch.tv/oauth2/authorize",
  tokenUrl: "https://id.twitch.tv/oauth2/token",
  userInfoUrl: "https://api.twitch.tv/helix/users",
  scopes: ["user:read:email"],
  profileMap: {
    id: "data.0.id",
    username: "data.0.login",
    name: "data.0.display_name",
    email: "data.0.email",
    avatar: "data.0.profile_image_url",
  },
});

export const slack = createProvider({
  id: "slack",
  name: "Slack",
  authorizationUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  userInfoUrl: "https://slack.com/api/users.identity",
  scopes: ["identity.basic", "identity.email", "identity.avatar"],
  profileMap: {
    id: "user.id",
    name: "user.name",
    email: "user.email",
    avatar: "user.image_512",
  },
});

export const spotify = createProvider({
  id: "spotify",
  name: "Spotify",
  authorizationUrl: "https://accounts.spotify.com/authorize",
  tokenUrl: "https://accounts.spotify.com/api/token",
  userInfoUrl: "https://api.spotify.com/v1/me",
  scopes: ["user-read-email", "user-read-private"],
  tokenAuthMethod: "basic",
  profileMap: {
    id: "id",
    email: "email",
    name: "display_name",
    avatar: (data) => {
      const images = data.images;
      if (Array.isArray(images) && isRecord(images[0])) {
        return images[0].url;
      }
      return undefined;
    },
    profileUrl: "external_urls.spotify",
  },
});

export const tiktok = createProvider({
  id: "tiktok",
  name: "TikTok",
  authorizationUrl: "https://www.tiktok.com/v2/auth/authorize/",
  tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
  userInfoUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
  scopes: ["user.info.basic"],
  extraAuthParams: { response_type: "code" },
  profileMap: {
    id: "data.user.open_id",
    name: "data.user.display_name",
    avatar: "data.user.avatar_url",
  },
});

export const builtinProviders = Object.freeze({
  google,
  github,
  instagram,
  facebook,
  twitter,
  x: twitter,
  discord,
  apple,
  linkedin,
  microsoft,
  reddit,
  twitch,
  slack,
  spotify,
  tiktok,
}) satisfies Record<string, OAuthProvider>;

export function getProvider(id: string): OAuthProvider {
  const provider = builtinProviders[String(id).toLowerCase() as keyof typeof builtinProviders];
  if (!provider) {
    throw new ValidationError(`Unknown OAuth provider: ${id}`);
  }
  return provider;
}
