import { scryptSync, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import {
  getPrimaryUserByRole,
  getUserByEmail,
  getUserById,
  listAccessGrantDecisionsForPair,
  storeAccessLog
} from "./persistence.js";
import type { AccessCategory, UserRole } from "@codex/shared";

const SESSION_COOKIE_NAME = "codex_health_session";
const DEFAULT_SUBJECT_ROLE: UserRole = "user";

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
};

type SessionPayload = {
  userId: string;
  issuedAt: string;
};

type AuthDependencies = {
  getPrimaryUserByRole: typeof getPrimaryUserByRole;
  getUserByEmail: typeof getUserByEmail;
  getUserById: typeof getUserById;
  listAccessGrantDecisionsForPair: typeof listAccessGrantDecisionsForPair;
  storeAccessLog: typeof storeAccessLog;
};

const defaultDependencies: AuthDependencies = {
  getPrimaryUserByRole,
  getUserByEmail,
  getUserById,
  listAccessGrantDecisionsForPair,
  storeAccessLog
};

function encodeSessionCookie(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSessionCookie(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SessionPayload;
    if (typeof parsed.userId !== "string" || typeof parsed.issuedAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string, salt: string) {
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, storedPasswordHash: string) {
  if (storedPasswordHash.startsWith("plain:")) {
    return constantTimeEquals(password, storedPasswordHash.slice("plain:".length));
  }

  if (storedPasswordHash.startsWith("scrypt$")) {
    const [, salt, expectedHash] = storedPasswordHash.split("$");
    if (!salt || !expectedHash) {
      return false;
    }
    const candidateHash = scryptSync(password, salt, 64).toString("hex");
    return constantTimeEquals(candidateHash, expectedHash);
  }

  return constantTimeEquals(password, storedPasswordHash);
}

export function setSessionCookie(reply: FastifyReply, user: Pick<AuthenticatedUser, "id">) {
  const secure = process.env.NODE_ENV === "production";
  reply.setCookie(
    SESSION_COOKIE_NAME,
    encodeSessionCookie({
      userId: user.id,
      issuedAt: new Date().toISOString()
    }),
    {
      path: "/",
      httpOnly: true,
      sameSite: secure ? "none" : "lax",
      secure,
      signed: true,
      maxAge: 60 * 60 * 8
    }
  );
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: "/"
  });
}

export async function getAuthenticatedUser(
  request: FastifyRequest,
  dependencies: Pick<AuthDependencies, "getUserById"> = defaultDependencies
) {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME];
  if (!rawCookie) {
    return null;
  }

  const unsigned = request.unsignCookie(rawCookie);
  if (!unsigned.valid) {
    return null;
  }

  const payload = decodeSessionCookie(unsigned.value);
  if (!payload) {
    return null;
  }

  const user = await dependencies.getUserById(payload.userId);
  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function authenticateWithPassword(
  email: string,
  password: string,
  dependencies: Pick<AuthDependencies, "getUserByEmail"> = defaultDependencies
) {
  const user = await dependencies.getUserByEmail(email);
  if (!user || !user.isActive) {
    return null;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }

  return user;
}

function getDefaultCategoriesForRole(role: UserRole) {
  if (role === "trainer") {
    return new Set<AccessCategory>(["exercise"]);
  }

  if (role === "nutritionist") {
    return new Set<AccessCategory>(["nutrition", "weight"]);
  }

  return new Set<AccessCategory>(["exercise", "nutrition", "weight", "engagement_status"]);
}

function applyGrantDecisions(
  baseCategories: Set<AccessCategory>,
  decisions: Array<{
    category: AccessCategory;
    revokedAt: Date | null;
  }>
) {
  const categories = new Set(baseCategories);
  const latestByCategory = new Map<AccessCategory, Date | null>();

  for (const decision of decisions) {
    if (!latestByCategory.has(decision.category)) {
      latestByCategory.set(decision.category, decision.revokedAt);
    }
  }

  for (const [category, revokedAt] of latestByCategory.entries()) {
    if (revokedAt) {
      categories.delete(category);
      continue;
    }

    categories.add(category);
  }

  return categories;
}

export async function resolveViewerAccess(
  viewer: AuthenticatedUser,
  dependencies: AuthDependencies = defaultDependencies
) {
  if (viewer.role === "user") {
    return {
      subjectUserId: viewer.id,
      categories: getDefaultCategoriesForRole(viewer.role)
    };
  }

  const subjectUser = await dependencies.getPrimaryUserByRole(DEFAULT_SUBJECT_ROLE);
  if (!subjectUser) {
    throw new Error("No primary user account is configured yet.");
  }

  const decisions = await dependencies.listAccessGrantDecisionsForPair({
    subjectUserId: subjectUser.id,
    practitionerUserId: viewer.id
  });
  const categories = applyGrantDecisions(getDefaultCategoriesForRole(viewer.role), decisions);

  return {
    subjectUserId: subjectUser.id,
    categories
  };
}

export async function logScopedAccess(
  viewer: AuthenticatedUser,
  subjectUserId: string,
  categories: Set<AccessCategory>,
  requestPath: string,
  dependencies: Pick<AuthDependencies, "storeAccessLog"> = defaultDependencies
) {
  if (viewer.role === "user") {
    return;
  }

  await Promise.all(
    [...categories].map((category) =>
      dependencies.storeAccessLog({
        practitionerUserId: viewer.id,
        subjectUserId,
        category,
        requestPath
      })
    )
  );
}

export function sanitizeDailySummaryForCategories<
  TSummary extends {
    workouts: unknown[];
    meals: {
      entries: unknown[];
      totals: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fibre: number;
      };
    };
    scores: Record<string, unknown>;
    latestWeight: unknown;
    engagementStatus: unknown;
    dayTemplate: unknown;
    calendar: {
      events: unknown[];
      freeSlots: unknown[];
      busySlots: unknown[];
    };
    dailyPlan: {
      summary: string;
      workoutPlan: unknown;
      mealPlan: unknown;
      recoveryContext: unknown;
      sourceSnapshot: unknown;
    } | null;
  }
>(summary: TSummary, categories: Set<AccessCategory>) {
  const canExercise = categories.has("exercise");
  const canNutrition = categories.has("nutrition");
  const canWeight = categories.has("weight");
  const canEngagement = categories.has("engagement_status");

  return {
    ...summary,
    workouts: canExercise ? summary.workouts : [],
    meals: canNutrition
      ? summary.meals
      : {
          entries: [],
          totals: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fibre: 0
          }
        },
    scores: canExercise ? summary.scores : {},
    latestWeight: canWeight ? summary.latestWeight : null,
    engagementStatus: canEngagement ? summary.engagementStatus : null,
    dayTemplate: canExercise ? summary.dayTemplate : null,
    calendar: canExercise
      ? summary.calendar
      : {
          events: [],
          freeSlots: [],
          busySlots: []
        },
    dailyPlan:
      summary.dailyPlan && (canExercise || canNutrition)
        ? {
            ...summary.dailyPlan,
            summary: canExercise
              ? summary.dailyPlan.summary
              : "Meal-plan view only in this scoped session.",
            workoutPlan: canExercise ? summary.dailyPlan.workoutPlan : null,
            mealPlan: canNutrition ? summary.dailyPlan.mealPlan : null,
            recoveryContext: canExercise ? summary.dailyPlan.recoveryContext : null,
            sourceSnapshot: null
          }
        : null
  };
}

export function sanitizeWeeklySummaryForCategories<
  TSummary extends {
    workoutCount: number;
    workoutDurationSeconds: number;
    workoutsBySource: Record<string, number>;
    workouts: unknown[];
    meals: {
      totalEntries: number;
      daysWithTwoMealsLogged: number;
      totals: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fibre: number;
      };
    };
    latestWeight: unknown;
    previousWeight: unknown;
    weightDeltaKg: number | null;
    scores: Record<string, unknown>;
    engagementStatus: unknown;
  }
>(summary: TSummary, categories: Set<AccessCategory>) {
  const canExercise = categories.has("exercise");
  const canNutrition = categories.has("nutrition");
  const canWeight = categories.has("weight");
  const canEngagement = categories.has("engagement_status");

  return {
    ...summary,
    workoutCount: canExercise ? summary.workoutCount : 0,
    workoutDurationSeconds: canExercise ? summary.workoutDurationSeconds : 0,
    workoutsBySource: canExercise ? summary.workoutsBySource : {},
    workouts: canExercise ? summary.workouts : [],
    meals: canNutrition
      ? summary.meals
      : {
          totalEntries: 0,
          daysWithTwoMealsLogged: 0,
          totals: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fibre: 0
          }
        },
    latestWeight: canWeight ? summary.latestWeight : null,
    previousWeight: canWeight ? summary.previousWeight : null,
    weightDeltaKg: canWeight ? summary.weightDeltaKg : null,
    scores: canExercise ? summary.scores : {},
    engagementStatus: canEngagement ? summary.engagementStatus : null
  };
}

export { SESSION_COOKIE_NAME };
