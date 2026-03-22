import type { FastifyInstance } from "fastify";

import { dayOfWeekSchema } from "@codex/shared";

import type { AppConfig } from "../config.js";
import { assertTrustedBrowserOrigin } from "../lib/trusted-origin.js";
import {
  getAuthenticatedUser,
  resolveViewerAccess
} from "../services/auth.js";
import {
  listDayTemplateState,
  listHevyRoutineOptions,
  updateDayTemplate
} from "../services/day-templates.js";

type DayTemplateRouteDependencies = {
  getAuthenticatedUser: typeof getAuthenticatedUser;
  listDayTemplateState: typeof listDayTemplateState;
  listHevyRoutineOptions: typeof listHevyRoutineOptions;
  resolveViewerAccess: typeof resolveViewerAccess;
  updateDayTemplate: typeof updateDayTemplate;
};

const defaultDependencies: DayTemplateRouteDependencies = {
  getAuthenticatedUser,
  listDayTemplateState,
  listHevyRoutineOptions,
  resolveViewerAccess,
  updateDayTemplate
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
    const error = new Error("Only the primary user can update day templates.");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected ${fieldName} to be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function registerDayTemplateRoutes(
  app: FastifyInstance,
  config: Pick<AppConfig, "WEB_BASE_URL">,
  dependencies: DayTemplateRouteDependencies = defaultDependencies
) {
  app.get("/day-templates", async (request, reply) => {
    try {
      const viewer = await dependencies.getAuthenticatedUser(request);
      if (!viewer) {
        return reply.code(401).send({
          ok: false,
          error: "Authentication required."
        });
      }

      const access = await dependencies.resolveViewerAccess(viewer);
      if (!access.categories.has("exercise")) {
        return reply.code(403).send({
          ok: false,
          error: "Exercise access is required."
        });
      }

      return {
        ok: true,
        templates: await dependencies.listDayTemplateState(),
        hevyRoutines: await dependencies.listHevyRoutineOptions()
      };
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  app.post<{
    Body: {
      dayOfWeek?: string;
      activityType?: string;
      intensity?: string | null;
      preferredTime?: string | null;
      notes?: string | null;
      hevyRoutineId?: string | null;
      hevyRoutineTitle?: string | null;
    };
  }>("/day-templates", async (request, reply) => {
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

      const result = await dependencies.updateDayTemplate({
        dayOfWeek: dayOfWeekSchema.parse(request.body?.dayOfWeek),
        activityType: requireString(request.body?.activityType, "activityType"),
        intensity: optionalString(request.body?.intensity),
        preferredTime: optionalString(request.body?.preferredTime),
        notes: optionalString(request.body?.notes),
        hevyRoutineId: optionalString(request.body?.hevyRoutineId),
        hevyRoutineTitle: optionalString(request.body?.hevyRoutineTitle)
      });

      return {
        ok: true,
        changed: result.changed,
        message: result.responseText,
        templates: result.templates,
        hevyRoutines: await dependencies.listHevyRoutineOptions()
      };
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });
}
