# Implementation Research

This document turns the PRD into implementation decisions with current vendor constraints in mind.

## High-confidence decisions

- Use the OpenAI Responses API for Zaphod and keep business rules outside the model.
  Reason: the official OpenAI guidance favors tool-using, structured agent workflows through the Responses stack and function calling, which matches the coaching agent shape better than free-form chat generation.
- Use function calling plus structured outputs for all write paths.
  Reason: day-template updates, consent changes, meal logs, and plan generation need typed inputs and deterministic validation before persistence.
- Keep engagement logic, grant checks, and stale-data handling deterministic in application code.
  Reason: these rules are safety-critical and directly tied to consent and reporting.
- Keep meal-photo interpretation in a bounded analysis tool.
  Reason: image input is appropriate for extraction and estimation, but the confirmation step must remain explicit.
- Use Fastify plus explicit webhook handlers rather than a bot framework-first design.
  Reason: Telegram, Health Auto Export, and future provider callbacks are all HTTP-first.
- Use Google Calendar incremental sync with stored sync tokens, not repeated full syncs.
  Reason: Google’s sync model is designed for long-running clients and reduces duplicate processing.
- Use Postgres-backed scheduling and job orchestration before introducing Redis.
  Reason: the product already depends on Postgres, and the workload is single-user, high-importance, low-concurrency.

## Source-backed constraints

### OpenAI

- Use tool calling and structured outputs for typed agent actions.
  Sources:
  [Function calling](https://platform.openai.com/docs/guides/function-calling)
  [Structured outputs](https://platform.openai.com/docs/guides/structured-outputs)
- Use image input for meal photos rather than a separate CV stack at v1.
  Source:
  [Images and vision](https://platform.openai.com/docs/guides/images-vision)
- Keep moderation available as a guardrail for free-text and image flows that might wander outside the coaching boundary.
  Source:
  [Moderation guide](https://platform.openai.com/docs/guides/moderation)

### Telegram

- `setWebhook` supports a `secret_token` and Telegram sends it back in `X-Telegram-Bot-Api-Secret-Token`.
- Webhook delivery can be tuned with `max_connections`.
- Pending updates can be cleared with `drop_pending_updates`.
  Source:
  [Telegram Bot API](https://core.telegram.org/bots/api)

### Apple Fitness and HealthKit-first cardio

- For v1, cardio should be treated as a HealthKit problem, not a Strava problem.
- Apple Fitness and Apple Workout sessions arrive through Health Auto Export and share the same best-effort iOS delivery constraints as the rest of HealthKit.
- That means cardio detection, stale-data handling, and missed-workout logic should be anchored to HealthKit freshness rather than a separate Strava-specific sync path.
- Strava can remain an optional future connector for richer GPS detail, but it should not be part of the critical path for the first working product.

### Hevy

- Hevy exposes an official Swagger UI and currently documents API-key auth through the `api-key` header.
- The public API currently includes user info, paginated workouts, workout events for incremental updates and deletes, routines, exercise templates, routine folders, and exercise history.
- The docs explicitly warn that the API is early, may change completely, or may be abandoned, so the integration should stay append-only and easy to replace.
  Source:
  [Hevy API docs](https://api.hevyapp.com/docs/)

### Google Calendar

- Implement an initial full sync, persist `nextSyncToken`, then perform incremental syncs.
- A `410` response invalidates the token and requires wiping the local mirror and performing a fresh full sync.
- Incremental syncs must preserve the allowed parameter set from the initial sync and avoid disallowed filters such as `timeMin`, `timeMax`, and `orderBy` when using `syncToken`.
  Source:
  [Google Calendar incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync)

### Render

- Cron jobs are defined with cron expressions and run on UTC.
- Render provides point-in-time recovery on paid Postgres plans, but exported logical backups are the safer long-retention path.
- Render retains logical backups created in the dashboard for seven days, which is why the PRD’s external backup bucket is the right primary control.
  Sources:
  [Cron jobs](https://render.com/docs/cronjobs)
  [Postgres backups and recovery](https://render.com/docs/postgresql-backups)

### Health Auto Export

- REST automations only run while the iPhone is unlocked.
- iOS background execution is best-effort and can be delayed by low power mode, disabled background refresh, inactivity, or system resource pressure.
- The documented REST payload supports structured `data.metrics` series and `data.workouts` sessions, which makes raw ingest plus conservative normalization a practical first implementation.
  Source:
  [Health Auto Export REST API automation](https://help.healthyapps.dev/en/health-auto-export/automations/rest-api)

## Architecture decisions that follow from the research

### 1. Agent boundary

- Zaphod should never write directly to the database.
- Zaphod should only call typed application functions.
- Every tool call should be validated with Zod and logged with actor, timestamp, input, and result summary.

### 2. Data ingestion

- Store raw provider payloads first in `ingest_events`.
- Normalize into append-only landing tables.
- Apply canonical-source reconciliation during normalization.
- Recalculate derived scores when backfilled data changes a day’s canonical facts.

### 3. Scheduling and jobs

- Use a Postgres-backed queue for morning briefs, evening reviews, sync jobs, retry jobs, and score recalculation.
- Run nightly backups and monthly restore checks as explicit scheduled jobs.
- Separate the always-on API service from the worker process.

### 4. Auth and consent

- Keep auth state server-side.
- Check access grants on every practitioner request.
- Revalidate sessions immediately on next request and no later than five minutes after revocation.
- Treat `engagement_status` as a separate data class.

### 5. Testing strategy

- Add integration tests around webhook idempotency, stale-data handling, canonical workout selection, and grant revocation.
- Add evaluation fixtures for Zaphod’s tone, safety boundaries, and structured tool-call quality.
- Keep a replayable set of raw ingest payloads for regression testing.

## Recommended implementation order

1. Land the data model and queue foundation.
2. Add raw ingest plus normalization for Health Auto Export, Hevy, and Calendar, with Apple Fitness and Apple Workout handled through HealthKit.
3. Add Telegram webhook security, idempotency, and outbound messaging.
4. Add constrained OpenAI tools and the initial Zaphod system prompt.
5. Add scoring, engagement-state transitions, and stale-data protections.
6. Add web auth, scoped dashboard queries, and access logging.
