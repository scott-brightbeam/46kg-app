# 46KG

Research-backed implementation scaffold for the AI health tracking and coaching system in [PRD-v0.3.md](/Users/scott/Projects/Codex/PRD-v0.3.md).

## Workspace layout

- `apps/api`: Fastify service for webhooks, scheduled jobs, agent orchestration, and integration adapters
- `apps/web`: Next.js dashboard with authenticated, scoped practitioner and user views
- `packages/db`: Drizzle schema and migration configuration for PostgreSQL
- `packages/shared`: shared domain constants and validation schemas
- `docs`: implementation research, source-backed decisions, and integration spikes

## Why this shape

- Fastify fits webhook-heavy ingestion and background-job orchestration cleanly.
- Next.js gives the dashboard server-side rendering, auth hooks, and a good Render deployment story.
- Drizzle keeps the schema fixed, code-reviewed, and migration-driven.
- npm workspaces match the toolchain already installed on this machine.
- The OpenAI integration is designed around the Responses API plus function calling and structured outputs, while keeping business rules deterministic in application code.

## First commands

```bash
npm install
npm run db:up
npm run migrate:up --workspace @codex/db
npm run seed:source-precedence --workspace @codex/db
npm run sync:hevy --workspace @codex/api
npm run import:strongdad:hevy --workspace @codex/api
npm run test
npm run build
```

Then run the two services separately:

```bash
set -a && source .env
npm run dev:api
npm run dev:web
```

## Database commands

```bash
npm run db:up
npm run db:down
npm run migrate:up --workspace @codex/db
npm run seed:source-precedence --workspace @codex/db
npm run sync:calendar --workspace @codex/api
npm run sync:hevy --workspace @codex/api
npm run import:hevy:routine-json --workspace @codex/api -- --input /absolute/path/to/routine.json --dry-run
npm run import:strongdad:hevy --workspace @codex/api
npm run seed:dashboard-users --workspace @codex/api
npm run configure:telegram-webhook --workspace @codex/api -- --drop-pending-updates
npm run check:telegram-webhook --workspace @codex/api
npm run run:ops-monitor --workspace @codex/api -- --dry-run
npm run check:production
npm run check:live
npm run test:full
npm run run:scoring --workspace @codex/api -- --date 2026-03-15
npm run send:weight-prompt --workspace @codex/api -- --date 2026-03-15 --dry-run
npm run send:checkin-prompt --workspace @codex/api -- --date 2026-03-15 --dry-run
npm run send:missed-workout-follow-up --workspace @codex/api -- --date 2026-03-14 --dry-run
npm run send:morning-brief --workspace @codex/api -- --date 2026-03-14 --dry-run
npm run run:coaching-rhythm --workspace @codex/api -- --now 2026-03-15T07:00:00Z --dry-run
```

## Planning commands

Use the morning brief job to generate or send the first deterministic Telegram brief.

```bash
set -a && source .env
npm run send:morning-brief --workspace @codex/api -- --date 2026-03-14 --dry-run
```

Prompt jobs for the first coaching loop:

```bash
set -a && source .env
npm run run:scoring --workspace @codex/api -- --date 2026-03-15
npm run send:weight-prompt --workspace @codex/api -- --date 2026-03-15 --dry-run
npm run send:checkin-prompt --workspace @codex/api -- --date 2026-03-15 --dry-run
npm run send:missed-workout-follow-up --workspace @codex/api -- --date 2026-03-14 --dry-run
npm run run:coaching-rhythm --workspace @codex/api -- --now 2026-03-15T13:00:00Z --dry-run
```

The hourly rhythm job is the production entrypoint for coaching nudges. It safely decides whether to send the morning brief, Sunday weight prompt, the next check-in, or a missed-workout follow-up based on local time. The Render cron service should use the same secrets as the API service.

The operations monitor is the production entrypoint for reliability checks. It inspects source freshness, recent job runs, and open operator alerts, then optionally notifies the configured Telegram alert chat.

```bash
set -a && source .env
npm run run:ops-monitor --workspace @codex/api -- --dry-run
```

To make the dashboard sign-in usable, populate the `DASHBOARD_*` credentials in `.env` and run:

```bash
set -a && source .env
npm run seed:dashboard-users --workspace @codex/api
```

`seed:dashboard-users` is now safe to include in deployment bootstrap. If the dashboard credentials are not configured yet, it skips cleanly instead of failing the deploy.

Auth and state endpoints are available from the API service:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /access-grants`
- `POST /access-grants/grant`
- `POST /access-grants/revoke`
- `GET /day-templates`
- `POST /day-templates`
- `GET /nutrition-targets`
- `POST /nutrition-targets`
- `GET /ops/status`
- `GET /state/daily?date=YYYY-MM-DD`
- `GET /state/weekly?weekStart=YYYY-MM-DD`

The web app now expects `NEXT_PUBLIC_API_BASE_URL` so the browser can talk to the API directly with `credentials: include`.

Cookie-authenticated write routes are now origin-protected. `POST /auth/logout`, `POST /access-grants/*`, `POST /day-templates`, and `POST /nutrition-targets` require `Origin` or `Referer` to match `WEB_BASE_URL`. The dashboard already does this naturally in the browser; direct scripts and external clients must send the same origin intentionally.

The API and web app also now set a small default hardening header set on every response:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Full-system test

Run the full-system integration script from the workspace root:

```bash
npm run test:full
```

This orchestrates:

- workspace typecheck and builds
- database migrations and source-precedence seeding
- dashboard-user bootstrapping
- API unit and route tests
- dry-run coaching jobs
- deterministic score and engagement generation
- dry-run operator monitoring
- live optional syncs for configured providers
- DB-backed nutrition and coaching service integration checks
- authenticated API route checks
- dashboard browser smoke test

Apple Fitness and Apple Workout via HealthKit are the active cardio path for v1. The Strava connector is still in the repo as a future optional integration, but it is not part of the default setup or the default full-system test run.

Before a real deployment, run:

```bash
npm run check:production
```

That prints missing required and recommended production variables from your current env.

After deployment, run:

```bash
npm run check:live
```

That verifies the live API health route, live web app, dashboard login, `/ops/status`, and Telegram webhook URL against the current env.

Telegram also understands simple grant-management phrases:

- `show access grants`
- `give my trainer access to nutrition data`
- `revoke my nutritionist's access to weight data`

Telegram also understands simple weekly-template phrases:

- `show day templates`
- `set sunday to swim light morning`
- `set thursday to cardio intervals intense evening`

Telegram also understands simple nutrition-target phrases:

- `show nutrition targets`
- `set calorie target to 2200`
- `set nutrition targets to 2200 calories 190 protein 35 fibre`

Telegram meal logging now supports:

- `lunch was 650 cals`
- `ate chicken wrap and crisps`
- `breakfast: greek yogurt and banana`

Text meal logging uses the OpenAI Responses API when a valid API key is configured, and falls back to a lower-confidence heuristic estimate for common foods when that key is missing or invalid.

For richer meal analysis outside Telegram, there is also a local MyFitnessPal helper script:

```bash
set -a && source .env
npm run meal:mfp -- --text "Lunch was chicken wrap and crisps"
npm run meal:mfp -- --image /absolute/path/to/meal.jpg
npm run meal:mfp -- --text "poke bowl" --image /absolute/path/to/meal.jpg --json
npm run meal:mfp -- --bootstrap-login
npm run meal:mfp:log -- --text "Lunch was chicken wrap and banana" --dry-run
```

The helper estimates likely ingredients, portions, macros, and confidence from minimal text and/or meal photos. `--bootstrap-login` opens a persistent Playwright browser profile in `.codex-local/myfitnesspal-profile` so the eventual diary automation can reuse the same logged-in session without storing your password in code.

For a live Chrome-based logging pass against your normal logged-in MyFitnessPal tab, keep an authenticated MyFitnessPal tab open in Google Chrome with `View > Developer > Allow JavaScript from Apple Events` enabled, then run:

```bash
set -a && source .env
npm run meal:mfp:log -- --text "Lunch was chicken wrap and banana"
npm run meal:mfp:log -- --image /absolute/path/to/meal.jpg --dry-run
```

`meal:mfp:log` uses the shared meal-analysis service to infer ingredients from minimal text and/or photos, searches MyFitnessPal for likely matches, chooses a serving, and submits the items into the diary for the inferred meal slot. Use `--dry-run` to preview the plan without changing the diary.

Hevy custom routine JSON import is also supported:

```bash
set -a && source .env
npm run import:hevy:routine-json --workspace @codex/api -- --input /Users/scott/Projects/Codex/data/hevy/30kg-full-body-barbell-circuit.json --dry-run
npm run import:hevy:routine-json --workspace @codex/api -- --input /Users/scott/Projects/Codex/data/hevy/30kg-full-body-barbell-circuit.json
```

If the input includes multiple exercises with the same round count plus `restBetweenRoundsSeconds`, the importer encodes the routine as a Hevy superset/circuit by assigning a shared `superset_id`, zero rest between exercises, and round rest on the final exercise in the group.

Nutrition targets can now be stored in the app via the dashboard or Telegram. Optional values in `.env` still work as fallback defaults until an in-app target set is saved:

- `DAILY_CALORIE_TARGET`
- `DAILY_PROTEIN_TARGET`
- `DAILY_FIBRE_TARGET`

When configured, the API and dashboard will expose consumed vs remaining nutrition budget for the day.

## Production rollout

1. Deploy the Render blueprint in [render.yaml](/Users/scott/Projects/Codex/render.yaml).
2. Set all required API secrets plus the dashboard credentials in the Render web service and shared cron services.
3. Point `API_BASE_URL`, `WEB_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL` at the live Render URLs.
4. Configure backup storage with the `BACKUP_S3_*` variables.
5. The API service pre-deploy step will automatically run DB migrations, seed source precedence, and attempt dashboard-user seeding.
6. If you change dashboard credentials after the first deploy, reseed the dashboard users:

```bash
set -a && source .env
npm run seed:dashboard-users --workspace @codex/api
```

7. Configure the Telegram webhook against the live API:

```bash
set -a && source .env
npm run configure:telegram-webhook --workspace @codex/api -- --drop-pending-updates
npm run check:telegram-webhook --workspace @codex/api
```

8. Verify the live operator panel in the user dashboard and confirm that the `operations-monitor`, `coaching-rhythm`, `hevy-sync`, `google-calendar-sync`, and `nightly-backup` cron jobs are all reporting healthy.

The fuller rollout/runbook is in [production-rollout.md](/Users/scott/Projects/Codex/docs/production-rollout.md).

## Google Cloud rollout

Google Cloud is also a good fit for `46KG`, especially if you already have an account.

The recommended GCP mapping is:

- Cloud Run service for `46kg-api`
- Cloud Run service for `46kg-web`
- Cloud Run jobs for `coaching-rhythm`, `hevy-sync`, `google-calendar-sync`, and `operations-monitor`
- Cloud Scheduler for job triggers
- Cloud SQL for PostgreSQL
- Secret Manager for secrets
- Artifact Registry for images

The GCP-specific runbook is here:

- [Google Cloud rollout](/Users/scott/Projects/Codex/docs/google-cloud-rollout.md)

Container build files are ready:

- [Dockerfile.api](/Users/scott/Projects/Codex/Dockerfile.api)
- [Dockerfile.web](/Users/scott/Projects/Codex/Dockerfile.web)
- [cloudbuild.api.yaml](/Users/scott/Projects/Codex/cloudbuild.api.yaml)
- [cloudbuild.web.yaml](/Users/scott/Projects/Codex/cloudbuild.web.yaml)

## Key docs

- [Implementation research](/Users/scott/Projects/Codex/docs/implementation-research.md)
- [Integration spikes](/Users/scott/Projects/Codex/docs/integration-spikes.md)
