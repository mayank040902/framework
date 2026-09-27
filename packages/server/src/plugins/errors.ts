import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface ErrorHandlerPluginOptions {
  includeStack?: boolean;
  logErrors?: boolean;
  customHandler?: (error: unknown, request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

async function errorHandlerPlugin(
  server: FastifyInstance,
  options: ErrorHandlerPluginOptions = {},
): Promise<void> {
  const { includeStack = false, logErrors = true, customHandler } = options;

  try {
    const errorsModule = await import("@bootstrap-framework/errors/fastify") as {
      createErrorHandler: (options: ErrorHandlerPluginOptions) => (
        error: unknown,
        request: FastifyRequest,
        reply: FastifyReply,
      ) => Promise<void>;
    };
    server.setErrorHandler(errorsModule.createErrorHandler({
      includeStack,
      logErrors,
      customHandler,
    }));
  } catch (err) {
    server.log.warn({ err }, "errors package not installed, using default Fastify error handler");
  }
}

export default errorHandlerPlugin;
export { errorHandlerPlugin };
