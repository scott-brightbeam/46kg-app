import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";

import { buildConnectionString } from "@codex/db";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { AppConfig } from "../config.js";
import { getBackupConfig } from "../config.js";

type BackupDependencies = {
  createS3Client: (config: AppConfig) => S3Client;
  now: () => Date;
  runPgDump: (config: AppConfig) => Promise<Buffer>;
  uploadObject: (input: {
    client: S3Client;
    bucket: string;
    key: string;
    body: Buffer;
  }) => Promise<void>;
};

const defaultDependencies: BackupDependencies = {
  createS3Client(config) {
    const backup = getBackupConfig(config);
    if (!backup) {
      throw new Error("Backup config is not available.");
    }

    return new S3Client({
      region: backup.region,
      endpoint: backup.endpoint ?? undefined,
      forcePathStyle: backup.forcePathStyle,
      credentials: {
        accessKeyId: backup.accessKeyId,
        secretAccessKey: backup.secretAccessKey
      }
    });
  },
  now: () => new Date(),
  runPgDump(config) {
    const backup = getBackupConfig(config);
    if (!backup) {
      throw new Error("Backup config is not available.");
    }

    return new Promise<Buffer>((resolve, reject) => {
      const databaseUrl = buildConnectionString(process.env);
      const child = spawn(
        backup.pgDumpBin,
        [
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-privileges",
          "--format=plain",
          databaseUrl
        ],
        {
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer | string) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk: Buffer | string) => stderr.push(Buffer.from(chunk)));
      child.on("error", reject);
      child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        if (code === 0) {
          resolve(Buffer.concat(stdout));
          return;
        }

        reject(
          new Error(
            `pg_dump failed with ${
              signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`
            }: ${Buffer.concat(stderr).toString("utf8").trim()}`
          )
        );
      });
    });
  },
  async uploadObject(input) {
    await input.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: "application/gzip"
      })
    );
  }
};

function buildBackupKey(prefix: string, at: Date) {
  const stamp = at.toISOString().replace(/[:]/g, "-");
  return `${prefix.replace(/\/+$/, "")}/46kg-${stamp}.sql.gz`;
}

export async function runNightlyBackup(
  config: AppConfig,
  dependencies: BackupDependencies = defaultDependencies
) {
  const backup = getBackupConfig(config);
  if (!backup) {
    return {
      skipped: true,
      reason: "backup_not_configured"
    };
  }

  const capturedAt = dependencies.now();
  const sqlDump = await dependencies.runPgDump(config);
  const compressed = gzipSync(sqlDump, {
    level: 9
  });
  const key = buildBackupKey(backup.prefix, capturedAt);
  const client = dependencies.createS3Client(config);

  await dependencies.uploadObject({
    client,
    bucket: backup.bucket,
    key,
    body: compressed
  });

  return {
    skipped: false,
    bucket: backup.bucket,
    key,
    capturedAt: capturedAt.toISOString(),
    bytes: compressed.length
  };
}
