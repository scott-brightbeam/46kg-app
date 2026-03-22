# StrongDad To Hevy

This workflow converts the text-extractable StrongDad PDF into a reviewable intermediate JSON file before any Hevy API writes happen.

## Current source

- PDF: [Strongdad 50.pdf](/Users/scott/Documents/Strength&/StrongDad/Strongdad%2050.pdf)
- Extractor: [extract_strongdad_50.py](/Users/scott/Projects/Codex/scripts/extract_strongdad_50.py)
- Output: [strongdad-50.workouts.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-50.workouts.json)

## Run it

```bash
source .venv/bin/activate
python scripts/extract_strongdad_50.py \
  '/Users/scott/Documents/Strength&/StrongDad/Strongdad 50.pdf' \
  data/strongdad/strongdad-50.workouts.json
```

## Validate it

```bash
python3 scripts/validate_strongdad_50.py \
  data/strongdad/strongdad-50.workouts.json \
  --json-output data/strongdad/strongdad-50.validation.json \
  --markdown-output data/strongdad/strongdad-50.validation.md
```

## Output shape

Each workout entry includes:

- `number`
- `title_raw`
- `title`
- `source_page`
- `instructions`
- `hevy_folder`
- `hevy_notes`
- `score_mode`
- `rounds`
- `rest_seconds`
- `time_cap_seconds`
- `candidate_exercises`
- `needs_manual_review`

## What maps cleanly

- Simple challenge workouts with one or two standard movements
- Repetition ladders
- Timed efforts with clear notes
- Distance or duration efforts that can live in Hevy set fields

## What still needs human cleanup

- Strongman-specific movements that may need custom exercise templates
- Mixed running and bodyweight circuits described as prose
- Scoring rules like "record your time", "distance covered", or "max reps in 60 seconds"
- Pages where the PDF text extraction still leaves awkward spacing in names

## Recommended import process

1. Review the generated JSON and clean titles or movement names where needed.
2. Mark which workouts are safe for automatic routine creation.
3. Create any missing custom Hevy exercise templates first.
4. Post routines into a dedicated Hevy folder such as `StrongDad 50`.
5. Keep the original `instructions` in Hevy routine notes so no source detail is lost.

## Known quirk

The PDF includes a duplicate `NO. 41` page. The extractor keeps the first instance and records the duplicate under `duplicate_pages_skipped`.

## Curated first batch

- Curated JSON: [strongdad-first-batch.curated.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.curated.json)
- Readable preview: [strongdad-first-batch.curated.md](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.curated.md)
- Validation: [strongdad-first-batch.validation.md](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.validation.md)

## Build the Hevy import plan

This job reads the curated batch, fetches the live Hevy template, folder, and routine catalog, then produces a dry-run plan.

```bash
set -a && source .env
npm run import:strongdad:hevy --workspace @codex/api
```

Outputs:

- Plan JSON: [strongdad-first-batch.hevy-plan.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.hevy-plan.json)
- Plan Markdown: [strongdad-first-batch.hevy-plan.md](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.hevy-plan.md)

## Execute the import

This writes to the live Hevy account, so keep it as an explicit second step.

```bash
set -a && source .env
npm run import:strongdad:hevy --workspace @codex/api -- --execute
```

Execution artifact:

- Result JSON: [strongdad-first-batch.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.hevy-execution.json)

## Live result on March 14, 2026

- Folder created in Hevy: `StrongDad 50`
- Routines imported: `14`
- Custom exercise templates created or reused: `15`
- Verification artifact: [strongdad-first-batch.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-first-batch.hevy-execution.json)

## Daily menu extraction

The `Daily workouts` folder turned out to be a better source than the compiled books for bulk import.

- Source folder: [/Users/scott/Documents/Strength&/StrongDad/Daily workouts](/Users/scott/Documents/Strength&/StrongDad/Daily%20workouts)
- Extractor: [extract_daily_menus.py](/Users/scott/Projects/Codex/scripts/extract_daily_menus.py)
- Validator: [validate_curated_batch.py](/Users/scott/Projects/Codex/scripts/validate_curated_batch.py)

Run it:

```bash
cd /Users/scott/Projects/Codex
./.venv/bin/python scripts/extract_daily_menus.py \
  '/Users/scott/Documents/Strength&/StrongDad/Daily workouts' \
  data/strongdad/strongdad-daily.curated.json

./.venv/bin/python scripts/validate_curated_batch.py \
  data/strongdad/strongdad-daily.curated.json \
  --json-output data/strongdad/strongdad-daily.validation.json \
  --markdown-output data/strongdad/strongdad-daily.validation.md
```

Key artifacts:

- Full extracted batch: [strongdad-daily.curated.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-daily.curated.json)
- Safe sequence-only batch: [strongdad-daily.safe.curated.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-daily.safe.curated.json)
- Import-ready batch: [strongdad-daily.import-ready.curated.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-daily.import-ready.curated.json)
- Validation: [strongdad-daily.import-ready.validation.md](/Users/scott/Projects/Codex/data/strongdad/strongdad-daily.import-ready.validation.md)
- Hevy plan: [strongdad-daily.import-ready.hevy-plan.md](/Users/scott/Projects/Codex/data/strongdad/strongdad-daily.import-ready.hevy-plan.md)

## Daily menu live result on March 14, 2026

- Folder in Hevy: `StrongDad Daily Workouts`
- Curated daily PDFs extracted: `94`
- Import-ready routines selected: `50`
- Custom templates introduced for daily menus: `18`
- Final verification dry-run: `0` creates, `50` existing routines, `0` new customs remaining
- Final top-up execution artifact: [strongdad-daily.remaining.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/strongdad-daily.remaining.hevy-execution.json)

## Hevy write-rate limit behavior

Hevy accepted the bulk read and plan generation happily, but routine writes hit `429 Too Many Requests` when run too aggressively.

The importer now handles this by:

- retrying `429` responses with backoff
- pacing successful write requests with a small delay
- allowing the write pace and retry base delay to be tuned with `HEVY_WRITE_DELAY_MS` and `HEVY_429_RETRY_BASE_DELAY_MS`
- allowing partial imports to resume cleanly

Operationally, the safest recovery pattern is:

1. Re-run the dry-run plan against the full batch.
2. Filter to routines whose action is still `create`.
3. Execute only that missing subset.
4. If the subset still hits `429`, fall back to one routine per execution with a short cooldown between runs.

## Strength& Conditioning Menu

This source lives outside the `StrongDad` folder but maps well once curated manually.

- Source PDF: [STRENGTH& Conditioning Menu.pdf](/Users/scott/Documents/Strength&/Content/Lockdown%202/STRENGTH%26%20Conditioning%20Menu.pdf)
- Curated builder: [build_conditioning_menu_cleaned.py](/Users/scott/Projects/Codex/scripts/build_conditioning_menu_cleaned.py)
- Cleaned batch: [conditioning-menu.cleaned.curated.json](/Users/scott/Projects/Codex/data/strongdad/conditioning-menu.cleaned.curated.json)
- Validation: [conditioning-menu.cleaned.validation.md](/Users/scott/Projects/Codex/data/strongdad/conditioning-menu.cleaned.validation.md)
- Hevy plan: [conditioning-menu.cleaned.hevy-plan.md](/Users/scott/Projects/Codex/data/strongdad/conditioning-menu.cleaned.hevy-plan.md)
- Execution: [conditioning-menu.cleaned.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/conditioning-menu.cleaned.hevy-execution.json)

Live result on March 14, 2026:

- Folder created in Hevy: `Strength& Conditioning Menu`
- Routines imported: `31`
- Custom exercise templates created: `19`
- Verification dry-run after import: `0` creates and `0` new custom templates remaining
- The source PDF contains two different workouts both printed as `Workout #26`; the curated batch preserves that numbering, so Hevy now contains both `26. Top Of The Table` and `26. Superstarjacks`

## ROGUE 3

The `ROGUE 3` weekly PDFs were clean enough to justify a fully curated batch rather than OCR-heavy repair.

- Source folder: [/Users/scott/Documents/Strength&/Content/Lockdown 3](/Users/scott/Documents/Strength&/Content/Lockdown%203)
- First-pass extractor: [extract_rogue3.py](/Users/scott/Projects/Codex/scripts/extract_rogue3.py)
- Curated builder: [build_rogue3_cleaned.py](/Users/scott/Projects/Codex/scripts/build_rogue3_cleaned.py)
- Cleaned batch: [rogue3.cleaned.curated.json](/Users/scott/Projects/Codex/data/strongdad/rogue3.cleaned.curated.json)
- Validation: [rogue3.cleaned.validation.md](/Users/scott/Projects/Codex/data/strongdad/rogue3.cleaned.validation.md)
- Initial Hevy plan: [rogue3.cleaned.hevy-plan.md](/Users/scott/Projects/Codex/data/strongdad/rogue3.cleaned.hevy-plan.md)
- Final verification plan: [rogue3.final.hevy-plan.md](/Users/scott/Projects/Codex/data/strongdad/rogue3.final.hevy-plan.md)
- Single-routine execution artifacts:
  - [rogue3.single.41.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/rogue3.single.41.hevy-execution.json)
  - [rogue3.single.42.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/rogue3.single.42.hevy-execution.json)
  - [rogue3.single.43.hevy-execution.json](/Users/scott/Projects/Codex/data/strongdad/rogue3.single.43.hevy-execution.json)

Live result on March 14, 2026:

- Folder created in Hevy: `ROGUE 3`
- Routines imported: `43`
- Custom templates required for this library: `21`
- Alias cleanup reduced the custom-template count from `30` to `21`
- Final verification dry-run after import: `0` creates, `43` routine updates, `0` custom templates remaining
- Bulk create partially succeeded before hitting `429`, so the final three routines were topped up one at a time: `41. Against The Ropes`, `42. Caseload Of Hard`, and `43. Log Jamming`

## Hevy response quirks found live

These differed from the public docs and are now handled in code:

- `POST /v1/routine_folders` returned `{ "routine_folder": { ... } }`
- `POST /v1/exercise_templates` returned a bare UUID string
- `POST /v1/routines` returned `{ "routine": [ ... ] }`
