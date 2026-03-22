import { loadConfig } from "../config.js";
import { syncRecentStravaActivities } from "../services/strava.js";

async function main() {
  const config = loadConfig();
  const result = await syncRecentStravaActivities(config);

  console.log(
    `Synced ${result.activityCount} Strava activities from ingest event ${result.ingestEventId}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
