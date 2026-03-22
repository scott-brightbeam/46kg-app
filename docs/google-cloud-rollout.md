# 46KG Google Cloud Rollout

## Recommendation

If you already have a Google Cloud account, this is a good deployment target.

The cleanest mapping from the current app is:

- Cloud Run service: `46kg-api`
- Cloud Run service: `46kg-web`
- Cloud Run jobs: `coaching-rhythm`, `hevy-sync`, `google-calendar-sync`, `operations-monitor`
- Cloud Scheduler: one trigger per scheduled Cloud Run job
- Cloud SQL for PostgreSQL: primary database
- Secret Manager: application secrets
- Artifact Registry: container images

This matches Google's current managed path:

- Cloud Run to Cloud SQL for PostgreSQL via Cloud SQL connection support and Unix sockets: [Connect from Cloud Run](https://cloud.google.com/sql/docs/postgres/connect-run)
- Secret Manager with Cloud Run: [Configure secrets for services](https://cloud.google.com/run/docs/configuring/services/secrets)
- Scheduled execution through Cloud Scheduler with authenticated targets and Cloud Run jobs: [Use authentication with HTTP targets](https://cloud.google.com/scheduler/docs/http-target-auth), [Execute jobs on a schedule](https://cloud.google.com/run/docs/execute/jobs-on-schedule)
- Managed database backups in Cloud SQL: [Choose your backup option](https://cloud.google.com/sql/docs/postgres/backup-recovery/backup-options)

## Why GCP is a good fit here

- You already have an account, which reduces setup friction.
- Cloud Run is a strong fit for the API, dashboard, and scheduled commands.
- Cloud SQL removes the need to self-manage Postgres.
- Secret Manager is better than hand-managed env vars for this many secrets.
- Cloud Scheduler plus Cloud Run Jobs maps neatly to the existing cron-like workload.

## Architecture

### Services

- `46kg-api`: public HTTPS Cloud Run service for Telegram and Health Auto Export webhooks, auth, dashboard API, and health checks
- `46kg-web`: public HTTPS Cloud Run service for the Next dashboard

### Jobs

Use the API image for these Cloud Run jobs:

- `46kg-coaching-rhythm`: `npm run start:job:run-coaching-rhythm --workspace @codex/api`
- `46kg-hevy-sync`: `npm run start:job:sync-hevy --workspace @codex/api`
- `46kg-google-calendar-sync`: `npm run start:job:sync-calendar --workspace @codex/api`
- `46kg-operations-monitor`: `npm run start:job:run-ops-monitor --workspace @codex/api`

Optional:

- `46kg-nightly-backup`: only if you still want app-managed dump exports. On GCP, Cloud SQL automated backups are the simpler default, so this job can wait.

## Important implementation notes

### Deploy API first, then web

The dashboard needs `NEXT_PUBLIC_API_BASE_URL` at build time.

So the right order is:

1. Build and deploy `46kg-api`
2. Get the live API URL
3. Build and deploy `46kg-web` with that URL as `NEXT_PUBLIC_API_BASE_URL`

### Database connection

Keep using `DATABASE_URL`, but point it at the Cloud SQL Unix socket path when deploying on Cloud Run. The Cloud SQL docs describe the mounted socket path as `/cloudsql/INSTANCE_CONNECTION_NAME`.

That means the production connection string should look like:

```text
postgresql://USER:PASSWORD@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
```

### Secrets

Use Secret Manager for:

- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_ALERT_CHAT_ID`
- `HEALTH_AUTO_EXPORT_SHARED_SECRET`
- `HEVY_API_KEY`
- `AUTH_SESSION_SECRET`
- dashboard credentials
- Google Calendar credentials

Grant the runtime service account:

- `roles/secretmanager.secretAccessor`
- `roles/cloudsql.client`

Grant the scheduler invoker service account:

- `roles/run.invoker` on each job target or service target it needs to call

## First-pass rollout

### 1. Enable APIs

Enable at least:

- Cloud Run API
- Cloud SQL Admin API
- Secret Manager API
- Artifact Registry API
- Cloud Build API
- Cloud Scheduler API

### 2. Create Artifact Registry

Create one Docker repository, for example `46kg`, in your preferred region.

### 3. Create Cloud SQL

Create a PostgreSQL instance and turn on:

- automated backups
- point-in-time recovery

Using Cloud SQL automated backups is a good default here and can replace the first version of the app-managed S3 dump job.

### 4. Build and push images

API image:

```bash
gcloud builds submit --config cloudbuild.api.yaml
```

Web image, after API deploy gives you the live URL:

```bash
gcloud builds submit \
  --config cloudbuild.web.yaml \
  --substitutions=_NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_URL
```

### 5. Deploy API service

Deploy `46kg-api` to Cloud Run with:

- public ingress
- Cloud SQL attachment
- secrets wired from Secret Manager
- `WEB_BASE_URL` set to the final dashboard URL
- `API_BASE_URL` set to the final API URL

### 6. Deploy web service

Deploy `46kg-web` to Cloud Run with:

- public ingress
- `NEXT_PUBLIC_API_BASE_URL` already baked into the image at build time

### 7. Create Cloud Run jobs

Create one job per scheduled command using the API image and the command strings listed above.

### 8. Create Cloud Scheduler triggers

Map the schedules from the current Render setup:

- coaching rhythm: hourly
- Hevy sync: every 30 minutes
- Google Calendar sync: every 30 minutes
- operations monitor: every 15 minutes

### 9. Post-deploy checks

Run:

```bash
npm run check:live
npm run configure:telegram-webhook --workspace @codex/api -- --drop-pending-updates
npm run check:telegram-webhook --workspace @codex/api
```

Then verify:

- `/health`
- dashboard login
- `/ops/status`
- Telegram webhook
- Hevy sync job
- Cloud Scheduler job history

## Files added for GCP

- [Dockerfile.api](/Users/scott/Projects/Codex/Dockerfile.api)
- [Dockerfile.web](/Users/scott/Projects/Codex/Dockerfile.web)
- [cloudbuild.api.yaml](/Users/scott/Projects/Codex/cloudbuild.api.yaml)
- [cloudbuild.web.yaml](/Users/scott/Projects/Codex/cloudbuild.web.yaml)

These are enough to get the first deployment path moving without committing to Terraform yet.
