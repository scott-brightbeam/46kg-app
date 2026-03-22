# 46KG Production Rollout

## Goal

Bring `46KG` onto Render with:

- a healthy API and web service
- repeatable DB migrations on deploy
- seeded source precedence
- optional dashboard-user seeding when credentials are present
- active cron jobs for coaching, sync, monitoring, and backup
- a live Telegram webhook

## Render services

- `46kg-api`
- `46kg-web`
- `46kg-coaching-rhythm`
- `46kg-hevy-sync`
- `46kg-google-calendar-sync`
- `46kg-operations-monitor`
- `46kg-nightly-backup`
- `46kg-db`

## Required variables

These must be present before the system is truly usable:

- `API_BASE_URL`
- `WEB_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_CHAT_ID`
- `HEALTH_AUTO_EXPORT_SHARED_SECRET`
- `HEVY_API_KEY`
- `AUTH_SESSION_SECRET`
- `DASHBOARD_USER_EMAIL`
- `DASHBOARD_USER_PASSWORD`
- `DASHBOARD_TRAINER_EMAIL`
- `DASHBOARD_TRAINER_PASSWORD`
- `DASHBOARD_NUTRITIONIST_EMAIL`
- `DASHBOARD_NUTRITIONIST_PASSWORD`

## Strongly recommended variables

- `TELEGRAM_ALERT_CHAT_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `BACKUP_S3_BUCKET`
- `BACKUP_S3_REGION`
- `BACKUP_S3_ACCESS_KEY_ID`
- `BACKUP_S3_SECRET_ACCESS_KEY`

## Pre-deploy behavior

The API service pre-deploy command now does three things:

1. runs DB migrations
2. seeds `source_precedence`
3. attempts dashboard-user seeding

Dashboard-user seeding is idempotent and now skips cleanly if the dashboard credentials have not been configured yet.

## Day-0 checklist

1. Create the Render Blueprint from [render.yaml](/Users/scott/Projects/Codex/render.yaml).
2. Fill every `sync: false` variable manually in the Render dashboard.
3. Run [check:production](/Users/scott/Projects/Codex/package.json) locally against the intended env values.
4. Deploy the API service and confirm `GET /health` is healthy.
5. Open the user dashboard and confirm the operator panel loads.
6. Configure the Telegram webhook with `npm run configure:telegram-webhook --workspace @codex/api -- --drop-pending-updates`.
7. Verify the webhook state with `npm run check:telegram-webhook --workspace @codex/api`.
8. Confirm the cron jobs are scheduled and healthy.
9. Run `npm run check:live` against the live env.

## First live verification

- Trigger a Hevy sync and confirm `source_freshness` for `hevy` updates.
- Send a Telegram message and confirm the webhook path works.
- Trigger a Health Auto Export push and confirm the operator panel reflects the new freshness.
- Run the hourly coaching rhythm once and confirm prompts/briefs can send.
- Verify backup status in the operator panel after the first nightly backup.

## Notes

- Apple Fitness / HealthKit is the default cardio path in v1.
- Strava is intentionally not part of the production default.
- Render Blueprint `sync: false` variables do not re-prompt reliably after initial creation, so post-create env review is mandatory.
- `WEB_BASE_URL` is now security-critical as well as a routing value. It is used for CORS and for trusted-origin checks on cookie-authenticated write routes.
- Any non-browser client hitting authenticated write routes must send `Origin` or `Referer` matching `WEB_BASE_URL`.
