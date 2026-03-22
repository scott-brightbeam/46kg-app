import { spawn } from "node:child_process";
import process from "node:process";

import pg from "pg";

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function buildAdminConnectionString() {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/([?&])options=[^&]*(&|$)/, (_, prefix, suffix) => {
      if (prefix === "?" && suffix === "") {
        return "";
      }

      if (prefix === "?" && suffix === "&") {
        return "?";
      }

      return prefix === "&" && suffix === ""
        ? ""
        : prefix === "&" && suffix === "&"
          ? "&"
          : "";
    }).replace(/[?&]$/, "");
  }

  const host = getRequiredEnv("PGHOST");
  const port = process.env.PGPORT?.trim() || "5432";
  const database = getRequiredEnv("PGDATABASE");
  const user = getRequiredEnv("PGUSER");
  const password = getRequiredEnv("PGPASSWORD");
  const sslMode = process.env.PGSSLMODE?.trim();
  const url = new URL(
    host.startsWith("/")
      ? `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@/${encodeURIComponent(database)}`
      : `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`
  );

  if (host.startsWith("/")) {
    url.searchParams.set("host", host);
  }

  if (sslMode) {
    url.searchParams.set("sslmode", sslMode);
  }

  return url.toString();
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function ensureSchemaExists() {
  const schemaName = process.env.POSTGRES_SCHEMA?.trim();
  if (!schemaName) {
    console.log("POSTGRES_SCHEMA not set; skipping schema bootstrap.");
    return;
  }

  const client = new pg.Client({
    connectionString: buildAdminConnectionString()
  });

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
    console.log(`Ensured schema ${schemaName} exists.`);
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureSchemaExists();
  await run("npm", ["run", "migrate:up", "--workspace", "@codex/db"]);
  await run("npm", ["run", "seed:source-precedence", "--workspace", "@codex/db"]);
  await run("npm", ["run", "seed:dashboard-users", "--workspace", "@codex/api"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
