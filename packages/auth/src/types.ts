export interface AuthErrorOptions {
  code?: string;
  status?: number;
  cause?: unknown;
}

export interface JwtSignOptions {
  expiresIn?: string | number;
  expiresInSeconds?: number;
  subject?: string | number;
  audience?: string | string[];
  issuer?: string;
  jwtid?: string;
  notBefore?: string | number;
  header?: Record<string, unknown>;
  algorithm?: string;
  keyid?: string;
}

export interface JwtVerifyOptions {
  algorithms?: string[];
  audience?: string | string[];
  issuer?: string;
  subject?: string;
  clockTolerance?: number;
  ignoreExpiration?: boolean;
  complete?: boolean;
}

export type JwtPayload = Record<string, unknown> & {
  sub?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  aud?: string | string[];
  iss?: string;
  jti?: string;
  typ?: string;
  userId?: string | number;
  email?: string;
  username?: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
};

export type Secret = string | Buffer;

export interface RoleDefinition {
  name?: string;
  description?: string;
  permissions?: string | string[];
  perms?: string | string[];
  inherits?: string | string[];
  parents?: string | string[];
  parent?: string | string[];
}

export interface StoredRole {
  name: string;
  description: string;
}

export interface RBACOptions {
  defaultRole?: string | null;
  permissions?: string[];
  roles?: Record<string, RoleDefinition> | Array<string | RoleDefinition>;
}

export interface AuthSubject {
  id?: string | number;
  role?: string;
  roles?: string | string[];
  permissions?: string | string[];
  [key: string]: unknown;
}

export interface PasswordOptions {
  saltBytes?: number;
  keyLength?: number;
  cost?: number;
  blockSize?: number;
  parallelism?: number;
  salt?: string | Buffer;
}

export interface OAuthProfile {
  provider?: string;
  id?: string | number;
  email?: string;
  emailVerified?: boolean;
  username?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  profileUrl?: string;
  locale?: string;
  raw?: unknown;
  [key: string]: unknown;
}

export interface OAuthTokens {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
}

export type TokenAuthMethod = "body" | "basic";

export interface OAuthProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  pkce?: boolean;
  extraAuthParams?: Record<string, unknown>;
  extraTokenParams?: Record<string, unknown>;
  userInfoHeaders?: Record<string, string>;
  tokenAuthMethod?: TokenAuthMethod;
  provider?: OAuthProvider | (Pick<OAuthProvider, "id"> & Partial<OAuthProvider>);
  [key: string]: unknown;
}

export interface AuthorizationUrlOptions {
  state?: string;
  redirectUri?: string;
  codeVerifier?: string;
  extraParams?: Record<string, unknown>;
}

export interface AuthorizationUrlResult {
  url: string;
  state?: string;
  codeVerifier?: string;
}

export interface ExchangeCodeOptions {
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scopes: string[];
  pkce: boolean;
  tokenAuthMethod: string;
  createAuthorizationUrl(config: OAuthProviderConfig, options?: AuthorizationUrlOptions): AuthorizationUrlResult;
  exchangeCode(config: OAuthProviderConfig, options?: ExchangeCodeOptions): Promise<OAuthTokens>;
  fetchProfile(config: OAuthProviderConfig, tokens: OAuthTokens): Promise<OAuthProfile>;
}

export type ProfileMapValue = string | ((source: Record<string, unknown>) => unknown);

export interface ProviderDefinition {
  id: string;
  name?: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scopes?: string[];
  profileMap?: Record<string, ProfileMapValue>;
  tokenAuthMethod?: TokenAuthMethod;
  pkce?: boolean;
  extraAuthParams?: Record<string, unknown>;
  extraTokenParams?: Record<string, unknown>;
  userInfoHeaders?: Record<string, string>;
  parseProfile?: (tokens: OAuthTokens, config: OAuthProviderConfig) => OAuthProfile | Promise<OAuthProfile>;
}

export interface StateStore {
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void> | void;
  get(key: string): Promise<unknown> | unknown;
  delete(key: string): Promise<void> | void;
}

export interface OAuthOptions {
  redirectUri?: string;
  stateStore?: StateStore;
  providers?: Record<string, OAuthProviderConfig>;
}

export interface OAuthAuthorizeOptions {
  state?: string;
  redirectUri?: string;
  codeVerifier?: string;
  extraParams?: Record<string, unknown>;
  metadata?: unknown;
  ttlSeconds?: number;
}

export interface OAuthStateRecord {
  provider: string;
  redirectUri?: string;
  codeVerifier?: string;
  createdAt: number;
  metadata?: unknown;
}

export interface UserRecord {
  id: string | number;
  email?: string;
  username?: string;
  name?: string;
  avatar?: string;
  roles?: string[];
  role?: string;
  permissions?: string[];
  passwordHash?: string;
  provider?: string;
  providerId?: string | number;
  [key: string]: unknown;
}

export interface UserStore {
  findById?(id: string | number): Promise<UserRecord | null | undefined> | UserRecord | null | undefined;
  findByEmail?(email: string): Promise<UserRecord | null | undefined> | UserRecord | null | undefined;
  findByUsername?(username: string): Promise<UserRecord | null | undefined> | UserRecord | null | undefined;
  findByCredentials?(identifier: string): Promise<UserRecord | null | undefined> | UserRecord | null | undefined;
  findByProvider?(
    provider: string,
    providerId: string | number,
  ): Promise<UserRecord | null | undefined> | UserRecord | null | undefined;
  create?(input: Record<string, unknown>): Promise<UserRecord> | UserRecord;
  createFromProvider?(
    provider: string,
    profile: OAuthProfile,
    tokens: OAuthTokens,
  ): Promise<UserRecord> | UserRecord;
  linkProvider?(userId: string | number, provider: string, profile: OAuthProfile): Promise<unknown> | unknown;
  updatePassword?(userId: string | number, passwordHash: string): Promise<unknown> | unknown;
}

export interface RefreshRecord {
  id: string;
  userId: string | number;
  tokenHash: string;
  expiresAt: number;
}

export interface RefreshStore {
  save(record: RefreshRecord): Promise<void> | void;
  get(id: string): Promise<RefreshRecord | null | undefined> | RefreshRecord | null | undefined;
  revoke?(id: string): Promise<void> | void;
}

export interface LoginOptions {
  extractors?: string[];
  additionalClaims?: Record<string, unknown>;
  accessTokenTtl?: string | number;
  refreshTokenTtl?: string | number;
  refresh?: boolean;
  roles?: string[];
}

export interface LoginResult {
  token: string;
  accessToken: string;
  refreshToken: string | null;
  payload: JwtPayload;
  user: {
    id: string | number;
    email?: string;
    username?: string;
    name?: string;
    roles: string[];
    permissions: string[];
  };
  oauth?: {
    provider: string;
    tokens: OAuthTokens;
    profile: OAuthProfile;
    state: unknown;
  };
}

export interface AuthOptions {
  secret: Secret;
  refreshSecret?: Secret;
  issuer?: string;
  audience?: string | string[];
  algorithm?: string;
  expiresIn?: string | number;
  accessTokenTtl?: string | number;
  refreshTokenTtl?: string | number;
  clockTolerance?: number;
  userStore?: UserStore;
  refreshStore?: RefreshStore;
  rbac?: import("./rbac.js").RBAC | RBACOptions;
  roles?: RBACOptions | Record<string, RoleDefinition> | Array<string | RoleDefinition>;
  oauth?: import("./oauth.js").OAuth | OAuthOptions;
  providers?: Record<string, OAuthProviderConfig>;
  redirectUri?: string;
  onLogin?: (result: LoginResult) => unknown;
  onLink?: (event: { user: UserRecord; provider: string; profile: OAuthProfile }) => unknown;
}

export type AuthHookName = "beforeLogin" | "afterLogin" | "afterVerify";
export type AuthHookHandler = (payload: unknown, auth: unknown) => unknown;

export interface RequestLike {
  headers?: Record<string, string | string[] | undefined> | { get?(name: string): string | null };
  cookies?: Record<string, string>;
  query?: string | Record<string, string | string[] | undefined>;
  getHeader?(name: string): string;
  getQuery?(): string;
  forEach?(cb: (key: string, value: string) => void): void;
  [key: string]: unknown;
}

export interface ExtractTokenOptions {
  cookie?: string;
  optional?: boolean;
  passthrough?: boolean;
  audience?: string | string[];
  issuer?: string;
  clockTolerance?: number;
}

export interface UwsHttpResponse {
  cork?(cb: () => void): void;
  writeStatus?(status: string): this | void;
  writeHeader?(key: string, value: string): this | void;
  end?(body?: string | ArrayBuffer | Uint8Array): void;
  onAborted?(cb: () => void): void;
  [key: string]: unknown;
}

export interface UwsHttpRequest {
  getHeader?(name: string): string;
  getMethod?(): string;
  getUrl?(): string;
  getQuery?(): string;
  forEach?(cb: (key: string, value: string) => void): void;
  [key: string]: unknown;
}

export interface UwsRequestSnapshot {
  method?: string;
  url?: string;
  query?: string | Record<string, string>;
  headers: Record<string, string>;
  cookies?: Record<string, string>;
  res?: UwsHttpResponse;
  user?: JwtPayload | null;
  token?: string | null;
}

export type UwsHandler = (
  res: UwsHttpResponse,
  req: UwsHttpRequest,
  request?: UwsRequestSnapshot,
) => unknown;

export interface ExpressRequestLike {
  auth?: unknown;
  user?: JwtPayload | null;
  token?: string | null;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  query?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export interface ExpressResponseLike {
  status?(code: number): ExpressResponseLike;
  send?(body: unknown): unknown;
  code?(code: number): ExpressResponseLike;
  body?: unknown;
  [key: string]: unknown;
}

export type ExpressNext = (error?: unknown) => void;

export type ExpressHandler = (
  req: ExpressRequestLike,
  res: ExpressResponseLike,
  next?: ExpressNext,
) => unknown;

export interface KoaContextLike {
  request?: RequestLike;
  state: { user?: JwtPayload | null; token?: string | null; [key: string]: unknown };
  status: number;
  body: unknown;
}

export interface FastifyLike {
  decorate(name: string, value: unknown): void;
  decorateRequest(name: string, value: unknown): void;
  [key: string]: unknown;
}

export interface FastifyRequestLike {
  user?: JwtPayload | null;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  query?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export interface FastifyReplyLike {
  code(status: number): FastifyReplyLike;
  send(body: unknown): unknown;
}
