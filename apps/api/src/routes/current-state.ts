import type { FastifyInstance } from "fastify";

import {
  getAuthenticatedUser,
  logScopedAccess,
  resolveViewerAccess,
  sanitizeDailySummaryForCategories,
  sanitizeWeeklySummaryForCategories
} from "../services/auth.js";
import { getDailySummary, getWeeklySummary } from "../services/current-state.js";
import {
  buildDailyNutritionBudget,
  getNutritionTargetState
} from "../services/nutrition-targets.js";
import type { AppConfig } from "../config.js";

function requireDate(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Expected ${fieldName} in YYYY-MM-DD format.`);
  }

  return value;
}

function optionalTimeZone(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type CurrentStateRouteDependencies = {
  buildDailyNutritionBudget: typeof buildDailyNutritionBudget;
  getAuthenticatedUser: typeof getAuthenticatedUser;
  getDailySummary: typeof getDailySummary;
  getNutritionTargetState: typeof getNutritionTargetState;
  getWeeklySummary: typeof getWeeklySummary;
  logScopedAccess: typeof logScopedAccess;
  resolveViewerAccess: typeof resolveViewerAccess;
};

const defaultDependencies: CurrentStateRouteDependencies = {
  buildDailyNutritionBudget,
  getAuthenticatedUser,
  getDailySummary,
  getNutritionTargetState,
  getWeeklySummary,
  logScopedAccess,
  resolveViewerAccess
};

export async function registerCurrentStateRoutes(
  app: FastifyInstance,
  config: AppConfig,
  dependencies: CurrentStateRouteDependencies = defaultDependencies
) {
  app.get<{ Querystring: { date?: string; timeZone?: string } }>(
    "/state/daily",
    async (request, reply) => {
      try {
        const viewer = await dependencies.getAuthenticatedUser(request);
        if (!viewer) {
          return reply.code(401).send({
            ok: false,
            error: "Authentication required."
          });
        }

        const access = await dependencies.resolveViewerAccess(viewer);
        const summary = await dependencies.getDailySummary({
          date: requireDate(request.query.date, "date"),
          timeZone: optionalTimeZone(request.query.timeZone)
        });
        const scopedSummary = sanitizeDailySummaryForCategories(summary, access.categories);
        const nutritionState = access.categories.has("nutrition")
          ? await dependencies.getNutritionTargetState(config)
          : null;
        const nutritionBudget =
          nutritionState &&
          dependencies.buildDailyNutritionBudget(nutritionState.targets, {
            calories: scopedSummary.meals.totals.calories,
            protein: scopedSummary.meals.totals.protein,
            fibre: scopedSummary.meals.totals.fibre
          });
        await dependencies.logScopedAccess(viewer, access.subjectUserId, access.categories, request.url);

        return {
          ok: true,
          summary: {
            ...scopedSummary,
            nutritionBudget
          }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request";
        return reply.code(400).send({
          ok: false,
          error: message
        });
      }
    }
  );

  app.get<{ Querystring: { weekStart?: string; timeZone?: string } }>(
    "/state/weekly",
    async (request, reply) => {
      try {
        const viewer = await dependencies.getAuthenticatedUser(request);
        if (!viewer) {
          return reply.code(401).send({
            ok: false,
            error: "Authentication required."
          });
        }

        const access = await dependencies.resolveViewerAccess(viewer);
        const summary = await dependencies.getWeeklySummary({
          weekStart: requireDate(request.query.weekStart, "weekStart"),
          timeZone: optionalTimeZone(request.query.timeZone)
        });
        const scopedSummary = sanitizeWeeklySummaryForCategories(summary, access.categories);
        await dependencies.logScopedAccess(viewer, access.subjectUserId, access.categories, request.url);

        return { ok: true, summary: scopedSummary };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request";
        return reply.code(400).send({
          ok: false,
          error: message
        });
      }
    }
  );
}
