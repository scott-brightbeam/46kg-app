import { closeDb, getDb, sourcePrecedence } from "./index.js";

const rows = [
  {
    activityType: "strength_training",
    canonicalSource: "hevy",
    fallbackSource: "health_auto_export",
    notes: "Use Hevy as the canonical source for strength workouts."
  },
  {
    activityType: "outdoor_cardio",
    canonicalSource: "health_auto_export",
    fallbackSource: null,
    notes: "Use HealthKit-backed Apple Fitness and Apple Workout sessions as the v1 cardio source."
  },
  {
    activityType: "general_exercise",
    canonicalSource: "health_auto_export",
    fallbackSource: null,
    notes: "HealthKit-backed activities are canonical for walks, yoga, and uncategorized workouts."
  },
  {
    activityType: "heart_rate_and_recovery",
    canonicalSource: "health_auto_export",
    fallbackSource: null,
    notes: "HealthKit metrics are the only source for HR, HRV, sleep, and steps."
  },
  {
    activityType: "weight",
    canonicalSource: "manual",
    fallbackSource: "health_auto_export",
    notes: "Manual weight entry is canonical. Scale sync is fallback."
  }
] as const;

async function main() {
  const db = getDb();

  for (const row of rows) {
    await db
      .insert(sourcePrecedence)
      .values(row)
      .onConflictDoUpdate({
        target: sourcePrecedence.activityType,
        set: {
          canonicalSource: row.canonicalSource,
          fallbackSource: row.fallbackSource,
          notes: row.notes,
          updatedAt: new Date()
        }
      });
  }

  console.log(`Seeded ${rows.length} source precedence rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
