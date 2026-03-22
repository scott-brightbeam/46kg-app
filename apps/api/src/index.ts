import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main() {
  const config = loadConfig();
  const app = await buildServer(config);

  await app.listen({
    port: config.API_PORT,
    host: "0.0.0.0"
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

