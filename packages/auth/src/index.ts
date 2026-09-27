export {
  AuthError,
  InvalidTokenError,
  TokenExpiredError,
  UnauthorizedError,
  ForbiddenError,
  ConfigurationError,
  OAuthError,
  ProviderError,
  ValidationError,
} from "./errors.js";

export {
  encode,
  decode,
  decodeUnsafe,
  encodeAccessToken,
  encodeRefreshToken,
} from "./jwt.js";

export {
  RBAC,
  createRBAC,
  defineRoles,
  matchPermission,
} from "./rbac.js";

export {
  hashPassword,
  verifyPassword,
  needsRehash,
} from "./password.js";

export {
  OAuth,
  createOAuth,
  createMemoryStateStore,
} from "./oauth.js";

export {
  createProvider,
  getProvider,
  builtinProviders,
  google,
  github,
  instagram,
  facebook,
  twitter,
  discord,
  apple,
  linkedin,
  microsoft,
  reddit,
  twitch,
  slack,
  spotify,
  tiktok,
} from "./providers.js";

export {
  Auth,
  auth,
  createAuth,
  createMemoryRefreshStore,
} from "./auth.js";

export {
  expressAdapter,
  fastifyAdapter,
  koaAdapter,
  uwsAdapter,
  snapshotUwsRequest,
  createAdapters,
} from "./adapters.js";

export {
  parseExpiresIn,
  randomToken,
  randomState,
  extractBearerToken,
} from "./utils.js";

export type {
  AuthErrorOptions,
  JwtSignOptions,
  JwtVerifyOptions,
  JwtPayload,
  Secret,
  RoleDefinition,
  RBACOptions,
  AuthSubject,
  PasswordOptions,
  OAuthProfile,
  OAuthTokens,
  OAuthProviderConfig,
  OAuthProvider,
  ProviderDefinition,
  StateStore,
  OAuthOptions,
  OAuthAuthorizeOptions,
  UserRecord,
  UserStore,
  RefreshRecord,
  RefreshStore,
  LoginOptions,
  LoginResult,
  AuthOptions,
  RequestLike,
  ExtractTokenOptions,
  UwsHttpResponse,
  UwsHttpRequest,
  UwsRequestSnapshot,
  UwsHandler,
  ExpressRequestLike,
  ExpressResponseLike,
  ExpressNext,
  KoaContextLike,
  FastifyLike,
  FastifyRequestLike,
  FastifyReplyLike,
} from "./types.js";
