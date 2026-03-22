import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function encodeOptionsSearchPath(schemaName: string) {
  return `-csearch_path=${schemaName}`;
}

export function buildConnectionString(env: NodeJS.ProcessEnv = process.env) {
  const explicitConnectionString = env.DATABASE_URL?.trim();
  if (explicitConnectionString) {
    return explicitConnectionString;
  }

  const host = env.PGHOST?.trim();
  const port = env.PGPORT?.trim() || "5432";
  const database = env.PGDATABASE?.trim();
  const user = env.PGUSER?.trim();
  const password = env.PGPASSWORD?.trim();

  if (!host || !database || !user || !password) {
    throw new Error(
      "DATABASE_URL is required, or PGHOST/PGDATABASE/PGUSER/PGPASSWORD must all be set"
    );
  }

  const sslMode = env.PGSSLMODE?.trim();
  const schemaName = env.POSTGRES_SCHEMA?.trim();

  if (host.startsWith("/")) {
    const params = new URLSearchParams({
      host
    });

    if (sslMode) {
      params.set("sslmode", sslMode);
    }

    if (schemaName) {
      params.set("options", encodeOptionsSearchPath(schemaName));
    }

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@/${encodeURIComponent(database)}?${params.toString()}`;
  }

  const url = new URL(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`);

  if (sslMode) {
    url.searchParams.set("sslmode", sslMode);
  }

  if (schemaName) {
    url.searchParams.set("options", encodeOptionsSearchPath(schemaName));
  }

  return url.toString();
}

export function getPool(connectionString = buildConnectionString(process.env)) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  if (!pool) {
    pool = new Pool({
      connectionString
    });
  }

  return pool;
}

export function getDb(connectionString = buildConnectionString(process.env)) {
  if (!db) {
    db = drizzle(getPool(connectionString), {
      schema
    });
  }

  return db;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export { schema };
