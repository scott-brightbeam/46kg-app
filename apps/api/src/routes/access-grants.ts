import type { FastifyInstance } from "fastify";

import { accessCategorySchema, userRoleSchema } from "@codex/shared";

import type { AppConfig } from "../config.js";
import { assertTrustedBrowserOrigin } from "../lib/trusted-origin.js";
import { getAuthenticatedUser } from "../services/auth.js";
import { listAccessGrantState, updateAccessGrant } from "../services/access-grants.js";

type AccessGrantRouteDependencies = {
  getAuthenticatedUser: typeof getAuthenticatedUser;
  listAccessGrantState: typeof listAccessGrantState;
  updateAccessGrant: typeof updateAccessGrant;
};

const defaultDependencies: AccessGrantRouteDependencies = {
  getAuthenticatedUser,
  listAccessGrantState,
  updateAccessGrant
};

function ensureUserRole(role: unknown) {
  const parsed = userRoleSchema.parse(role);
  if (parsed !== "user") {
    throw new Error("Only the primary user can manage access grants.");
  }

  return parsed;
}

function requirePractitionerRole(value: unknown) {
  const parsed = userRoleSchema.parse(value);
  if (parsed !== "trainer" && parsed !== "nutritionist") {
    throw new Error("Expected practitionerRole to be trainer or nutritionist.");
  }

  return parsed;
}

function requireAuthenticatedUser(user: Awaited<ReturnType<typeof getAuthenticatedUser>>) {
  if (!user) {
    const error = new Error("Authentication required.");
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }

  return user;
}

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

export async function registerAccessGrantRoutes(
  app: FastifyInstance,
  config: Pick<AppConfig, "WEB_BASE_URL">,
  dependencies: AccessGrantRouteDependencies = defaultDependencies
) {
  app.get("/access-grants", async (request, reply) => {
    try {
      const viewer = requireAuthenticatedUser(await dependencies.getAuthenticatedUser(request));
      ensureUserRole(viewer.role);

      return {
        ok: true,
        grants: await dependencies.listAccessGrantState()
      };
    } catch (error) {
      return handleRouteError(error, reply);
    }
  });

  app.post<{ Body: { practitionerRole?: string; category?: string } }>(
    "/access-grants/grant",
    async (request, reply) => {
      try {
        assertTrustedBrowserOrigin(request, config);
        const viewer = requireAuthenticatedUser(await dependencies.getAuthenticatedUser(request));
        ensureUserRole(viewer.role);

        const result = await dependencies.updateAccessGrant({
          actorUserId: viewer.id,
          practitionerRole: requirePractitionerRole(request.body?.practitionerRole),
          category: accessCategorySchema.parse(request.body?.category),
          action: "grant"
        });

        return {
          ok: true,
          changed: result.changed,
          message: result.responseText,
          grants: result.snapshots
        };
      } catch (error) {
        return handleRouteError(error, reply);
      }
    }
  );

  app.post<{ Body: { practitionerRole?: string; category?: string } }>(
    "/access-grants/revoke",
    async (request, reply) => {
      try {
        assertTrustedBrowserOrigin(request, config);
        const viewer = requireAuthenticatedUser(await dependencies.getAuthenticatedUser(request));
        ensureUserRole(viewer.role);

        const result = await dependencies.updateAccessGrant({
          actorUserId: viewer.id,
          practitionerRole: requirePractitionerRole(request.body?.practitionerRole),
          category: accessCategorySchema.parse(request.body?.category),
          action: "revoke"
        });

        return {
          ok: true,
          changed: result.changed,
          message: result.responseText,
          grants: result.snapshots
        };
      } catch (error) {
        return handleRouteError(error, reply);
      }
    }
  );
}
