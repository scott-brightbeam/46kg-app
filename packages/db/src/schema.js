import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
export const userRoleEnum = pgEnum("user_role", [
    "user",
    "trainer",
    "nutritionist"
]);
export const accessCategoryEnum = pgEnum("access_category", [
    "exercise",
    "nutrition",
    "weight",
    "engagement_status"
]);
export const engagementStatusEnum = pgEnum("engagement_status_value", [
    "green",
    "amber",
    "red"
]);
export const scoreTypeEnum = pgEnum("score_type", [
    "workout_adherence",
    "effort",
    "recovery",
    "consistency"
]);
export const sourceKindEnum = pgEnum("source_kind", [
    "health_auto_export",
    "hevy",
    "strava",
    "google_calendar",
    "telegram",
    "manual"
]);
export const dayOfWeekEnum = pgEnum("day_of_week", [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
]);
export const mealLoggingMethodEnum = pgEnum("meal_logging_method", [
    "photo",
    "barcode",
    "text",
    "quick_log"
]);
const timestamps = {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};
export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps
});
export const ingestEvents = pgTable("ingest_events", {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceKindEnum("source").notNull(),
    sourceRecordId: varchar("source_record_id", { length: 255 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull(),
    validationStatus: varchar("validation_status", { length: 50 }).notNull(),
    processingStatus: varchar("processing_status", { length: 50 }).notNull(),
    replayable: boolean("replayable").notNull().default(true)
});
export const healthMetrics = pgTable("health_metrics", {
    id: uuid("id").defaultRandom().primaryKey(),
    ingestEventId: uuid("ingest_event_id").references(() => ingestEvents.id),
    metricType: varchar("metric_type", { length: 100 }).notNull(),
    sourceRecordId: varchar("source_record_id", { length: 255 }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    unit: varchar("unit", { length: 50 }),
    valueNumeric: numeric("value_numeric", { precision: 12, scale: 4 }),
    payload: jsonb("payload").notNull(),
    supersededBy: uuid("superseded_by"),
    canonical: boolean("canonical").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const hevyWorkouts = pgTable("hevy_workouts", {
    id: uuid("id").defaultRandom().primaryKey(),
    ingestEventId: uuid("ingest_event_id").references(() => ingestEvents.id),
    sourceRecordId: varchar("source_record_id", { length: 255 }).notNull(),
    routineName: varchar("routine_name", { length: 255 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    payload: jsonb("payload").notNull(),
    supersededBy: uuid("superseded_by"),
    canonical: boolean("canonical").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const stravaActivities = pgTable("strava_activities", {
    id: uuid("id").defaultRandom().primaryKey(),
    ingestEventId: uuid("ingest_event_id").references(() => ingestEvents.id),
    sourceRecordId: varchar("source_record_id", { length: 255 }).notNull(),
    activityType: varchar("activity_type", { length: 100 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    distanceMeters: numeric("distance_meters", { precision: 12, scale: 2 }),
    payload: jsonb("payload").notNull(),
    supersededBy: uuid("superseded_by"),
    canonical: boolean("canonical").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const calendarEvents = pgTable("calendar_events", {
    id: uuid("id").defaultRandom().primaryKey(),
    ingestEventId: uuid("ingest_event_id").references(() => ingestEvents.id),
    sourceRecordId: varchar("source_record_id", { length: 255 }).notNull(),
    externalCalendarId: varchar("external_calendar_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const dedupMatches = pgTable("dedup_matches", {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalSourceTable: varchar("canonical_source_table", { length: 100 }).notNull(),
    canonicalRecordId: uuid("canonical_record_id").notNull(),
    supersededSourceTable: varchar("superseded_source_table", { length: 100 }).notNull(),
    supersededRecordId: uuid("superseded_record_id").notNull(),
    overlapScore: numeric("overlap_score", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const dayTemplates = pgTable("day_templates", {
    id: uuid("id").defaultRandom().primaryKey(),
    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    activityType: varchar("activity_type", { length: 100 }).notNull(),
    intensity: varchar("intensity", { length: 50 }),
    preferredTime: varchar("preferred_time", { length: 50 }),
    notes: text("notes"),
    ...timestamps
});
export const dailyPlans = pgTable("daily_plans", {
    id: uuid("id").defaultRandom().primaryKey(),
    planDate: timestamp("plan_date", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    workoutPlan: jsonb("workout_plan"),
    mealPlan: jsonb("meal_plan"),
    recoveryContext: jsonb("recovery_context"),
    sourceSnapshot: jsonb("source_snapshot"),
    ...timestamps
});
export const engagementStatuses = pgTable("engagement_statuses", {
    id: uuid("id").defaultRandom().primaryKey(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    status: engagementStatusEnum("status").notNull(),
    reasons: jsonb("reasons").notNull(),
    createdBy: sourceKindEnum("created_by").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const metricDefinitions = pgTable("metric_definitions", {
    id: uuid("id").defaultRandom().primaryKey(),
    scoreType: scoreTypeEnum("score_type").notNull(),
    version: varchar("version", { length: 50 }).notNull(),
    formula: text("formula").notNull(),
    notes: text("notes"),
    ...timestamps
});
export const scores = pgTable("scores", {
    id: uuid("id").defaultRandom().primaryKey(),
    scoreDate: timestamp("score_date", { withTimezone: true }).notNull(),
    scoreType: scoreTypeEnum("score_type").notNull(),
    value: numeric("value", { precision: 8, scale: 3 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    formulaVersion: varchar("formula_version", { length: 50 }).notNull(),
    provenance: jsonb("provenance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const mealLogs = pgTable("meal_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
    description: text("description").notNull(),
    calories: numeric("calories", { precision: 8, scale: 2 }).notNull(),
    protein: numeric("protein", { precision: 8, scale: 2 }),
    carbs: numeric("carbs", { precision: 8, scale: 2 }),
    fat: numeric("fat", { precision: 8, scale: 2 }),
    fibre: numeric("fibre", { precision: 8, scale: 2 }),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    method: mealLoggingMethodEnum("method").notNull(),
    sourcePayload: jsonb("source_payload"),
    ...timestamps
});
export const checkinResponses = pgTable("checkin_responses", {
    id: uuid("id").defaultRandom().primaryKey(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
    field: varchar("field", { length: 100 }).notNull(),
    valueText: text("value_text").notNull(),
    sourcePayload: jsonb("source_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const weightEntries = pgTable("weight_entries", {
    id: uuid("id").defaultRandom().primaryKey(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    kilograms: numeric("kilograms", { precision: 6, scale: 2 }).notNull(),
    source: sourceKindEnum("source").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    sourcePayload: jsonb("source_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const mealPlans = pgTable("meal_plans", {
    id: uuid("id").defaultRandom().primaryKey(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    plan: jsonb("plan").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps
});
export const shoppingLists = pgTable("shopping_lists", {
    id: uuid("id").defaultRandom().primaryKey(),
    mealPlanId: uuid("meal_plan_id").references(() => mealPlans.id),
    listText: text("list_text").notNull(),
    structuredItems: jsonb("structured_items").notNull(),
    ...timestamps
});
export const pantryInventory = pgTable("pantry_inventory", {
    id: uuid("id").defaultRandom().primaryKey(),
    itemName: varchar("item_name", { length: 255 }).notNull(),
    quantityText: varchar("quantity_text", { length: 255 }),
    storageArea: varchar("storage_area", { length: 100 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourcePayload: jsonb("source_payload"),
    ...timestamps
});
export const dashboardConfig = pgTable("dashboard_config", {
    id: uuid("id").defaultRandom().primaryKey(),
    configKey: varchar("config_key", { length: 100 }).notNull().unique(),
    configValue: jsonb("config_value").notNull(),
    ...timestamps
});
export const conversationLog = pgTable("conversation_log", {
    id: uuid("id").defaultRandom().primaryKey(),
    messageAt: timestamp("message_at", { withTimezone: true }).notNull().defaultNow(),
    actor: varchar("actor", { length: 50 }).notNull(),
    channel: varchar("channel", { length: 50 }).notNull().default("telegram"),
    content: text("content"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export const accessGrants = pgTable("access_grants", {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectUserId: uuid("subject_user_id").notNull().references(() => users.id),
    practitionerUserId: uuid("practitioner_user_id").notNull().references(() => users.id),
    category: accessCategoryEnum("category").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id)
});
export const accessLog = pgTable("access_log", {
    id: uuid("id").defaultRandom().primaryKey(),
    practitionerUserId: uuid("practitioner_user_id").notNull().references(() => users.id),
    subjectUserId: uuid("subject_user_id").notNull().references(() => users.id),
    category: accessCategoryEnum("category").notNull(),
    requestPath: varchar("request_path", { length: 255 }).notNull(),
    accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata")
});
export const sourcePrecedence = pgTable("source_precedence", {
    id: uuid("id").defaultRandom().primaryKey(),
    activityType: varchar("activity_type", { length: 100 }).notNull().unique(),
    canonicalSource: sourceKindEnum("canonical_source").notNull(),
    fallbackSource: sourceKindEnum("fallback_source"),
    notes: text("notes"),
    ...timestamps
});
export const sourceFreshness = pgTable("source_freshness", {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceKindEnum("source").notNull().unique(),
    lastSuccessfulIngestAt: timestamp("last_successful_ingest_at", {
        withTimezone: true
    }),
    lastAttemptedIngestAt: timestamp("last_attempted_ingest_at", {
        withTimezone: true
    }),
    lastStatus: varchar("last_status", { length: 50 }),
    lastError: text("last_error"),
    metadata: jsonb("metadata"),
    ...timestamps
});
export const processedUpdates = pgTable("processed_updates", {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: sourceKindEnum("provider").notNull(),
    externalUpdateId: varchar("external_update_id", { length: 255 }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    payloadHash: varchar("payload_hash", { length: 128 })
}, (table) => ({
    providerExternalUpdateUnique: uniqueIndex("processed_updates_provider_external_update_unique").on(table.provider, table.externalUpdateId)
}));
//# sourceMappingURL=schema.js.map