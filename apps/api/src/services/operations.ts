import type { AppConfig } from "../config.js";
import { getBackupConfig } from "../config.js";
import { sendTelegramMessageToChat } from "../lib/telegram.js";
import {
  finishJobRun,
  getOperatorAlertByKey,
  listOperatorAlerts,
  listRecentJobRuns,
  listSourceFreshnessRows,
  resolveOperatorAlert,
  startJobRun,
  upsertOperatorAlert
} from "./persistence.js";

type JobRunStatus = "running" | "succeeded" | "failed" | "skipped";
type AlertSeverity = "info" | "warning" | "critical";
type MonitoredStatus = "healthy" | "warning" | "critical" | "unknown" | "skipped";

export type TrackedJobOutcome<T> = {
  result: T;
  status?: Exclude<JobRunStatus, "running" | "failed">;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OperatorAlertRecord = {
  id: string;
  alertKey: string;
  category: string;
  severity: AlertSeverity;
  status: "open" | "resolved";
  summary: string;
  details: string | null;
  metadata: unknown;
  firstRaisedAt: Date;
  lastRaisedAt: Date;
  lastNotifiedAt: Date | null;
  notificationCount: number;
  resolvedAt: Date | null;
  updatedAt: Date;
};

type JobRunRecord = Awaited<ReturnType<typeof listRecentJobRuns>>[number];
type SourceFreshnessRecord = Awaited<ReturnType<typeof listSourceFreshnessRows>>[number];

type OperatorStatusItem = {
  key: string;
  label: string;
  status: MonitoredStatus;
  detail: string;
  lastSeenAt: string | null;
  metadata?: Record<string, unknown> | null;
};

type OperatorStatus = {
  generatedAt: string;
  overallStatus: "healthy" | "warning" | "critical";
  sources: OperatorStatusItem[];
  jobs: OperatorStatusItem[];
  alerts: Array<{
    alertKey: string;
    category: string;
    severity: AlertSeverity;
    summary: string;
    details: string | null;
    lastRaisedAt: string;
    lastNotifiedAt: string | null;
    notificationCount: number;
  }>;
};

type OperationsDependencies = {
  finishJobRun: typeof finishJobRun;
  getOperatorAlertByKey: (alertKey: string) => Promise<OperatorAlertRecord | null>;
  listOperatorAlerts: (input?: {
    status?: "open" | "resolved";
    limit?: number;
  }) => Promise<OperatorAlertRecord[]>;
  listRecentJobRuns: (limit?: number) => Promise<JobRunRecord[]>;
  listSourceFreshnessRows: () => Promise<SourceFreshnessRecord[]>;
  resolveOperatorAlert: typeof resolveOperatorAlert;
  sendTelegramMessageToChat: typeof sendTelegramMessageToChat;
  startJobRun: typeof startJobRun;
  upsertOperatorAlert: typeof upsertOperatorAlert;
};

const defaultDependencies: OperationsDependencies = {
  finishJobRun,
  getOperatorAlertByKey,
  listOperatorAlerts,
  listRecentJobRuns,
  listSourceFreshnessRows,
  resolveOperatorAlert,
  sendTelegramMessageToChat,
  startJobRun,
  upsertOperatorAlert
};

const ALERT_DEDUPE_MS = 6 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function getAlertChatId(config: AppConfig) {
  return config.TELEGRAM_ALERT_CHAT_ID ?? config.TELEGRAM_CHAT_ID ?? null;
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return typeof error === "string" ? error : JSON.stringify(error);
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function formatAge(ms: number) {
  const totalMinutes = Math.round(ms / MINUTE_MS);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function deriveOverallStatus(items: OperatorStatusItem[], alertSeverities: AlertSeverity[]) {
  if (
    items.some((item) => item.status === "critical") ||
    alertSeverities.includes("critical")
  ) {
    return "critical" as const;
  }

  if (
    items.some((item) => item.status === "warning") ||
    alertSeverities.includes("warning")
  ) {
    return "warning" as const;
  }

  return "healthy" as const;
}

function formatAlertMessage(input: {
  severity: AlertSeverity;
  summary: string;
  details?: string | null;
}) {
  const prefix =
    input.severity === "critical"
      ? "[46KG critical]"
      : input.severity === "warning"
        ? "[46KG warning]"
        : "[46KG info]";
  const lines = [prefix, input.summary];
  if (input.details) {
    lines.push(input.details);
  }
  return lines.join("\n");
}

async function raiseOperatorAlert(
  config: AppConfig,
  input: {
    alertKey: string;
    category: string;
    severity: AlertSeverity;
    summary: string;
    details?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  dependencies: OperationsDependencies
) {
  const existing = await dependencies.getOperatorAlertByKey(input.alertKey);
  const now = Date.now();
  const chatId = getAlertChatId(config);
  const shouldNotify =
    config.ENABLE_OPERATOR_ALERTS &&
    Boolean(chatId) &&
    (!existing?.lastNotifiedAt ||
      now - existing.lastNotifiedAt.getTime() >= ALERT_DEDUPE_MS ||
      existing.status === "resolved");

  await dependencies.upsertOperatorAlert({
    ...input,
    markNotified: shouldNotify
  });

  if (shouldNotify && chatId) {
    await dependencies.sendTelegramMessageToChat(
      config,
      chatId,
      formatAlertMessage(input)
    );
  }

  return {
    alertKey: input.alertKey,
    notified: shouldNotify
  };
}

type JobPolicy = {
  key: string;
  label: string;
  expectedWithinMs: number;
  enabled: (config: AppConfig) => boolean;
  configError?: (config: AppConfig) => string | null;
};

type SourcePolicy = {
  key: "health_auto_export" | "hevy" | "google_calendar";
  label: string;
  expectedWithinMs: number;
  enabled: (config: AppConfig) => boolean;
};

const jobPolicies: JobPolicy[] = [
  {
    key: "coaching-rhythm",
    label: "Coaching rhythm",
    expectedWithinMs: 2 * HOUR_MS,
    enabled: () => true
  },
  {
    key: "hevy-sync",
    label: "Hevy sync",
    expectedWithinMs: 2 * HOUR_MS,
    enabled: (config) => Boolean(config.HEVY_API_KEY)
  },
  {
    key: "google-calendar-sync",
    label: "Google Calendar sync",
    expectedWithinMs: 2 * HOUR_MS,
    enabled: (config) =>
      Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN)
  },
  {
    key: "nightly-backup",
    label: "Nightly backup",
    expectedWithinMs: 36 * HOUR_MS,
    enabled: (config) => {
      try {
        return Boolean(getBackupConfig(config));
      } catch {
        return true;
      }
    },
    configError: (config) => {
      try {
        getBackupConfig(config);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
  },
  {
    key: "operations-monitor",
    label: "Operations monitor",
    expectedWithinMs: 2 * HOUR_MS,
    enabled: () => true
  }
];

const sourcePolicies: SourcePolicy[] = [
  {
    key: "health_auto_export",
    label: "Health Auto Export",
    expectedWithinMs: 10 * HOUR_MS,
    enabled: () => true
  },
  {
    key: "hevy",
    label: "Hevy",
    expectedWithinMs: 2 * HOUR_MS,
    enabled: (config) => Boolean(config.HEVY_API_KEY)
  },
  {
    key: "google_calendar",
    label: "Google Calendar",
    expectedWithinMs: 2 * HOUR_MS,
    enabled: (config) =>
      Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN)
  }
];

export async function runTrackedJob<T>(
  config: AppConfig,
  input: {
    jobName: string;
    trigger?: string;
    failureAlertKey?: string;
    failureCategory?: string;
    failureSummary?: string;
  },
  execute: () => Promise<TrackedJobOutcome<T>>,
  dependencies: OperationsDependencies = defaultDependencies
) {
  const started = await dependencies.startJobRun({
    jobName: input.jobName,
    trigger: input.trigger ?? "manual"
  });

  try {
    const outcome = await execute();
    const status = outcome.status ?? "succeeded";

    await dependencies.finishJobRun({
      id: started.id,
      startedAt: started.startedAt,
      status,
      summary: outcome.summary ?? null,
      metadata: outcome.metadata ?? null
    });

    if (input.failureAlertKey) {
      await dependencies.resolveOperatorAlert(input.failureAlertKey);
    }

    return outcome.result;
  } catch (error) {
    const errorMessage = summarizeError(error);
    await dependencies.finishJobRun({
      id: started.id,
      startedAt: started.startedAt,
      status: "failed",
      summary: input.failureSummary ?? `${input.jobName} failed`,
      errorMessage,
      metadata: {
        errorName: error instanceof Error ? error.name : "unknown_error"
      }
    });

    if (input.failureAlertKey) {
      await raiseOperatorAlert(
        config,
        {
          alertKey: input.failureAlertKey,
          category: input.failureCategory ?? "job",
          severity: "critical",
          summary: input.failureSummary ?? `${input.jobName} failed`,
          details: errorMessage
        },
        dependencies
      );
    }

    throw error;
  }
}

export async function buildOperatorStatus(
  config: AppConfig,
  dependencies: OperationsDependencies = defaultDependencies
): Promise<OperatorStatus> {
  const [freshnessRows, jobRuns, openAlerts] = await Promise.all([
    dependencies.listSourceFreshnessRows(),
    dependencies.listRecentJobRuns(50),
    dependencies.listOperatorAlerts({
      status: "open",
      limit: 25
    })
  ]);

  const freshnessBySource = new Map(freshnessRows.map((row) => [row.source, row]));
  const latestJobByName = new Map<string, (typeof jobRuns)[number]>();

  for (const row of jobRuns) {
    if (!latestJobByName.has(row.jobName)) {
      latestJobByName.set(row.jobName, row);
    }
  }

  const now = Date.now();

  const sources = sourcePolicies.map<OperatorStatusItem>((policy) => {
    if (!policy.enabled(config)) {
      return {
        key: policy.key,
        label: policy.label,
        status: "skipped",
        detail: "Not configured.",
        lastSeenAt: null
      };
    }

    const row = freshnessBySource.get(policy.key);
    if (!row?.lastSuccessfulIngestAt) {
      return {
        key: policy.key,
        label: policy.label,
        status: "unknown",
        detail: row?.lastStatus === "error" ? row.lastError ?? "Latest ingest failed." : "No successful ingest recorded yet.",
        lastSeenAt: toIso(row?.lastSuccessfulIngestAt ?? null),
        metadata: row?.metadata as Record<string, unknown> | null | undefined
      };
    }

    const ageMs = now - row.lastSuccessfulIngestAt.getTime();
    const status: MonitoredStatus =
      ageMs <= policy.expectedWithinMs
        ? "healthy"
        : ageMs <= policy.expectedWithinMs * 3
          ? "warning"
          : "critical";

    return {
      key: policy.key,
      label: policy.label,
      status,
      detail:
        status === "healthy"
          ? `Last successful ingest ${formatAge(ageMs)} ago.`
          : `Last successful ingest ${formatAge(ageMs)} ago.`,
      lastSeenAt: row.lastSuccessfulIngestAt.toISOString(),
      metadata: row.metadata as Record<string, unknown> | null | undefined
    };
  });

  const jobs = jobPolicies.map<OperatorStatusItem>((policy) => {
    if (!policy.enabled(config)) {
      return {
        key: policy.key,
        label: policy.label,
        status: "skipped",
        detail: "Not configured.",
        lastSeenAt: null
      };
    }

    const configError = policy.configError?.(config) ?? null;
    if (configError) {
      return {
        key: policy.key,
        label: policy.label,
        status: "critical",
        detail: configError,
        lastSeenAt: null
      };
    }

    const row = latestJobByName.get(policy.key);
    if (!row) {
      return {
        key: policy.key,
        label: policy.label,
        status: "warning",
        detail: "No run recorded yet.",
        lastSeenAt: null
      };
    }

    const referenceAt = row.finishedAt ?? row.startedAt;
    const ageMs = now - referenceAt.getTime();
    let status: MonitoredStatus = "healthy";
    let detail = row.summary ?? "Latest run succeeded.";

    if (row.status === "failed") {
      status = "critical";
      detail = row.errorMessage ?? row.summary ?? "Latest run failed.";
    } else if (row.status === "running") {
      status = ageMs > policy.expectedWithinMs ? "warning" : "healthy";
      detail = `Running for ${formatAge(ageMs)}.`;
    } else if (row.status === "skipped") {
      status = "warning";
      detail = row.summary ?? "Latest run was skipped.";
    } else if (ageMs > policy.expectedWithinMs * 1.5) {
      status = "warning";
      detail = `Last success was ${formatAge(ageMs)} ago.`;
    }

    return {
      key: policy.key,
      label: policy.label,
      status,
      detail,
      lastSeenAt: referenceAt.toISOString(),
      metadata: row.metadata as Record<string, unknown> | null | undefined
    };
  });

  const alerts = openAlerts.map((alert) => ({
    alertKey: alert.alertKey,
    category: alert.category,
    severity: alert.severity,
    summary: alert.summary,
    details: alert.details ?? null,
    lastRaisedAt: alert.lastRaisedAt.toISOString(),
    lastNotifiedAt: toIso(alert.lastNotifiedAt),
    notificationCount: alert.notificationCount
  }));

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: deriveOverallStatus(
      [...sources, ...jobs],
      alerts.map((alert) => alert.severity)
    ),
    sources,
    jobs,
    alerts
  };
}

export async function runOperationsMonitor(
  config: AppConfig,
  dependencies: OperationsDependencies = defaultDependencies
) {
  const status = await buildOperatorStatus(config, dependencies);
  const opened: Array<{ alertKey: string; notified: boolean }> = [];
  const resolved: string[] = [];

  const desiredAlerts = [
    ...status.sources
      .filter((item) => item.status === "warning" || item.status === "critical")
      .map((item) => ({
        alertKey: `source:${item.key}:freshness`,
        category: "source_freshness",
        severity: item.status === "critical" ? ("critical" as const) : ("warning" as const),
        summary: `${item.label} is ${item.status}.`,
        details: item.detail,
        metadata: {
          itemKey: item.key,
          lastSeenAt: item.lastSeenAt
        }
      })),
    ...status.jobs
      .filter((item) => item.status === "warning" || item.status === "critical")
      .map((item) => ({
        alertKey: `job:${item.key}:status`,
        category: "job_freshness",
        severity: item.status === "critical" ? ("critical" as const) : ("warning" as const),
        summary: `${item.label} is ${item.status}.`,
        details: item.detail,
        metadata: {
          itemKey: item.key,
          lastSeenAt: item.lastSeenAt
        }
      }))
  ];

  const desiredAlertKeys = new Set(desiredAlerts.map((alert) => alert.alertKey));

  for (const alert of desiredAlerts) {
    opened.push(await raiseOperatorAlert(config, alert, dependencies));
  }

  const knownKeys = [
    ...sourcePolicies.map((policy) => `source:${policy.key}:freshness`),
    ...jobPolicies.map((policy) => `job:${policy.key}:status`)
  ];

  for (const alertKey of knownKeys) {
    if (desiredAlertKeys.has(alertKey)) {
      continue;
    }

    const didResolve = await dependencies.resolveOperatorAlert(alertKey);
    if (didResolve) {
      resolved.push(alertKey);
    }
  }

  return {
    status,
    openedAlerts: opened,
    resolvedAlerts: resolved
  };
}
