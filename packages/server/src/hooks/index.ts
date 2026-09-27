import type {
  FastifyInstance,
  onCloseHookHandler,
  onErrorHookHandler,
  onListenHookHandler,
  onReadyHookHandler,
  onRegisterHookHandler,
  onRequestAbortHookHandler,
  onRequestHookHandler,
  onResponseHookHandler,
  onRouteHookHandler,
  onSendHookHandler,
  onTimeoutHookHandler,
  preHandlerHookHandler,
  preParsingHookHandler,
  preSerializationHookHandler,
  preValidationHookHandler,
} from "fastify";

export type HookList<T> = T | T[];

export interface BootstrapHooks {
  onRequest?: HookList<onRequestHookHandler>;
  preParsing?: HookList<preParsingHookHandler>;
  preValidation?: HookList<preValidationHookHandler>;
  preHandler?: HookList<preHandlerHookHandler>;
  preSerialization?: HookList<preSerializationHookHandler>;
  onSend?: HookList<onSendHookHandler>;
  onResponse?: HookList<onResponseHookHandler>;
  onError?: HookList<onErrorHookHandler>;
  onTimeout?: HookList<onTimeoutHookHandler>;
  onRequestAbort?: HookList<onRequestAbortHookHandler>;
  onReady?: HookList<onReadyHookHandler>;
  onListen?: HookList<onListenHookHandler>;
  onClose?: HookList<onCloseHookHandler>;
  onRoute?: HookList<onRouteHookHandler>;
  onRegister?: HookList<onRegisterHookHandler>;
}

function asArray<T>(value: HookList<T> | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function registerHooks(
  server: FastifyInstance,
  hooks: BootstrapHooks = {},
): void {
  for (const handler of asArray(hooks.onRequest)) {
    server.addHook("onRequest", handler);
  }
  for (const handler of asArray(hooks.preParsing)) {
    server.addHook("preParsing", handler);
  }
  for (const handler of asArray(hooks.preValidation)) {
    server.addHook("preValidation", handler);
  }
  for (const handler of asArray(hooks.preHandler)) {
    server.addHook("preHandler", handler);
  }
  for (const handler of asArray(hooks.preSerialization)) {
    server.addHook("preSerialization", handler);
  }
  for (const handler of asArray(hooks.onSend)) {
    server.addHook("onSend", handler);
  }
  for (const handler of asArray(hooks.onResponse)) {
    server.addHook("onResponse", handler);
  }
  for (const handler of asArray(hooks.onError)) {
    server.addHook("onError", handler);
  }
  for (const handler of asArray(hooks.onTimeout)) {
    server.addHook("onTimeout", handler);
  }
  for (const handler of asArray(hooks.onRequestAbort)) {
    server.addHook("onRequestAbort", handler);
  }
  for (const handler of asArray(hooks.onReady)) {
    server.addHook("onReady", handler);
  }
  for (const handler of asArray(hooks.onListen)) {
    server.addHook("onListen", handler);
  }
  for (const handler of asArray(hooks.onClose)) {
    server.addHook("onClose", handler);
  }
  for (const handler of asArray(hooks.onRoute)) {
    server.addHook("onRoute", handler);
  }
  for (const handler of asArray(hooks.onRegister)) {
    server.addHook("onRegister", handler);
  }
}
