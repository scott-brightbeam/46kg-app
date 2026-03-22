# Integration Spikes

These are the parts of the system that should be treated as explicit spikes before deeper feature work.

## Hevy API

Hevy now exposes an official Swagger UI at [api.hevyapp.com/docs](https://api.hevyapp.com/docs/). The current public surface is API-key based and includes:

- `GET /v1/user/info`
- `GET /v1/workouts/events` for incremental workout updates and deletes
- `GET /v1/workouts/{workoutId}` and paginated `GET /v1/workouts`
- paginated `GET /v1/routines`
- exercise templates, routine folders, and exercise history endpoints

The API docs explicitly warn that the structure may change or be abandoned, so the integration should still be treated as a provider spike rather than a permanent contract.

Exit criteria:

- capture real sample responses for workouts, workout events, and routines into fixtures
- define pagination, retry, and backfill behavior for `workouts/events`
- confirm whether rate limits are enforced or surfaced in headers
- confirm whether trainer-created planned routines are fully represented by `routines` or require an additional workflow in Hevy

Current live validation on March 14, 2026:

- API key authentication works against `GET /v1/user/info`
- the tested account currently returns `workout_count: 0`
- `GET /v1/workouts/events` returned `{ page, page_count, workouts: [] }` rather than the documented `events` key when the result set was empty
- `POST /v1/routine_folders` returned `{ "routine_folder": { ... } }` rather than a flat folder object
- `POST /v1/exercise_templates` returned a bare UUID string rather than JSON
- `POST /v1/routines` returned `{ "routine": [ ... ] }` rather than a single routine object
- bulk routine writes hit `429 Too Many Requests` unless the client paces requests and retries with backoff

Implementation note:

- keep the sync tolerant of both `events` and `workouts` response keys on the events endpoint until real non-empty samples confirm the stable contract
- keep write-path parsing tolerant of nested folder payloads, bare string template ids, and array-wrapped routine payloads
- keep write-path execution rate-limited and resumable so partial imports can be safely topped up with a missing-only batch
- for larger routine libraries, keep a single-routine fallback path available because repeated `POST /v1/routines` calls can still hit provider-side cooldowns even after batch retries

## Health Auto Export payload contract

Even though the REST automation is documented, the exact payload shapes you receive should be snapshotted early.

Exit criteria:

- capture real sample payloads into `fixtures/health-auto-export/`
- define normalization rules for workouts vs metrics
- confirm whether manual weight writes back into Apple Health are supported for your chosen workflow

## Google Calendar scope design

The current PRD assumes Google Calendar as the scheduling source of truth. Before deeper dashboard work, decide whether read-only access is sufficient or whether reserved backup slots should ever be written back.

Exit criteria:

- choose readonly vs read/write scope
- document calendar merge behavior when events move or are deleted
- confirm how protected blocks are represented locally
