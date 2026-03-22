import { randomBytes } from "node:crypto";

import { closeDb, getDb, users } from "@codex/db";

import { hashPassword } from "../services/auth.js";

type SeedUserInput = {
  email: string;
  password: string;
  displayName: string;
  role: "user" | "trainer" | "nutritionist";
};

const requiredEnvNames = [
  "DASHBOARD_USER_EMAIL",
  "DASHBOARD_USER_PASSWORD",
  "DASHBOARD_TRAINER_EMAIL",
  "DASHBOARD_TRAINER_PASSWORD",
  "DASHBOARD_NUTRITIONIST_EMAIL",
  "DASHBOARD_NUTRITIONIST_PASSWORD"
] as const;

function readEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function buildSeedRows() {
  const missing = requiredEnvNames.filter((name) => !readEnv(name));
  if (missing.length > 0) {
    return {
      rows: [] as SeedUserInput[],
      skipped: true,
      missing
    };
  }

  return {
    rows: [
      {
        email: readEnv("DASHBOARD_USER_EMAIL")!,
        password: readEnv("DASHBOARD_USER_PASSWORD")!,
        displayName: process.env.DASHBOARD_USER_DISPLAY_NAME?.trim() || "Scott",
        role: "user"
      },
      {
        email: readEnv("DASHBOARD_TRAINER_EMAIL")!,
        password: readEnv("DASHBOARD_TRAINER_PASSWORD")!,
        displayName: process.env.DASHBOARD_TRAINER_DISPLAY_NAME?.trim() || "Trainer",
        role: "trainer"
      },
      {
        email: readEnv("DASHBOARD_NUTRITIONIST_EMAIL")!,
        password: readEnv("DASHBOARD_NUTRITIONIST_PASSWORD")!,
        displayName: process.env.DASHBOARD_NUTRITIONIST_DISPLAY_NAME?.trim() || "Nutritionist",
        role: "nutritionist"
      }
    ] satisfies SeedUserInput[],
    skipped: false,
    missing: [] as string[]
  };
}

async function main() {
  const db = getDb();
  const built = buildSeedRows();

  if (built.skipped) {
    console.log(
      `Skipping dashboard user seeding because required credentials are not configured: ${built.missing.join(", ")}`
    );
    return;
  }

  const rows = built.rows;

  for (const row of rows) {
    await db
      .insert(users)
      .values({
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        passwordHash: hashPassword(row.password, randomBytes(16).toString("hex")),
        isActive: true
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          displayName: row.displayName,
          role: row.role,
          passwordHash: hashPassword(row.password, randomBytes(16).toString("hex")),
          isActive: true,
          updatedAt: new Date()
        }
      });
  }

  console.log(`Seeded ${rows.length} dashboard users.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
