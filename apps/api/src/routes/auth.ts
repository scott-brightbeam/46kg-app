import type { FastifyInstance } from "fastify";

import {
  authenticateWithPassword,
  clearSessionCookie,
  getAuthenticatedUser,
  resolveViewerAccess,
  setSessionCookie
} from "../services/auth.js";
import type { AccessCategory } from "@codex/shared";
import type { AppConfig } from "../config.js";
import { createInMemoryRateLimiter } from "../lib/rate-limit.js";
import { assertTrustedBrowserOrigin } from "../lib/trusted-origin.js";

type AuthRouteDependencies = {
  authenticateWithPassword: typeof authenticateWithPassword;
  consumeLoginRateLimit: (key: string) => {
    allowed: boolean;
    retryAfterSeconds: number;
  };
  getAuthenticatedUser: typeof getAuthenticatedUser;
  resolveViewerAccess: typeof resolveViewerAccess;
};

const consumeLoginRateLimit = createInMemoryRateLimiter({
  max: 10,
  windowMs: 60_000
});

const defaultDependencies: AuthRouteDependencies = {
  authenticateWithPassword,
  consumeLoginRateLimit,
  getAuthenticatedUser,
  resolveViewerAccess
};

function requireNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected ${fieldName} to be a non-empty string.`);
  }

  return value.trim();
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  config: Pick<AppConfig, "WEB_BASE_URL">,
  dependencies: AuthRouteDependencies = defaultDependencies
) {
  app.post<{ Body: { email?: string; password?: string } }>(
    "/auth/login",
    async (request, reply) => {
      try {
        const email = requireNonEmptyString(request.body?.email, "email");
        const password = requireNonEmptyString(request.body?.password, "password");
        const rateLimit = dependencies.consumeLoginRateLimit(
          `${request.ip}:${email.toLowerCase()}`
        );

        if (!rateLimit.allowed) {
          return reply
            .header("Retry-After", String(rateLimit.retryAfterSeconds))
            .code(429)
            .send({
              ok: false,
              error: "Too many login attempts. Try again shortly."
            });
        }

        const user = await dependencies.authenticateWithPassword(
          email,
          password
        );

        if (!user) {
          return reply.code(401).send({
            ok: false,
            error: "Invalid email or password."
          });
        }

        setSessionCookie(reply, user);
        return reply.code(200).send({
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request";
        return reply.code(400).send({
          ok: false,
          error: message
        });
      }
    }
  );

  app.post("/auth/logout", async (request, reply) => {
    try {
      assertTrustedBrowserOrigin(request, config);
      clearSessionCookie(reply);
      return reply.code(200).send({
        ok: true
      });
    } catch (error) {
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
  });

  app.get("/auth/me", async (request, reply) => {
    const user = await dependencies.getAuthenticatedUser(request);
    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: "Authentication required."
      });
    }

    const access = await dependencies.resolveViewerAccess(user);

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      },
      access: {
        subjectUserId: access.subjectUserId,
        categories: [...access.categories] as AccessCategory[]
      }
    };
  });
}
