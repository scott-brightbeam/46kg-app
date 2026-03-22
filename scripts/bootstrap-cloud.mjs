import { spawn } from "node:child_process";
import process from "node:process";

import { buildConnectionString } from "@codex/db";
import pg from "pg";

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
    connectionString: buildConnectionString(process.env)
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
