import { z } from "zod";
export const userRoleSchema = z.enum(["user", "trainer", "nutritionist"]);
export const accessCategorySchema = z.enum([
    "exercise",
    "nutrition",
    "weight",
    "engagement_status"
]);
export const engagementStatusSchema = z.enum(["green", "amber", "red"]);
export const sourceKindSchema = z.enum([
    "health_auto_export",
    "hevy",
    "strava",
    "google_calendar",
    "telegram",
    "manual"
]);
export const dayOfWeekSchema = z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
]);
export const mealLoggingMethodSchema = z.enum([
    "photo",
    "barcode",
    "text",
    "quick_log"
]);
export const scoreTypeSchema = z.enum([
    "workout_adherence",
    "effort",
    "recovery",
    "consistency"
]);
export const telegramUpdateSchema = z.object({
    update_id: z.number(),
    message: z
        .object({
        message_id: z.number(),
        date: z.number(),
        text: z.string().optional()
    })
        .passthrough()
        .optional()
}).passthrough();
//# sourceMappingURL=index.js.map