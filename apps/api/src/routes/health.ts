import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

import { getDb } from "@codex/db";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    try {
      await getDb().execute(sql`select 1`);

      return {
        ok: true,
        service: "46kg-api",
        database: "reachable",
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      app.log.error({ error }, "database health check failed");

      return reply.code(503).send({
        ok: false,
        service: "46kg-api",
        database: "unreachable",
        timestamp: new Date().toISOString()
      });
    }
  });
}
