import type { AppConfig } from "../config.js";
import type { FastifyInstance } from "fastify";

import { getAuthenticatedUser } from "../services/auth.js";
import { buildOperatorStatus } from "../services/operations.js";

type OpsRouteDependencies = {
  buildOperatorStatus: typeof buildOperatorStatus;
  getAuthenticatedUser: typeof getAuthenticatedUser;
};

const defaultDependencies: OpsRouteDependencies = {
  buildOperatorStatus,
  getAuthenticatedUser
};

export async function registerOpsRoutes(
  app: FastifyInstance,
  config: AppConfig,
  dependencies: OpsRouteDependencies = defaultDependencies
) {
  app.get("/ops/status", async (request, reply) => {
    const viewer = await dependencies.getAuthenticatedUser(request);
    if (!viewer) {
      return reply.code(401).send({
        ok: false,
        error: "Authentication required."
      });
    }

    if (viewer.role !== "user") {
      return reply.code(403).send({
        ok: false,
        error: "Operator status is only available to the primary user."
      });
    }

    const status = await dependencies.buildOperatorStatus(config);
    return {
      ok: true,
      status
    };
  });
}
