import { z } from "zod";

export const userRoleSchema = z.enum(["user", "trainer", "nutritionist"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const accessCategorySchema = z.enum([
  "exercise",
  "nutrition",
  "weight",
  "engagement_status"
]);
export type AccessCategory = z.infer<typeof accessCategorySchema>;

export const engagementStatusSchema = z.enum(["green", "amber", "red"]);
export type EngagementStatus = z.infer<typeof engagementStatusSchema>;

export const sourceKindSchema = z.enum([
  "health_auto_export",
  "hevy",
  "strava",
  "google_calendar",
  "telegram",
  "manual"
]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const dayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

export const defaultDayTemplates: Record<
  DayOfWeek,
  {
    dayOfWeek: DayOfWeek;
    activityType: string;
    intensity: string | null;
    preferredTime: string | null;
    notes: string | null;
    hevyRoutineId: string | null;
    hevyRoutineTitle: string | null;
  }
> = {
  monday: {
    dayOfWeek: "monday",
    activityType: "Rest / active recovery",
    intensity: "rest",
    preferredTime: null,
    notes: "Default recovery day.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  },
  tuesday: {
    dayOfWeek: "tuesday",
    activityType: "PT session",
    intensity: "intense",
    preferredTime: "morning",
    notes: "Trainer-led session.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  },
  wednesday: {
    dayOfWeek: "wednesday",
    activityType: "Variety session",
    intensity: "light",
    preferredTime: "morning",
    notes: "Swim, walk, bike, or yoga.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  },
  thursday: {
    dayOfWeek: "thursday",
    activityType: "Intense session",
    intensity: "intense",
    preferredTime: "morning",
    notes: "Strength or cardio.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  },
  friday: {
    dayOfWeek: "friday",
    activityType: "Rest / active recovery",
    intensity: "rest",
    preferredTime: null,
    notes: "Default recovery day.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  },
  saturday: {
    dayOfWeek: "saturday",
    activityType: "Intense session",
    intensity: "intense",
    preferredTime: "morning",
    notes: "Strength or cardio.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  },
  sunday: {
    dayOfWeek: "sunday",
    activityType: "Rest / active recovery",
    intensity: "rest",
    preferredTime: null,
    notes: "Default recovery day.",
    hevyRoutineId: null,
    hevyRoutineTitle: null
  }
};

export const mealLoggingMethodSchema = z.enum([
  "photo",
  "barcode",
  "text",
  "quick_log"
]);
export type MealLoggingMethod = z.infer<typeof mealLoggingMethodSchema>;

export const scoreTypeSchema = z.enum([
  "workout_adherence",
  "effort",
  "recovery",
  "consistency"
]);
export type ScoreType = z.infer<typeof scoreTypeSchema>;

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

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
