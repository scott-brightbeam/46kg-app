# PRD v0.3 - AI Health Tracking Agent and Coaching System

| Field | Value |
| --- | --- |
| Version | 0.3 |
| Date | 14 March 2026 |
| Author | Scott Wilkinson |
| Status | Build-ready draft |
| Classification | Personal project - not for commercial release in v1 |

-----

## 1. Product summary

Build a personal AI health management system designed to help a single user move from 136 kg to 90 kg through sustained behaviour change, not short bursts of enthusiasm.

The product is two things at once: a health operating system that unifies exercise, recovery, nutrition, weight, scheduling and coaching; and an anti-dropout system that detects wobble early, replans fast and keeps the user engaged after the first missed days.

### 1.1 Core surfaces

- Telegram as the primary interaction surface - conversational, single-question data collection via an AI coaching persona named Zaphod
- Apple Watch as the monitoring and data collection centre - strength workouts via Hevy, cardio and general exercise via Apple Fitness / Apple Workout through HealthKit
- Responsive web dashboard (mobile, tablet, desktop) as the shared intelligence view with authenticated, scoped access for user, trainer, and nutritionist
- Backend on Render - API server, data lake, AI orchestration, scheduled tasks

### 1.2 Key architectural decisions

- OpenAI as the reasoning engine (GPT-5 family via the OpenAI API), powering Zaphod’s coaching persona
- ChatGPT Pro subscription used for Codex-driven development; runtime inference uses separately billed OpenAI API access
- Codex as the development agent, deploying via GitHub to Render
- Hevy for strength training (public API with MCP server), replacing Gymaholic
- Apple Fitness / Apple Workout via HealthKit for cardio and general exercise in v1; Strava deferred as an optional future connector
- Health Auto Export as the HealthKit-to-backend bridge
- Fixed PostgreSQL schema with constrained application-level tools - Zaphod interacts through defined functions, not raw SQL
- Authenticated dashboard with scoped panels per role - not a shared open URL
- Trainer works natively in Hevy; system reads via API

-----

## 2. Problem statement

The user does not mainly fail because they lack information. The failure mode is behavioural collapse after disruption.

### 2.1 Typical failure pattern

- Motivation is high for two to three weeks
- Routine breaks for a few days
- Guilt and friction rise
- Logging stops
- Training stops
- Healthy eating decays
- The whole effort falls into a ditch

### 2.2 Design imperatives

The product must optimise for: continuity over perfection; relapse recovery over streak worship; low-friction data capture; intelligent replanning when life gets messy; and honest accountability without becoming punitive.

Every design decision should be tested against a single question: does this make it more likely the user is still using the system in 90 days?

-----

## 3. Product goals

### 3.1 Primary goal

Help the user reach 90 kg in a sustainable way while improving fitness, recovery, consistency and confidence. Target rate: 0.75 kg per week, giving an estimated timeline of approximately 61 weeks (14 to 15 months). Daily calorie deficit of approximately 825 kcal.

### 3.2 Secondary goals

- Make it effortless to understand what is happening each day - via a morning Telegram brief, not a dashboard the user has to seek out
- Make exercise scheduling realistic around work, family and sleep
- Make nutrition planning practical for family life - including meal plans, recipe suggestions, and shopping lists for a household of four
- Give trainer and nutritionist scoped, authenticated access to the data they need
- Create an engagement loop that survives missed days
- Minimise friction in every data capture interaction - single-question Telegram exchanges, not forms

-----

## 4. Non-goals

For v1, this product is not:

- A medical diagnosis tool
- A replacement for a GP, clinician, trainer or dietitian
- A medication recommendation system
- An extreme cutting or bodybuilding platform
- A public social network or multi-user platform
- A workout creation tool - the trainer uses Hevy natively for programme design
- A native iOS or Android app - the interface is Telegram plus a responsive web dashboard
- A commercial product - this is a personal tool in v1

-----

## 5. Users and personas

### 5.1 Primary user

Adult male, 136 kg, trying to lose significant weight while coordinating exercise, meals and recovery within a busy family and work schedule. Works in consulting with variable meeting load. Based between Ireland and the UK. Exercises with a combination of strength training and cardio. Has a history of starting strong and dropping off after disruption. Technically literate but not a developer. Interacts primarily via Telegram on iPhone.

No current injuries, mobility limitations, or cardiovascular concerns. No medications affecting heart rate, energy, appetite, or weight.

**Pain points**

- Logging feels like a chore when motivation dips
- Plans break when life gets busy and there is no automatic replanning
- Multiple apps create fragmented data with no single view
- Guilt after missed days leads to avoidance rather than recovery
- Meal planning for a family while maintaining a calorie deficit is time-consuming

**Jobs to be done**

- Know what to do today without thinking about it
- Log meals with minimum effort and reasonable accuracy
- See whether the trajectory is working over weeks, not days
- Get back on track after disruption without starting from scratch
- Feed the family well without maintaining separate meal plans

### 5.2 Personal trainer

Designs exercise programmes, reviews compliance, adjusts routines. Works natively inside Hevy to create and manage workout plans. Reviews performance and adherence data via an authenticated dashboard view scoped to workout data, strength progression, and adherence scores. Cannot see nutrition intake, weight data, or engagement status unless the user explicitly grants access to those categories.

### 5.3 Nutritionist

Sets calorie and macro targets, reviews intake patterns, adjusts meal strategy. Reviews data via an authenticated dashboard view scoped to calorie and macro intake, weight trends, meal logging coverage, and meal plans. Cannot see workout specifics or engagement status unless the user explicitly grants access.

### 5.4 Household

Family of four - two adults and two teenagers. No food allergies or intolerances. Household dislikes: mushrooms. No budget constraint on groceries - quality and nutrition prioritised over cost. Meals cooked fresh each night, no batch-cooking. Maximum weeknight prep and cook time: up to an hour.

-----

## 6. Product principles

- Adherence beats ambition
- Plan for failure, not fantasy
- One source of truth - with canonical-source rules and deduplication
- Coach with context
- Reduce friction everywhere
- Every recommendation must be explainable
- Treat trust like porcelain, not a football
- Single questions, not forms
- The system should recover faster than the user can quit
- Data minimisation - each role sees only what it needs

-----

## 7. Architecture overview

### 7.1 Five-layer architecture

| Layer | Components | Role |
| --- | --- | --- |
| Data collection | Apple Watch, Hevy, Apple Fitness, Apple Workout | Sensors, workout execution, passive health metrics |
| Data bridge | Health Auto Export, Hevy API | Moves data from collection devices to backend |
| Backend and data lake | Render (Web Service + Background Worker + PostgreSQL) | Stores all data, runs scoring, hosts API, executes scheduled tasks |
| AI and conversation | OpenAI API (Zaphod persona), Telegram Bot API | Reasoning, coaching, replanning, data collection via conversation |
| Dashboard | Authenticated responsive web app on Render | Scoped intelligence views for user, trainer, nutritionist |

### 7.2 Technology stack

| Component | Technology | Cost |
| --- | --- | --- |
| Development agent | OpenAI Codex via ChatGPT Pro | Included in subscription |
| Source control | GitHub | Free |
| Hosting - backend | Render Background Worker | Approximately $7/month |
| Hosting - web services | Render Web Service | Free tier or $7/month |
| Hosting - dashboard | Render Web Service (authenticated) | Included above |
| Database | Render Managed PostgreSQL | Approximately $7/month |
| Backup storage | S3-compatible bucket (e.g. Backblaze B2, Cloudflare R2) | < $1/month |
| AI reasoning | OpenAI API (GPT-5 family) | Usage-based |
| Conversation surface | Telegram Bot API | Free |
| Exercise - strength | Hevy API (requires Pro subscription) | Approximately $10/month |
| Exercise - cardio | Apple Fitness / Apple Workout via HealthKit | Included in Apple ecosystem |
| Health data bridge | Health Auto Export (iOS app) | Approximately $10 one-time |
| Food database - barcodes | Open Food Facts API | Free, no auth |
| Food database - unbranded | USDA FoodData Central API | Free, API key |
| Meal photo estimation | OpenAI Vision API | Usage-based |
| Calendar | Google Calendar API | Free |

### 7.3 Data lake architecture

The PostgreSQL database uses a fixed schema designed upfront. All schema changes are managed through code migrations via Codex, reviewed in pull requests, and deployed through the normal pipeline. Zaphod does not have direct SQL access. It interacts with data through constrained application-level tools.

**Raw ingest tables (append-only)**

These tables store incoming payloads and ingest metadata exactly as received, before normalization and reconciliation. They exist for audit, debugging, replay, and vendor-change detection.

- ingest_events - raw webhook or poll payloads, source metadata, received_at timestamp, validation status, processing status, and replay marker

**Normalized landing tables (append-only)**

These tables receive normalized source records after validation, deduplication, and reconciliation. They remain append-only after insertion.

- health_metrics - normalized HealthKit data pushed by Health Auto Export
- hevy_workouts - normalized workout history polled from Hevy API
- healthkit_workouts - normalized Apple Fitness / Apple Workout sessions pushed via Health Auto Export
- calendar_events - normalized schedule data from Google Calendar API
- dedup_matches - audit table recording matched duplicate records, source pair, overlap score, canonical record, and superseded record

**Application tables (managed via migrations)**

These tables have fixed schemas. Application code reads from and writes to them through defined functions. Schema changes require a code migration.

- day_templates - default weekly schedule patterns
- daily_plans - generated daily plans combining template, calendar, and health signals
- engagement_status - deterministic engagement level (green/amber/red) with trigger reasons
- scores - adherence, effort, recovery, consistency (versioned formulas stored in metric_definitions)
- meal_logs - captured meals with calorie and macro estimates, estimation method, and confidence level
- checkin_responses - subjective daily inputs
- weight_entries - manual weight recordings
- meal_plans - weekly dinner plans and recipe selections
- shopping_lists - generated ingredient lists
- pantry_inventory - tracked fridge, freezer, and cupboard items
- metric_definitions - versioned definitions for every derived metric
- dashboard_config - chart and widget configuration
- conversation_log - record of Telegram interactions for context
- users - authenticated accounts (user, trainer, nutritionist)
- access_grants - granular consent records for data sharing by data category
- access_log - audit trail of all data access by practitioners
- source_precedence - canonical source rules for data reconciliation
- processed_updates - Telegram update_id log for idempotency

**Governance rules**

- Nightly `pg_dump` via Render cron job, uploaded to S3-compatible storage. 30-day retention enforced by lifecycle policy on the bucket.
- Monthly backup verification: restore to a test database and confirm data integrity.
- All schema changes are code migrations, version-controlled in GitHub.
- Every derived metric has a versioned formula in metric_definitions.
- Raw ingest tables and normalized landing tables are append-only; application code enforces this constraint.

### 7.4 Data reconciliation

The same physical activity can produce records from multiple sources. The system resolves these to a single canonical record at ingest time.

**Canonical source rules**

| Activity type | Canonical source | Reason | Fallback |
| --- | --- | --- | --- |
| Strength training | Hevy API | Richest data: exercises, sets, reps, weight, rest times | HealthKit workout record |
| Cardio (outdoor run, cycle, swim) | HealthKit (via Health Auto Export) | Apple Fitness / Apple Workout is the active v1 cardio source | None |
| General exercise (walk, yoga, other) | HealthKit (via Health Auto Export) | Only source for untracked activity types | None |
| Heart rate, HRV, sleep, steps | HealthKit (via Health Auto Export) | Only source | None |
| Weight | Manual entry via Telegram | User-entered is canonical | Smart scale via HealthKit |

**Deduplication rules**

- At ingest, each new workout record is compared against existing records using a time-window overlap. If two records from different sources overlap by more than 80% of the shorter record’s duration, they are treated as the same session.
- The canonical-source record is retained. The secondary record is stored with a `superseded_by` reference but not used in scoring or reporting.
- Deduplication matches are stored in `dedup_matches` for auditability.

**Stale data handling**

- Each normalized landing table tracks `last_successful_ingest` timestamp per source.
- If a source has not delivered data for longer than its expected interval (configurable per source), the morning brief notes the gap: `I have not seen your watch data since [time].`
- Stale data never triggers engagement status changes. Missing HealthKit data is a sync issue, not a behavioural signal.
- For activities whose canonical source is HealthKit only, stale sync blocks automatic classification of the session as missed. The system may ask a neutral clarification question, but does not mark the plan missed until data freshness recovers or the user confirms non-completion.

**Backfill**

- When Health Auto Export delivers a batch after a delay (e.g. phone was off overnight), the ingest pipeline processes records in chronological order and applies dedup normally.
- Scores are recalculated for any day that receives backdated data.

### 7.5 Zaphod’s application tools

Zaphod interacts with data through a defined set of application-level functions. These are the only tools available to the AI agent. Each function has typed inputs, validates data before writing, and returns structured results.

**Data capture tools**

- `log_meal(description, calories, protein, carbs, fat, fibre, confidence, method)` - stores a meal entry
- `log_weight(kg)` - stores a weight entry with timestamp
- `log_checkin(field, value)` - stores a subjective check-in response
- `update_pantry(items, action)` - adds or removes pantry items
- `approve_meal_plan(plan_id)` - confirms a generated meal plan
- `set_day_template(day, activity_type, intensity, preferred_time, notes)` - creates or updates a weekly template entry

**Data query tools**

- `get_daily_summary(date)` - returns all data for a given day: workouts, meals, scores, check-ins
- `get_weekly_summary(week_start)` - returns aggregated weekly data
- `get_calorie_budget(date)` - returns remaining calories and macros for today
- `get_meal_plan(week_start)` - returns the current meal plan
- `get_pantry()` - returns current pantry inventory
- `get_hevy_routine(date)` - returns the planned Hevy routine for a given day
- `get_calendar_slots(date)` - returns free and busy slots for a given day
- `get_engagement_status()` - returns current green/amber/red status with reasons
- `get_weight_trend(weeks)` - returns weight data for the specified rolling window
- `get_access_grants(subject_user_id)` - returns current practitioner grants by category
- `get_data_freshness()` - returns last successful ingest time for each source

**Planning tools**

- `generate_meal_plan(days, constraints)` - produces dinner suggestions for the week
- `generate_shopping_list(plan_id)` - produces a shopping list from an approved plan, cross-referenced against pantry
- `generate_daily_plan(date)` - produces today’s plan from template, calendar, and health signals
- `suggest_lunch(date)` - suggests lunch options based on remaining calorie budget and dinner plan
- `offer_workout_alternative(original_plan, available_time)` - produces compressed or minimum-viable-day alternatives

**Consent and access tools**

- `grant_access(practitioner_id, categories, expires_at)` - grants practitioner access to specific categories
- `revoke_access(practitioner_id, categories)` - revokes access to specific categories immediately
- `list_access_categories()` - returns the supported grant categories and descriptions

**Communication tools**

- `send_telegram_message(text)` - sends a message to the user
- `send_telegram_photo(image_data, caption)` - sends an image with caption

**Analysis tools**

- `estimate_meal_from_photo(image_data)` - sends image to OpenAI Vision, returns calorie and macro estimate with confidence
- `lookup_barcode(barcode_string)` - queries Open Food Facts API, returns product nutrition data
- `estimate_meal_from_text(description)` - uses USDA data and OpenAI reasoning to estimate nutrition from a text description

**Grant categories**

- `exercise` - workouts, adherence, exercise schedule compliance, strength progression
- `nutrition` - calories, macros, meal logs, meal plans, shopping lists
- `weight` - manual or synced weight data and trends
- `engagement_status` - green/amber/red status and trigger reasons

-----

## 8. Functional requirements

### 8.1 Health data ingestion and insight engine

The system must ingest all authorised HealthKit data relevant to weight loss, recovery and exercise via Health Auto Export, which pushes JSON payloads to a REST endpoint on the backend.

**Data types ingested**

- Workout records, active energy, exercise minutes, steps, walking and running distance
- Heart rate, resting heart rate, walking heart rate average, HRV
- Sleep data including sleep stages
- Cardio fitness / VO2 max, cardio recovery
- Weight (from connected smart scale or manual entry)

**iOS background execution constraints**

Health Auto Export REST automations only run while the iPhone is unlocked. iOS may throttle or skip background tasks. The system must treat data delivery as best-effort, not guaranteed. Typical delivery: within two to four hours of recording. Worst case: data arrives in a batch when the user next unlocks their phone or manually opens the app.

The system must never assume the absence of data means the absence of activity. Missing data is a sync issue until proven otherwise.

**User stories**

As a **user**, I want **my Apple Watch health data to flow to the system automatically** so that I never have to manually export or sync anything.

> AC: Health Auto Export is configured to push data to the backend REST endpoint. Raw payloads are stored in `ingest_events`, normalized records appear in `health_metrics`, and the system tracks `last_successful_ingest`. If no data has arrived for eight or more hours, Zaphod alerts the user via Telegram and suggests opening Health Auto Export to trigger a sync.

As a **user**, I want **to see derived insights from my health data** so that I understand trends without interpreting raw numbers.

> AC: The system produces daily, weekly, and rolling-trend summaries for key metrics. Zaphod references these in coaching messages. Summaries note when data is stale: `Last watch sync: 11pm yesterday.`

**Derived metrics**

The scoring engine produces the following, each stored with a versioned formula in `metric_definitions`:

- Workout adherence score - planned vs completed workouts (canonical source records only, after dedup)
- Effort score - actual effort vs intended effort based on heart rate, duration, and perceived exertion
- Recovery score - composite of HRV, resting heart rate, sleep quality, and soreness
- Consistency score - rolling measure of logging and training regularity

Each metric distinguishes between raw signals, inferred signals, and coach-entered adjustments. Confidence scores and provenance are stored for all inferred outputs. Scores are recalculated when backdated data arrives.

### 8.2 Manual and subjective inputs

All manual inputs are collected via Telegram in single-question conversational exchanges. The system must never present a form or require the user to open a separate app to enter data.

**Required inputs**

- Weekly manual weight entry (prompted by Zaphod)
- Daily subjective check-ins collected one question at a time: sleep quality, hunger, stress, mood, soreness, illness, travel or disruption, alcohol intake
- Free-text notes when the user volunteers context

**Optional inputs**

- Waist measurement (prompted monthly)
- Progress photos (prompted monthly)

**User stories**

As a **user**, I want **to be asked one question at a time via Telegram** so that logging feels like a quick reply, not an admin task.

> AC: Each check-in question is a separate Telegram message. The user replies with a single word, number, or short phrase. Zaphod acknowledges and moves on or stops. No check-in requires more than six messages total.

As a **user**, I want **to log my weight by replying to a Telegram prompt** so that I never need to open a separate app to record it.

> AC: When Zaphod asks for weight, the user replies with a number (e.g. 134.2). Zaphod confirms, stores it via `log_weight`, and optionally writes to HealthKit via Health Auto Export if supported.

### 8.3 Day templates and scheduling

Every day must have a plan - either actively set or defaulting from a weekly template. The user configures templates conversationally via Zaphod.

**Default weekly template**

| Day | Activity | Intensity |
| --- | --- | --- |
| Monday | Rest / active recovery | - |
| Tuesday | PT session (with trainer) | Intense |
| Wednesday | Variety - swim, walk, bike, yoga | Light |
| Thursday | Intense session (strength or cardio) | Intense |
| Friday | Rest / active recovery | - |
| Saturday | Intense session (strength or cardio) | Intense |
| Sunday | Rest / active recovery | - |

All training sessions default to morning, before 09:00.

**Daily plan generation**

Each morning, Zaphod calls `generate_daily_plan` which combines: the day template, Google Calendar availability (via `get_calendar_slots`), recent recovery signals, any overrides the user has communicated, and the trainer’s current Hevy programme (via `get_hevy_routine`).

**Protected blocks**

- Day starts at 06:00
- Morning exercise preferred
- School-run block protected
- Work block 09:00 to 18:00 protected unless overridden
- Eight hours in bed targeted
- Family dinner time protected

**User stories**

As a **user**, I want **to set up my weekly exercise template by telling Zaphod in Telegram** so that I do not need to navigate a settings screen or fill in a form.

> AC: User says `Mondays and Thursdays are upper body, Tuesdays and Fridays are cardio, Wednesdays are rest.` Zaphod updates `day_templates` via `set_day_template` and confirms.

As a **user**, I want **to receive a morning brief in Telegram each day** so that I know what is planned without having to check anything.

> AC: By 07:00, Zaphod sends a Telegram message summarising: today’s planned workout (type, time slot, duration), meal targets and any meal plan for dinner, recovery status, one coaching note. If health data is stale, the brief notes the last sync time.

As a **user**, I want **the plan to adjust automatically when my calendar changes** so that I do not have to manually reschedule workouts around meetings.

> AC: If Google Calendar shows a new meeting in the planned workout slot, Zaphod identifies the next available slot and proposes a reschedule via Telegram. If no slot exists, Zaphod calls `offer_workout_alternative` and presents a compressed or minimum-viable-day option.

### 8.4 Workout planning, execution and adaptive coaching

The trainer creates and manages workout programmes natively in Hevy. The system reads from Hevy via its API to track what is planned and what was completed.

**Integration model**

- Trainer uploads routines and programmes to Hevy
- System polls Hevy API to read planned workouts and completed workout history
- Apple Watch runs Hevy for strength training and Apple Fitness / Apple Workout for cardio
- All workout data flows to HealthKit and then to the backend via Health Auto Export
- Hevy API provides granular strength data: exercises, sets, reps, weight, rest times
- HealthKit workout records provide cardio and general-exercise session data for Apple Fitness and Apple Workout
- Data reconciliation applies canonical-source rules and dedup at ingest (see section 7.4)

**Adaptive features**

- Detect when exercise has happened, when it has not, and when planned exercise was missed - using canonical workout records only, never stale-data gaps
- For HealthKit-only activity types during stale sync windows, ask a neutral clarification question rather than marking the session missed
- Compare planned workout intent against actual outcome
- Re-plan missed or shortened sessions during the same day
- Offer compressed alternatives when only 20 to 30 minutes are available
- Maintain minimum-viable-day versions of workouts for low-motivation days
- Support post-workout reflection and capture perceived exertion via Telegram

**User stories**

As a **user**, I want **my trainer’s Hevy programmes to appear in Zaphod’s daily plan** so that I know which routine to do today without checking Hevy separately.

> AC: The morning brief names the specific Hevy routine for the day (retrieved via `get_hevy_routine`). User opens Hevy on Apple Watch, executes the routine. Workout data appears in the system within one Hevy API polling cycle (default: 30 minutes) of completion.

As a **user**, I want **Zaphod to notice when I miss a planned workout and offer an alternative** so that I get a path back rather than silence or guilt.

> AC: If the planned workout time passes without a canonical workout record being logged (Hevy for strength, HealthKit for cardio and general exercise), Zaphod sends a Telegram message within two hours offering: the original workout in a later slot, a compressed 20-minute version, or a minimum-viable-day option (e.g. a walk). Missing HealthKit data alone does not trigger this - it could be a sync delay.

As a **user**, I want **HealthKit-only plans like walks or yoga to be handled sensibly when watch sync is stale** so that I am not incorrectly told I missed something that may not have synced yet.

> AC: If the planned activity’s canonical source is HealthKit and `get_data_freshness` shows stale watch data, Zaphod does not mark the session missed. Instead it asks a neutral check-in such as `Did you get that walk in, or shall I adjust the day?`

As a **trainer**, I want **to upload workout programmes to Hevy and have the system pick them up automatically** so that I do not need to learn a separate tool or duplicate my work.

> AC: Within one Hevy API polling cycle (default: every 30 minutes), new routines appear in the system’s understanding of the user’s programme. No manual sync or notification required.

### 8.5 Nutrition capture and meal intelligence

The nutrition module must support low-friction meal logging with reasonable accuracy, prioritising speed and simplicity over precision. All interaction happens via Telegram.

**Capture methods**

- Meal photo - user sends a photo via Telegram, system estimates calories and macros using `estimate_meal_from_photo` (OpenAI Vision), user confirms or corrects
- Barcode scan - user sends a barcode photo, system extracts the barcode and calls `lookup_barcode` (Open Food Facts API), returns nutrition data
- Text description - user types what they ate (e.g. `chicken Caesar salad, large`), system calls `estimate_meal_from_text` using USDA data and OpenAI reasoning
- Quick log - user says a calorie number directly (e.g. `about 500 cals for lunch`)

**Calorie estimation pipeline**

For photo-based estimation: OpenAI Vision analyses the image and produces an estimated breakdown of calories, protein, carbs, fat, and where possible fibre. The estimate is presented to the user with a confidence indicator. The user can adjust before saving. Every meal log is stored with its estimation method and confidence level via `log_meal`. Estimates are never silently treated as exact.

**Daily tracking**

- Track daily calorie intake against target (target derived from TDEE minus 825 kcal deficit)
- Track protein and fibre as primary macros (calories plus protein plus fibre first; full macros optional)
- Hydration tracking via simple Telegram prompts
- Suggest lunch options via `suggest_lunch` based on remaining calorie and macro budget
- At the end of the day, Zaphod summarises intake vs target and notes any significant gaps

**User stories**

As a **user**, I want **to log a meal by sending a photo to Zaphod in Telegram** so that I can capture what I ate in seconds without typing or searching a food database.

> AC: User sends photo. Zaphod replies within 30 seconds with: estimated calories, protein, carbs, fat, confidence level. User replies `yes` or corrects. Meal is saved via `log_meal`.

As a **user**, I want **to scan a barcode by sending a photo of it to Zaphod** so that I get accurate nutrition for packaged foods without manual entry.

> AC: User sends barcode photo. System extracts barcode via OCR, calls `lookup_barcode`, returns product name and nutrition per serving. User confirms serving size. Meal is saved.

As a **user**, I want **Zaphod to suggest what I should eat for lunch based on my remaining budget** so that I can make a quick decision without doing arithmetic.

> AC: When asked `what should I eat for lunch?`, Zaphod calls `suggest_lunch`, which calculates remaining calories and protein for the day, considers the dinner plan if one exists, and suggests two to three options with estimated nutrition.

### 8.6 Meal planning and recipe suggestion

The system must support weekly meal planning that accounts for the user’s calorie targets, household constraints, and what is already in the kitchen.

**Household profile**

- Four servings per dinner (two adults, two teenagers)
- No allergies or intolerances
- Exclude mushrooms from all recipes
- Up to one hour prep and cook time on weeknights
- Fresh each night - no batch-cooking or leftover-dependent plans
- Prioritise nutrition and taste over budget
- Recipes should appeal to teenagers as well as adults

**Dinner planning**

- Suggest family dinner recipes based on: the user’s remaining calorie and macro budget, household preferences listed above, prep time constraints, and what is already in the fridge or pantry
- Build a weekly dinner plan (five to seven dinners) via `generate_meal_plan` that balances variety, nutrition, and practicality
- Each recipe includes: ingredients with quantities, prep and cook time, calorie and macro estimate per serving, number of servings, and any notes on substitutions
- Plans are modifiable - the user can reject a suggestion and Zaphod replaces it

**Shopping list generation**

- Generate a shopping list from the weekly meal plan via `generate_shopping_list`
- Cross-reference against pantry inventory to exclude items already available
- Output as clean copy-paste text suitable for supermarket ordering apps
- Group items by supermarket section (fresh, dairy, meat, store cupboard, frozen)
- v1 stops at plain-text and checklist export - no direct retailer integration

**User stories**

As a **user**, I want **to ask Zaphod to plan dinners for the week** so that I have a practical meal plan that works for the family and keeps me in a calorie deficit.

> AC: User says `plan dinners for next week.` Zaphod calls `generate_meal_plan` considering household constraints and calorie targets. Each suggestion includes recipe name, estimated calories per serving, prep time, and key ingredients. User approves, rejects, or swaps individual meals.

As a **user**, I want **Zaphod to generate a shopping list from the meal plan** so that I can order groceries without manually cross-referencing recipes.

> AC: After a meal plan is approved via `approve_meal_plan`, Zaphod calls `generate_shopping_list`. Items already in `pantry_inventory` are excluded. List is formatted for copy-paste and grouped by section. Delivered via Telegram message.

As a **user**, I want **dinner suggestions to account for what is already in my fridge** so that I reduce waste and do not buy duplicates.

> AC: When generating recipes, `generate_meal_plan` queries `get_pantry` and prioritises ingredients already available. If a recipe uses three pantry items, it ranks higher than one using none.

### 8.7 Fridge and pantry management

The system maintains an editable inventory of fridge, freezer, and cupboard items to support intelligent meal planning and shopping list generation.

**Capture methods**

- Manual entry via Telegram - user tells Zaphod what they bought or used
- Barcode scan - user sends a barcode photo to add a packaged item
- Receipt or fridge photo review - experimental, using OpenAI Vision to identify items
- Recipe-driven depletion - when a meal is logged as cooked from a planned recipe, ingredients are automatically decremented via `update_pantry`

**Inventory management**

- Track likely expiry windows where possible
- Prompt weekly stock-take via Telegram (`anything run out this week?`)
- Detect missing ingredients for upcoming planned meals and add to shopping list

**User stories**

As a **user**, I want **to tell Zaphod what I bought and have it update the pantry** so that the meal planner knows what is available without me maintaining a spreadsheet.

> AC: User sends a message like `bought chicken, broccoli, rice, tinned tomatoes.` Zaphod parses the list, calls `update_pantry` with estimated quantities, and confirms.

### 8.8 Calendar-aware daily planning

The system connects to Google Calendar and uses it as the source of truth for availability.

**Requirements**

- Read events from Google Calendar via API
- Identify free slots for workouts based on protected blocks and existing meetings
- Suggest the best workout slot for the day
- Reserve backup slots where useful
- Re-plan automatically when meetings move or exercise is missed
- Protect sleep, mealtimes and family commitments
- Morning brief includes today’s schedule context

**User stories**

As a **user**, I want **Zaphod to know my calendar when suggesting workout times** so that it never suggests I train during a meeting.

> AC: Zaphod calls `get_calendar_slots` before generating the morning brief. Suggested workout slots do not overlap with calendar events. If all slots are filled, Zaphod says so and offers alternatives.

### 8.9 Engagement and relapse-prevention engine

This is the heart of the product. The system must detect early warning signs of disengagement and respond before the user drops out.

**Engagement status model**

The system uses a deterministic traffic-light model rather than a predictive probability. This is more explainable, more honest, and more practical for v1 with one user and no historical training data.

| Status | Meaning | Trigger criteria |
| --- | --- | --- |
| Green | All signals normal | Default state. No warning patterns detected. |
| Amber | Warning patterns detected | Any of: two missed workouts in three days; missed weekly weigh-in; fewer than two meals logged for two consecutive days; three consecutive days of declining Telegram response rate. |
| Red | Sustained disengagement | Amber persists for seven or more days without improvement, or user has not responded to Zaphod for five or more days. |

**Response protocol**

- Green to amber: Zaphod sends a curious, non-judgmental check-in. Reduces plan complexity. Offers smaller targets.
- Amber sustained: Zaphod continues lighter engagement. Asks what is happening. Offers minimum-viable-day options.
- Red: Escalate via dashboard flag only to practitioners who currently hold an explicit `engagement_status` grant. Zaphod sends one message per day at most. Tone is warm and patient.
- Any status can return to green when patterns resume. Zaphod acknowledges the return without fanfare: `Good to have you back. Here is today.`

**Mode switching**

The system operates in two modes that also affect Zaphod’s persona tone:

- Performance mode (green status) - normal operations, Zaphod is slightly more demanding and precise, coaching tone is confident and forward-looking
- Recovery mode (amber or red status) - Zaphod becomes warmer, asks more questions, suggests less, focuses on the smallest possible next step. Tone shifts but persona does not break.

**User stories**

As a **user**, I want **the system to notice when I am falling off and intervene gently** so that I get pulled back before I disappear for weeks.

> AC: After two missed workouts in three days, engagement status moves to amber. Zaphod sends a check-in within 24 hours. Message tone is curious, not disappointed. Zaphod asks what happened and offers a reduced plan.

As a **user**, I want **to not feel punished when I miss days** so that guilt does not accelerate my dropout.

> AC: Zaphod never uses language expressing disappointment, guilt, or failure. After missed activity, Zaphod’s first response is always a question (`What happened?`) or a practical offer (`Shall we adjust the week?`), never a statement of what should have happened.

### 8.10 AI conversation layer and persona

The user-facing agent operates via Telegram and is the primary interface for all interaction. The persona is critical to sustained engagement and is specified in detail in section 10.

**Capabilities**

- Answer `what should I do today?`
- Explain why it is making a recommendation
- Suggest lunch and dinner based on calorie budget and meal plan
- Re-plan a workout if time shrinks
- Coach during slumps with appropriate tone
- Collect data through single-question conversational exchanges
- Summarise weekly progress
- Generate and send daily morning briefs and end-of-day reviews
- Process meal photos and barcode images
- Manage pantry inventory updates
- Create and modify day templates and meal plans
- Generate shopping lists on request
- Manage consent grants and revocations via Telegram

**Safety boundaries**

- Never gives medical advice or diagnoses
- Never recommends specific supplements or medications
- If something looks clinically concerning, drops the persona and says clearly: `This is outside my lane. Talk to your GP.`
- Never pretends to know things it does not
- If data is ambiguous, says so

### 8.11 Reporting and analysis

The system generates reports at multiple cadences. Reports are delivered via Telegram and also visible on the web dashboard (within each user’s scoped view).

| Report | Cadence | Delivery | Content |
| --- | --- | --- | --- |
| Morning brief | Daily, by 07:00 | Telegram | Today’s plan: workout, meal targets, recovery status, one coaching note, data freshness note |
| End-of-day review | Daily, 21:00 | Telegram | What happened today: workout done/missed, calories vs target, notable signals |
| Weekly review | Sunday evening | Telegram + dashboard | Week summary: weight trend, adherence, effort, recovery, obstacles, recommended changes |
| Monthly trend report | First of month | Dashboard | Rolling trends, progress vs target, body composition changes, fitness improvements |
| Trainer review pack | Weekly | Dashboard (trainer scope) | Workout compliance, strength progression, missed sessions, and engagement status only if that category is granted |
| Nutrition review pack | Weekly | Dashboard (nutritionist scope) | Intake patterns, macro adherence, meal logging coverage, calorie trends |

Each report separates: inputs (what data was collected), outputs (what happened), adherence (planned vs actual), obstacles (what disrupted the plan), and recommended changes (what to adjust).

### 8.12 Web dashboard

An authenticated responsive website accessible on mobile, tablet, and desktop. Three accounts with scoped views.

**Authentication**

- Simple auth layer with three accounts: user, trainer, nutritionist
- User sees all data
- Trainer sees by default: workout adherence, strength progression from Hevy, and exercise schedule compliance
- Nutritionist sees by default: calorie and macro intake, weight trend, meal logging coverage, meal plans, shopping lists
- `engagement_status` is a separate grantable category and is not included in default trainer or nutritionist access
- Consent is managed via `access_grants`; user can grant or revoke any category at any time via Telegram
- Every practitioner dashboard request checks current grants at request time
- Revoking access invalidates active practitioner sessions for the affected categories immediately on next request and no later than five minutes via session revalidation
- All practitioner views are logged in `access_log` for audit purposes

**Dashboard contents (user view)**

- Weight trend chart
- Workout adherence and effort scores
- Recovery score trend
- Calorie and protein intake vs target
- Current week’s meal plan
- Shopping list (if generated)
- Daily plan for today
- Weekly and monthly report views
- Engagement status indicator (green/amber/red)
- Current mode (performance or recovery)

**User stories**

As a **trainer**, I want **to see the user’s workout adherence and strength progression on an authenticated dashboard** so that I can adjust programmes based on real data without asking the user to report.

> AC: Trainer logs in and sees workout completion rate, latest Hevy data, and missed sessions. Nutrition data, weight data, and engagement status are not visible unless the user has granted those categories.

As a **nutritionist**, I want **to see calorie and macro trends on an authenticated dashboard** so that I can adjust targets based on actual intake patterns.

> AC: Nutritionist logs in and sees daily calorie intake vs target, protein intake, meal logging coverage, and weight trend. Workout data and engagement status are not visible unless the user has granted those categories.

As a **user**, I want **to control what my trainer and nutritionist can see** so that I maintain agency over my health data.

> AC: User can say to Zaphod `give my trainer access to weight data`, `give my trainer access to engagement status`, or `revoke my nutritionist’s access to weight data`. Changes are stored in `access_grants`, checked on every practitioner request, and take effect immediately with session revalidation. All access is logged.

-----

## 9. Non-functional requirements

### 9.1 Performance

- Health Auto Export webhook endpoint responds within 500ms
- Telegram message processing (text) completes within five seconds
- Telegram message processing (photo - meal estimation) completes within 30 seconds
- Hevy API polling runs every 30 minutes without timeout
- Morning brief generated and sent by 07:00
- Web dashboard loads within three seconds on mobile

### 9.2 Reliability

- Backend process restarts automatically on crash (Render handles this)
- If Health Auto Export fails to push, the system degrades gracefully - Zaphod notes the data gap in the morning brief but continues operating with available data
- If OpenAI API is unavailable, Telegram bot sends a simple `I’m having a think - back shortly` message and queues the user’s message for retry
- If no data has arrived from Health Auto Export for eight or more hours, Zaphod prompts the user to open the app to trigger a manual sync

### 9.3 Backup and recovery

- Nightly `pg_dump` via Render cron job, uploaded to S3-compatible storage (Backblaze B2 or Cloudflare R2)
- 30-day retention enforced by lifecycle policy on the storage bucket
- Monthly backup verification: restore dump to a test database and confirm row counts and data integrity
- Render’s plan-level PITR is a secondary safety net, not the primary backup mechanism

### 9.4 Data freshness

Health data delivery is best-effort, constrained by iOS background execution rules. The system must not treat delivery as guaranteed.

- Health metrics: best effort, typically within two to four hours of Apple Watch recording. May be delayed until the user unlocks their phone or opens Health Auto Export.
- Workout data from Hevy: within one Hevy API polling cycle (30 minutes) of workout completion
- Cardio and general-exercise workout data from Apple Fitness / Apple Workout: best effort via Health Auto Export, subject to iOS background execution constraints
- Calendar data: refreshed at least every hour and always refreshed before morning brief generation
- The morning brief always includes a data freshness note: `Last watch sync: [time]`

### 9.5 Scalability

This is a single-user system. Scalability means data volume over time, not concurrent users. At an expected rate of roughly 50 to 100 health metric data points per day plus five to ten meal logs, the PostgreSQL database will grow by approximately 500 MB per year. No special scaling provisions are needed in v1.

### 9.6 Security

- All API keys stored as Render environment variables, never in code
- HTTPS for all web endpoints
- Telegram webhook secured via `X-Telegram-Bot-Api-Secret-Token` header validation on every incoming request
- Incoming Telegram updates deduplicated via `update_id` stored in `processed_updates` to ensure idempotency
- Rate limiting on the webhook endpoint: maximum 60 requests per minute, rejecting excess with HTTP 429
- Database accessible only from Render internal network
- Dashboard requires authentication; session tokens with configurable expiry and request-time grant checks
- Grant revocations trigger practitioner session revalidation no later than five minutes and on the next request when possible
- All practitioner access logged in `access_log` with timestamp, user identity, and data categories viewed

-----

## 10. Persona specification - Zaphod

The coaching persona is the product. The technology behind it is plumbing. If the voice is wrong, nothing else matters.

### 10.1 Identity

Zaphod is a former Olympic rowing coach - a sport that values both power and sustained suffering. Retired after Rio 2016. Now doing private coaching because a friend of a friend asked and the money from the memoir dried up. Privately finds the whole app-based coaching thing slightly beneath them but is genuinely invested in the outcome because professional pride will not let them do a half-arsed job. Has opinions about books, music, food, and the general state of the world. Uses dry humour as a default register but can be direct and serious when it matters.

### 10.2 Voice rules

- Short sentences. UK English.
- No exclamation marks unless genuinely surprised
- Never uses the word `journey`
- Never says `proud of you` - instead shows respect through raised expectations
- Uses specific, concrete language rather than motivational abstractions
- Might occasionally drop a literary or cultural reference but never explains it
- Treats the user as an intelligent adult who happens to be carrying too much weight, not as a patient or a project

### 10.3 Behavioural rules

- Always explains the reasoning behind a recommendation
- Never guilt-trips
- When the user misses something, first response is curiosity (`What happened?`), not disappointment
- Adjusts the plan down before the user has to ask
- Celebrates consistency over performance
- A mediocre workout that happened beats an excellent workout that did not
- Can be blunt about food choices without being preachy - `That’s a lot of cheese for a Tuesday` is fine; `You need to make better choices` is banned
- Uses humour to reduce friction but never jokes about the user’s body, weight, or appearance

### 10.4 Boundary rules

- Never gives medical advice
- Never recommends supplements or medications
- If something looks clinically concerning, drops the persona and speaks clearly: `This is outside my lane. Talk to your GP.`
- Never pretends to know things it does not
- If data is ambiguous, says so

### 10.5 Mode behaviour

In performance mode (green engagement status), Zaphod is slightly more demanding, slightly more precise, slightly more coach-like. In recovery mode (amber or red), Zaphod becomes warmer, asks more questions, suggests less, and focuses entirely on the smallest possible next step. The persona does not break - the character reveals a different side. Like a coach who normally banters but goes quiet and focused when an athlete is struggling.

### 10.6 Implementation

The persona lives in a structured OpenAI system prompt with several layers: identity layer (who Zaphod is), voice rules (how Zaphod talks), behavioural rules (how Zaphod coaches), boundary rules (what Zaphod will not do), and dynamic context (today’s data, recent trends, current engagement status, what has been asked today). The system prompt will be approximately 1,500 to 2,000 tokens of persona definition plus dynamic context injected per message. A library of 10 to 15 voice calibration examples anchors the tone.

-----

## 11. Privacy, safety and compliance

Health data is special category data under UK GDPR. ICO guidance requires both an Article 6 lawful basis and a separate Article 9 condition before processing. Inferred health information - including engagement status derived from behavioural patterns - also counts as special category data under ICO guidance. Apple states that HealthKit data must not be disclosed to third parties without the user’s express permission.

### 11.1 Requirements

- Explicit, granular consent for every shared data domain - managed via `access_grants`
- Separate consent for trainer access and nutritionist access, each scoped to specific data categories
- `engagement_status` treated as its own grantable category, not implied by trainer access
- Revocable sharing at any time via Telegram command
- All practitioner data access logged in `access_log` with timestamp, identity, and data categories viewed
- Encryption in transit (HTTPS) and at rest (database encryption)
- Authenticated dashboard with scoped views per role
- Explainable recommendations - Zaphod must always be able to explain why
- User-visible data retention and deletion controls
- Medical-boundary language that avoids diagnosis or treatment claims
- Hard escalation rules for red-flag scenarios
- Engagement status (green/amber/red) is treated as inferred health data under ICO guidance and subject to the same special category protections

### 11.2 Medical device boundary

UK medical-device risk depends on intended purpose and claims. Software aimed at general wellbeing may stay outside medical-device scope, but software directed towards specific medical purposes can fall inside it. This product is positioned as a general wellness and fitness coaching tool. It must never make clinical claims, recommend treatments, or suggest it can diagnose conditions.

### 11.3 Pre-launch legal workstream

The following must be completed before launch:

- Lawful basis mapping (Article 6 and Article 9) - including basis for processing inferred engagement status data
- Data Protection Impact Assessment (DPIA)
- Coach data-sharing agreements (trainer and nutritionist)
- Medical-device boundary review
- Data retention and deletion policy
- Apple HealthKit data-sharing compliance review

-----

## 12. Success metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| Weekly weigh-in completion rate | > 90% | Weeks with weight entry / total weeks |
| Planned workout completion rate | > 80% | Completed workouts (canonical records) / planned workouts per week |
| Meal logging coverage | > 80% | Days with at least two meals logged / total days |
| 90-day retention | > 65% | Still actively using the system after 90 days |
| Missed-workout same-day recovery | > 50% | Missed workouts where an alternative was completed the same day |
| Telegram response rate | > 85% | Zaphod prompts replied to / total prompts sent |
| Weight trend | Moving in agreed direction | Rolling eight-week trend line |
| Dashboard weekly active use | > 1 session per practitioner | Trainer and nutritionist each view dashboard at least once per week |
| User correction rate on meal estimates | Tracked, no target | Proportion of photo/text estimates the user adjusts - quality signal for estimation accuracy |

-----

## 13. Assumptions and dependencies

### 13.1 Assumptions

- User has an Apple Watch and iPhone
- User has a Hevy Pro subscription (required for API access)
- User uses Google Calendar as their primary calendar
- User has Telegram installed
- Trainer is willing to work within Hevy for programme design
- Nutritionist is willing to review data via the authenticated web dashboard
- Health Auto Export premium is purchased and configured
- ChatGPT Pro subscription is available for Codex-driven development
- OpenAI API billing is enabled for runtime inference
- iOS background execution constraints mean health data delivery is best-effort, not guaranteed

### 13.2 Dependencies

- Hevy API remains available and stable at the current access level
- Open Food Facts database has adequate coverage of UK and Irish products
- Health Auto Export continues to support REST API automation
- Render continues to offer background worker hosting at current pricing
- OpenAI Vision API provides adequate meal photo estimation accuracy
- Google Calendar API remains free for personal use
- Telegram Bot API continues to support webhook-based bots with secret token validation

-----

## 14. Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Hevy API changes or restricts access | High | Low | Data also flows via HealthKit. Fallback to Health Auto Export for workout summaries. |
| OpenAI API outage | High | Low | Queue messages for retry. Send holding message via Telegram. |
| Meal photo estimation inaccuracy | Medium | Medium | Always present estimates as editable. Track user correction rate as a quality signal. |
| Health Auto Export delivery delayed by iOS | Medium | High | Design for stale data. Note freshness in briefs. Prompt user to open app if gap exceeds eight hours. |
| Schema needs to change mid-use | Medium | Medium | Fixed schema with migration tooling. Codex proposes migration PR. Reviewed and deployed normally. |
| Persona fatigue | High | Medium | Monitor Telegram response rate. Adjust persona intensity. Vary message patterns. |
| Health Auto Export stops pushing entirely | Medium | Low | Monitor `last_successful_ingest`. Alert user. System continues on Hevy and Telegram data until HealthKit sync recovers. |
| User drops off despite all design | High | Medium | Engagement engine with green/amber/red escalation. Recovery mode. Escalate to human coach only where explicit engagement-status grants exist. |
| Open Food Facts poor coverage for Irish products | Medium | Medium | Fallback to text description or photo estimation via OpenAI Vision. |
| Render pricing increases | Low | Low | Architecture is portable. Standard Python/Node app can move to any host. |
| Practitioner access creep | Medium | Low | All access scoped and logged. User can revoke via Telegram at any time. |
| Duplicate workout records from multiple sources | Medium | High | Canonical-source rules and time-window dedup applied at ingest. See section 7.4. |

-----

## 15. Edge cases and error handling

- User does not respond to Zaphod for three days - engagement status moves to amber on day two. On day three, Zaphod reduces message frequency to one per day. After seven days (red status), escalates to trainer or nutritionist only if they currently hold an explicit `engagement_status` grant.
- HealthKit data stops flowing - system continues operating on Telegram inputs and Hevy data. Morning brief notes the gap: `I have not seen your watch data since Tuesday. You might want to open Health Auto Export to trigger a sync.` Stale data never triggers engagement status changes.
- Planned activity is HealthKit-only and watch sync is stale - Zaphod asks whether it happened, but does not mark it missed or use it in engagement calculations until sync recovers or the user confirms.
- Meal photo is unrecognisable - Zaphod says `I cannot make that out. Can you describe what you ate?` Falls back to `estimate_meal_from_text`.
- Scale reading looks clinically implausible (e.g. 10 kg change in a week) - Zaphod flags it: `That is a big shift. Worth double-checking the scale or talking to your GP if it continues.` Stores the value but flags it in reports.
- Multiple meals logged in rapid succession - Zaphod treats them as separate meals, does not merge or question.
- User logs a meal with zero calories - accepted and stored, but Zaphod asks `Was that right?`
- Google Calendar is empty - Zaphod assumes default availability from protected blocks.
- Hevy API returns no planned workout for the day - Zaphod checks the day template and suggests accordingly.
- User asks a question outside Zaphod’s scope (e.g. medical question) - Zaphod declines clearly and suggests the user consult their GP.
- Simultaneous messages from user while Zaphod is processing - queue and process in order. Idempotency enforced via `processed_updates`.
- Same workout arrives from Hevy and HealthKit - dedup applies canonical-source rules. Hevy record retained for strength; HealthKit record marked as superseded and logged in `dedup_matches`.
- Health Auto Export delivers a batch of backdated records - ingest pipeline processes in chronological order, applies dedup, and recalculates scores for affected days.
- Telegram webhook receives duplicate `update_id` - rejected via idempotency check against `processed_updates`.
- Barcode not found in Open Food Facts - Zaphod says `I do not recognise that barcode. Can you tell me what it is and I will estimate?`
- Pantry item has no clear expiry - stored without expiry date. No false warnings generated.
- User revokes practitioner access while that practitioner is logged in - subsequent requests fail grant checks immediately, and active sessions are revalidated within five minutes.

-----

## 16. Phased build plan

Each phase must be complete and testable before the next begins. All phases are built using Codex via GitHub, deploying to Render.

### Phase 1 - Foundation

**Goal:** Data flows in, auth exists, backups work.

- Deploy PostgreSQL on Render with fixed schema (raw ingest, normalized landing, and application tables)
- Build REST endpoint to receive Health Auto Export JSON payloads into `ingest_events`
- Build normalization pipeline from `ingest_events` into normalized landing tables with dedup at ingest
- Build Hevy API poller (read workout history and routines) with canonical-source tagging
- Build normalization for Apple Fitness and Apple Workout sessions arriving via Health Auto Export, with cardio/general-exercise tagging
- Build Google Calendar API reader
- Implement data reconciliation: canonical-source rules, time-window dedup, stale-data tracking
- Build authentication layer: three accounts (user, trainer, nutritionist), `access_grants`, `access_log`
- Set up nightly `pg_dump` cron job to S3-compatible storage with 30-day retention
- Verify all four data sources are flowing and dedup is working correctly

**Acceptance gate:** Health Auto Export metrics and workout sessions, Hevy workouts, and calendar events are all visible in PostgreSQL with correct timestamps, no duplicate canonical records, and `dedup_matches` logged. Auth layer returns scoped data per role. Backup runs successfully and can be restored.

### Phase 2 - Zaphod’s toolkit

**Goal:** Zaphod can reason about data through constrained tools.

- Set up OpenAI API integration
- Implement all application-level tools from section 7.5 (data capture, query, planning, consent, communication, analysis)
- Each tool validates inputs, enforces constraints, and returns structured results
- Implement safety guardrails: tools cannot modify raw ingest or normalized landing tables, all writes go through application functions
- Test end-to-end: Zaphod calls `get_daily_summary`, reasons about the data, and sends a coherent message via `send_telegram_message`

**Acceptance gate:** Zaphod can query health data, workout history, and calendar via application tools. Zaphod can store a meal log, weight entry, and day-template update via application tools. Zaphod can grant and revoke practitioner access by category. Zaphod cannot directly access the database or execute arbitrary SQL.

### Phase 3 - Telegram bot and persona

**Goal:** Zaphod talks to the user with the right voice.

- Build Telegram bot integration (webhook-based, running as Render background worker)
- Implement webhook security: `X-Telegram-Bot-Api-Secret-Token` validation, idempotency via `processed_updates`, rate limiting at 60 requests per minute
- Write the full system prompt with persona layers
- Build the daily rhythm: morning brief (with data freshness note), check-in prompts, meal capture, evening review
- Implement single-question data collection for all subjective inputs
- Implement photo handling for meal estimation via `estimate_meal_from_photo`
- Implement barcode photo handling via OCR plus `lookup_barcode`
- Implement consent management flows via Telegram using `grant_access` and `revoke_access`
- Build voice calibration example library (10 to 15 exchanges)
- Test persona across performance mode and recovery mode

**Acceptance gate:** A full day’s interaction cycle works: morning brief arrives by 07:00 with data freshness note, check-in questions are asked and answered one at a time, a meal photo is processed and logged, a barcode is scanned and logged, access grants can be changed via Telegram, and an evening review is sent. Persona tone matches the specification. Duplicate Telegram updates are rejected.

### Phase 4 - Scoring and intelligence

**Goal:** The system produces actionable insights from reconciled data.

- Build adherence score calculation (using canonical workout records only)
- Build effort score calculation
- Build recovery score calculation
- Build consistency score calculation
- Build deterministic engagement status engine (green/amber/red) with configurable thresholds
- Implement mode switching (performance to recovery) based on engagement status
- Build day template system and daily plan generation via `generate_daily_plan`
- Implement calendar-aware scheduling
- Implement missed-workout detection (using canonical records, not stale-data gaps) and alternative offering via `offer_workout_alternative`
- Implement softer treatment for HealthKit-only planned activities during stale sync windows
- Implement score recalculation when backdated data arrives

**Acceptance gate:** All four scores update daily from canonical data. Engagement status transitions correctly when test thresholds are triggered. Day plans generate correctly from templates combined with calendar data. HealthKit-only stale-data gaps do not create false missed sessions. Backdated data triggers score recalculation for affected days.

### Phase 5 - Nutrition intelligence

**Goal:** Meal planning, calorie tracking, and shopping lists work end to end.

- Build daily calorie and macro tracking with budget calculations (TDEE minus 825 kcal deficit)
- Build lunch suggestion engine via `suggest_lunch`
- Build weekly dinner planning module via `generate_meal_plan` with household profile (four servings, no mushrooms, up to one hour prep, quality ingredients, teenager-friendly)
- Build recipe suggestion logic with pantry cross-referencing via `get_pantry`
- Build shopping list generator via `generate_shopping_list` grouped by supermarket section
- Build pantry inventory management via Telegram using `update_pantry`
- Implement recipe-driven pantry depletion

**Acceptance gate:** User can ask for a weekly meal plan, receive five to seven dinner suggestions with nutrition info, approve or swap meals, and receive a formatted shopping list that excludes items already in pantry. Calorie tracking reflects meals logged throughout the day. Lunch suggestions account for dinner plan and remaining budget.

### Phase 6 - Web dashboard

**Goal:** Authenticated, scoped views for all three roles.

- Build responsive web app with authentication and role-based scoping
- Implement `access_grants` management (user can grant/revoke via Telegram)
- Implement request-time grant checks and session revalidation on revocation
- Implement `access_log` for all practitioner views
- Build weight trend chart (user and nutritionist views, trainer only if granted)
- Build adherence, effort, and recovery score visualisations (user and trainer views)
- Build calorie and macro intake views (user and nutritionist views)
- Build current meal plan and shopping list display (user and nutritionist views)
- Build daily plan view (user view)
- Build weekly and monthly report views (user view)
- Build engagement status display only for user and practitioners with the `engagement_status` grant
- Deploy on Render, verify mobile and desktop rendering

**Acceptance gate:** Dashboard loads within three seconds on mobile. Each role sees only their scoped data. All practitioner views generate `access_log` entries. Trainer confirms they can see workout data but not nutrition, weight, or engagement status unless granted. Nutritionist confirms they can see intake data and weight only when granted, and cannot see workout data or engagement status unless granted.

### Phase 7 - Reporting

**Goal:** All reports generate and deliver correctly.

- Build morning brief generation and delivery (including data freshness notes)
- Build end-of-day review generation and delivery
- Build weekly review generation
- Build monthly trend report
- Build trainer review pack (scoped to trainer-visible data)
- Build nutrition review pack (scoped to nutritionist-visible data)

**Acceptance gate:** All six report types generate with correct data drawn from canonical, deduplicated records. Morning brief and evening review arrive in Telegram at scheduled times. Weekly and monthly reports appear on dashboard within each role’s scoped view.

### Phase 8 - Integration testing and launch

**Goal:** Everything works together for a full week.

- Run full seven-day integration test with real data
- Verify all data pipelines, dedup, scoring, scheduling, meal planning, and reporting
- Test edge cases from section 15
- Verify engagement status transitions and persona mode shift
- Verify data freshness handling when Health Auto Export delivery is delayed
- Confirm scoped dashboard access for trainer and nutritionist
- Verify backup and restore process
- Final persona tuning based on real interaction patterns

**Acceptance gate:** Seven consecutive days of full operation with no data loss, no unhandled errors, no duplicate canonical records in scores or reports, all reports delivered on time, scoped access working correctly, backup verified, and persona tone consistently matching specification.

-----

## 17. Resolved decisions

| Decision | Resolution |
| --- | --- |
| Weight-loss pace | 0.75 kg per week. Approximately 61 weeks to target. Daily deficit of 825 kcal. |
| Medical baseline | No injuries, no mobility limitations, no cardiovascular concerns, no medications. |
| Household meal constraints | Four servings (two adults, two teenagers). No allergies. No mushrooms. Quality prioritised. Up to one hour prep. Fresh each night. |
| Nutrition tracking depth | Calories plus protein plus fibre first; full macros optional. |
| Food logging tolerance | Photo estimates editable, confidence-scored, never silently treated as exact. User correction rate tracked as quality signal. |
| Fridge inventory workflow | Weekly stock-take prompt plus barcode additions plus recipe-driven depletion. |
| Supermarket integration | Plain-text and checklist export in v1. No direct retailer integration. |
| Coach collaboration model | Trainer works in Hevy. Nutritionist adjusts targets via dashboard or direct communication. Access scoped and logged. |
| Engagement detection | Deterministic green/amber/red traffic light based on observable patterns. No predictive probability. |
| Engagement data sharing | `engagement_status` is special-category inferred data and a separately grantable category, not implied by trainer access. |
| Subjective signal set | Daily: mood, hunger, soreness, disruption tag. All optional but prompted. |
| Progress measures | Weight plus waist plus progress photos plus fitness trend. |
| Notification strategy | Calm coaching tone, fewer but smarter prompts. Check-in on amber. Reduce frequency on red. |
| Default exercise template | Tuesday PT (intense), Wednesday variety (light), Thursday intense, Saturday intense. Monday/Friday/Sunday rest. Mornings before 09:00. |
| Privacy and auth | Authenticated dashboard with scoped views. Consent via `access_grants`. All practitioner access logged. |
| Data reconciliation | Canonical sources defined per activity type. Time-window dedup at ingest. Stale data does not trigger engagement changes. |
| Raw vs normalized ingest | Raw payloads retained in `ingest_events`; normalized landing tables store validated, reconciled records. |
| Telegram security | Secret token header validation, `update_id` idempotency, rate limiting at 60 requests per minute. |
| Backup strategy | Nightly `pg_dump` to S3-compatible storage. 30-day retention. Monthly restore verification. |
| Zaphod data access | Fixed schema with constrained application tools. No raw SQL or schema modification. Changes via Codex PRs. |
| Data ownership | Full export and deletion available on request. Coach access revocable at any time. |
| Commercial model | Personal tool. Not for commercial release in v1. |

-----

## 18. Version history

| Version | Date | Changes |
| --- | --- | --- |
| 0.1 | 14 March 2026 | Initial PRD - native iPhone app architecture, Gymaholic for strength, separate coach portal |
| 0.2 | 14 March 2026 | Major revision: Telegram plus web dashboard, Hevy replacing Gymaholic, Codex development, Render hosting, Zaphod persona, meal planning modules, data lake with Zaphod schema autonomy |
| 0.3 | 14 March 2026 | Build-ready revision: fixed schema replacing Zaphod schema autonomy, authenticated dashboard with scoped views, data reconciliation with canonical sources and dedup, deterministic engagement status replacing predictive risk score, realistic data freshness reflecting iOS constraints, explicit backup pipeline, correct Telegram webhook security, idempotency and rate limiting, constrained application tools, raw ingest plus normalized landing separation, explicit consent runtime semantics, engagement-status grant isolation, all open questions resolved |
