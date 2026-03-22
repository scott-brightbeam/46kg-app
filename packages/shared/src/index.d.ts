import { z } from "zod";
export declare const userRoleSchema: z.ZodEnum<["user", "trainer", "nutritionist"]>;
export type UserRole = z.infer<typeof userRoleSchema>;
export declare const accessCategorySchema: z.ZodEnum<["exercise", "nutrition", "weight", "engagement_status"]>;
export type AccessCategory = z.infer<typeof accessCategorySchema>;
export declare const engagementStatusSchema: z.ZodEnum<["green", "amber", "red"]>;
export type EngagementStatus = z.infer<typeof engagementStatusSchema>;
export declare const sourceKindSchema: z.ZodEnum<["health_auto_export", "hevy", "strava", "google_calendar", "telegram", "manual"]>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export declare const dayOfWeekSchema: z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>;
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;
export declare const mealLoggingMethodSchema: z.ZodEnum<["photo", "barcode", "text", "quick_log"]>;
export type MealLoggingMethod = z.infer<typeof mealLoggingMethodSchema>;
export declare const scoreTypeSchema: z.ZodEnum<["workout_adherence", "effort", "recovery", "consistency"]>;
export type ScoreType = z.infer<typeof scoreTypeSchema>;
export declare const telegramUpdateSchema: z.ZodObject<{
    update_id: z.ZodNumber;
    message: z.ZodOptional<z.ZodObject<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    update_id: z.ZodNumber;
    message: z.ZodOptional<z.ZodObject<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    update_id: z.ZodNumber;
    message: z.ZodOptional<z.ZodObject<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        message_id: z.ZodNumber;
        date: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
