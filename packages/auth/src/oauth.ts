import { OAuthError, ValidationError } from "./errors.js";
import { builtinProviders, createProvider, getProvider, pkceVerifier } from "./providers.js";
import type {
  OAuthAuthorizeOptions,
  OAuthOptions,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderConfig,
  OAuthStateRecord,
  OAuthTokens,
  StateStore,
} from "./types.js";
import { randomState, timingSafeEqualString } from "./utils.js";

interface ProviderEntry {
  provider: OAuthProvider;
  config: OAuthProviderConfig;
}

export class OAuth {
  providers = new Map<string, ProviderEntry>();
  defaultRedirectUri: string | null;
  stateStore: StateStore;

  constructor(options: OAuthOptions = {}) {
    this.defaultRedirectUri = options.redirectUri ?? null;
    this.stateStore = options.stateStore ?? createMemoryStateStore();

    const configured = options.providers ?? {};
    for (const [id, config] of Object.entries(configured)) {
      this.use(id, config);
    }
  }

  use(id: string, config: OAuthProviderConfig = {}): this {
    const provider: OAuthProvider = (config.provider as OAuthProvider | undefined) ??
      (id in builtinProviders
        ? getProvider(id)
        : createProvider({
          id,
          authorizationUrl: String(config.authorizationUrl ?? ""),
          tokenUrl: String(config.tokenUrl ?? ""),
          ...config,
        }));

    const entry: ProviderEntry = {
      provider,
      config: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri ?? this.defaultRedirectUri ?? undefined,
        scopes: config.scopes,
        pkce: config.pkce,
        extraAuthParams: config.extraAuthParams,
        extraTokenParams: config.extraTokenParams,
        userInfoHeaders: config.userInfoHeaders,
        tokenAuthMethod: config.tokenAuthMethod,
      },
    };

    this.providers.set(id, entry);
    if (provider.id && provider.id !== id) {
      this.providers.set(provider.id, entry);
    }

    return this;
  }

  list(): string[] {
    return [...new Set([...this.providers.values()].map((entry) => entry.provider.id))];
  }

  get(id: string): ProviderEntry {
    const entry = this.providers.get(id);
    if (!entry) {
      throw new ValidationError(`OAuth provider "${id}" is not configured`);
    }
    return entry;
  }

  async authorize(id: string, options: OAuthAuthorizeOptions = {}): Promise<{
    url: string;
    state: string;
    provider: string;
    codeVerifier?: string;
  }> {
    const { provider, config } = this.get(id);
    const state = options.state ?? randomState();
    const redirectUri = options.redirectUri ?? config.redirectUri;
    const codeVerifier = provider.pkce || config.pkce ? (options.codeVerifier ?? pkceVerifier()) : undefined;

    const authorization = provider.createAuthorizationUrl(config, {
      state,
      redirectUri,
      codeVerifier,
      extraParams: options.extraParams,
    });

    await this.stateStore.set(state, {
      provider: id,
      redirectUri,
      codeVerifier: authorization.codeVerifier ?? codeVerifier,
      createdAt: Date.now(),
      metadata: options.metadata ?? {},
    } satisfies OAuthStateRecord, options.ttlSeconds ?? 600);

    return {
      url: authorization.url,
      state,
      provider: id,
      codeVerifier: authorization.codeVerifier ?? codeVerifier,
    };
  }

  async callback(id: string, params: string | Record<string, string> = {}): Promise<{
    provider: string;
    tokens: OAuthTokens;
    profile: OAuthProfile;
    state: OAuthStateRecord | null;
  }> {
    const query = normalizeCallbackParams(params);
    if (query.error) {
      throw new OAuthError(query.error_description || query.error);
    }

    if (!query.code) {
      throw new ValidationError("OAuth callback is missing authorization code");
    }

    const { provider, config } = this.get(id);
    let stored: OAuthStateRecord | null = null;

    if (query.state) {
      stored = (await this.stateStore.get(query.state)) as OAuthStateRecord | null;
      if (!stored) {
        throw new OAuthError("Invalid or expired OAuth state");
      }
      if (stored.provider && stored.provider !== id) {
        throw new OAuthError("OAuth provider mismatch");
      }
      await this.stateStore.delete(query.state);
    } else if (config.pkce || provider.pkce) {
      throw new OAuthError("OAuth state is required");
    }

    const tokens = await provider.exchangeCode(config, {
      code: query.code,
      redirectUri: stored?.redirectUri ?? config.redirectUri,
      codeVerifier: stored?.codeVerifier ?? query.codeVerifier,
    });

    const profile = await provider.fetchProfile(config, tokens);

    return {
      provider: id,
      tokens,
      profile: {
        ...profile,
        provider: profile.provider ?? id,
      },
      state: stored,
    };
  }

  async verifyState(state: string, expected?: string): Promise<boolean> {
    const stored = await this.stateStore.get(state) as OAuthStateRecord | null;
    if (!stored) {
      return false;
    }
    if (expected && !timingSafeEqualString(stored.provider, expected)) {
      return false;
    }
    return true;
  }
}

function normalizeCallbackParams(params: string | Record<string, string>): Record<string, string> {
  if (typeof params === "string") {
    const url = params.includes("://") ? new URL(params) : new URL(params, "http://localhost");
    return Object.fromEntries(url.searchParams.entries());
  }
  return params ?? {};
}

export function createMemoryStateStore(): StateStore {
  const store = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async set(key, value, ttlSeconds = 600) {
      store.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

export function createOAuth(options: OAuthOptions = {}): OAuth {
  return new OAuth(options);
}
