import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { createHealthResponse } from "../config/system-status.js";
import { getSystemInfo } from "../lib/system.js";
import type { HealthChecks } from "../lib/system-status.js";

export const healthResponse = createHealthResponse("app", {
  system: getSystemInfo(),
  checks: {},
});

export interface HealthRouteOptions {
  path?: string;
  serviceName?: string;
  checks?: HealthChecks | HealthCheckProvider;
}

export type HealthCheckProvider = (server: FastifyInstance) => HealthChecks | Promise<HealthChecks>;

export type BootstrapHealthOptions = HealthRouteOptions;

export function createHealthPlugin(options: HealthRouteOptions = {}): FastifyPluginAsync {
  const {
    path = "/health",
    serviceName = "app",
    checks = {},
  } = options;

  return async (server) => {
    server.get(path, async (_request, reply) => {
      const resolvedChecks = typeof checks === "function"
        ? await checks(server)
        : checks;
      const response = createHealthResponse(serviceName, {
        system: getSystemInfo(),
        checks: resolvedChecks,
      });
      const hasFailedCheck = Object.values(resolvedChecks).some((check) => !check.status);
      if (hasFailedCheck) {
        reply.code(503);
      }
      return response;
    });
  };
}