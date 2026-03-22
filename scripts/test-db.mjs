import { spawn } from "node:child_process";

function buildAdminUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";
  return url.toString();
}

function buildTempDatabaseName(baseName, label) {
  const safeBase = baseName.replace(/[^a-zA-Z0-9_]/g, "_");
  const safeLabel = label.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${safeBase}_${safeLabel}_${process.pid}_${Date.now()}`.slice(0, 63);
}

async function runPsql(databaseUrl, sql, options = {}) {
  const { cwd, env } = options;

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "psql",
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql],
      {
        cwd,
        env,
        stdio: "inherit"
      }
    );

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `psql failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}.`
        )
      );
    });
  });
}

export async function createTemporaryDatabase(databaseUrl, label, options = {}) {
  const baseUrl = new URL(databaseUrl);
  const baseName = baseUrl.pathname.replace(/^\//, "") || "postgres";
  const databaseName = buildTempDatabaseName(baseName, label);
  const adminUrl = buildAdminUrl(databaseUrl);

  await runPsql(adminUrl, `CREATE DATABASE "${databaseName}"`, options);

  const tempUrl = new URL(databaseUrl);
  tempUrl.pathname = `/${databaseName}`;

  return {
    databaseName,
    databaseUrl: tempUrl.toString(),
    async drop() {
      try {
        await runPsql(adminUrl, `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`, options);
      } catch {
        await runPsql(
          adminUrl,
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = '${databaseName}'
             AND pid <> pg_backend_pid()`,
          options
        );
        await runPsql(adminUrl, `DROP DATABASE IF EXISTS "${databaseName}"`, options);
      }
    }
  };
}
