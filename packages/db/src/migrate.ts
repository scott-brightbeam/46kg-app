import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "./client.js";

async function main() {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(dirname, "../drizzle");

  await migrate(getDb(), {
    migrationsFolder
  });

  console.log(`Applied migrations from ${migrationsFolder}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

