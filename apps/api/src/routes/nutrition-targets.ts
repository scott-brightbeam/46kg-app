import type { FastifyInstance } from "fastify";

import { assertTrustedBrowserOrigin } from "../lib/trusted-origin.js";
import { getAuthenticatedUser, resolveViewerAccess } from "../services/auth.js";
import {
  getNutritionTargetState,
  updateNutritionTargets
} from "../services/nutrition-targets.js";
import type { AppConfig } from "../config.js";

type NutritionTargetRouteDependencies = {
  getAuthenticatedUser: typeof getAuthenticatedUser;
  getNutritionTargetState: typeof getNutritionTargetState;
  resolveViewerAccess: typeof resolveViewerAccess;
  updateNutritionTargets: typeof updateNutritionTargets;
};

const defaultDependencies: NutritionTargetRouteDependencies = {
  getAuthenticatedUser,
  getNutritionTargetState,
  resolveViewerAccess,
  updateNutritionTargets
};

function handleRouteError(error: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }) {
  const message = error instanceof Error ? error.message : "Invalid request";
  const statusCode =
    error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 400;

  return reply.code(statusCode).send({
    ok: false,
    error: message
  });
}

function ensurePrimaryUser(role: unknown) {
  if (role !== "user") {
    const error = new Error("Only the primary user can update nutrition targets.");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

function optionalNumber(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Expected nutrition targets to be positive numbers.");
  }

  return value;
}

function optionalString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function registerNutritionTargetRoutes(
  app: FastifyInstance,
  config: AppConfig,
  dependencies: NutritionTargetRouteDependencies = defaultDependencies
) {
  app.get("/nutrition-targets", async (request, reply) => {
    try {
      const viewer = await dependencies.getAuthenticatedUser(request);
      if (!viewer) {
        return reply.code(401).send({
          ok: false,
          error: "Authentication required."
        });
      }

      const access = await dependencies.resolveViewerAccess(viewer);
      if (!access.categories.has("nutrition")) {
        return reply.code(403).send({
          ok: false,
          error: "Nutrition access is required."
        });
      }

      return {
        ok: true,
        ...(await dependencies.getNutritionTargetState(config))
      };
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  app.post<{
    Body: {
      calories?: number | null;
      protein?: number | null;
      fibre?: number | null;
      notes?: string | null;
    };
  }>("/nutrition-targets", async (request, reply) => {
    try {
      assertTrustedBrowserOrigin(request, config);
      const viewer = await dependencies.getAuthenticatedUser(request);
      if (!viewer) {
        return reply.code(401).send({
          ok: false,
          error: "Authentication required."
        });
      }

      ensurePrimaryUser(viewer.role);

      const result = await dependencies.updateNutritionTargets(config, {
        calories: optionalNumber(request.body?.calories),
        protein: optionalNumber(request.body?.protein),
        fibre: optionalNumber(request.body?.fibre),
        notes: optionalString(request.body?.notes)
      });

      return {
        ok: true,
        message: result.responseText,
        targets: result.targets,
        source: result.source,
        notes: result.notes,
        updatedAt: result.updatedAt
      };
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });
}
