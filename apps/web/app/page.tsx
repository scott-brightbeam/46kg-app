"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "trainer" | "nutritionist";
};

type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type AccessCategory = "exercise" | "nutrition" | "weight" | "engagement_status";
type ScoreKey = "workout_adherence" | "effort" | "recovery" | "consistency";

type DayTemplateSnapshot = {
  dayOfWeek: DayOfWeek;
  activityType: string;
  intensity: string | null;
  preferredTime: string | null;
  notes: string | null;
  hevyRoutineId: string | null;
  hevyRoutineTitle: string | null;
};

type DayTemplateDraft = {
  activityType: string;
  intensity: string;
  preferredTime: string;
  notes: string;
  hevyRoutineId: string;
  hevyRoutineTitle: string;
};

type HevyRoutineOption = {
  id: string;
  title: string;
  folderId: number | null;
};

type ScoreSnapshot = {
  scoreType: ScoreKey;
  value: number;
  confidence: number | null;
  formulaVersion: string;
  scoreDate: string;
};

type GrantSnapshot = {
  practitionerUserId: string;
  practitionerDisplayName: string;
  practitionerRole: "trainer" | "nutritionist";
  effectiveCategories: AccessCategory[];
};

type NutritionTargetState = {
  targets: {
    calories: number | null;
    protein: number | null;
    fibre: number | null;
  };
  source: "stored" | "default";
  notes: string | null;
  updatedAt: string | null;
};

type NutritionTargetDraft = {
  calories: string;
  protein: string;
  fibre: string;
};

type DailySummary = {
  date: string;
  dayOfWeek: DayOfWeek;
  workouts: Array<{
    title: string;
    source: string;
    startedAt: string;
  }>;
  meals: {
    entries: Array<{
      id: string;
      description: string;
      calories: number;
      loggedAt: string;
      confidence: number | null;
      method: "photo" | "barcode" | "text" | "quick_log";
    }>;
    totals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fibre: number;
    };
  };
  nutritionBudget: {
    targets: {
      calories: number | null;
      protein: number | null;
      fibre: number | null;
    };
    consumed: {
      calories: number;
      protein: number;
      fibre: number;
    };
    remaining: {
      calories: number | null;
      protein: number | null;
      fibre: number | null;
    };
  } | null;
  latestWeight: {
    kilograms: number;
    observedAt: string;
  } | null;
  engagementStatus: {
    status: string;
    effectiveAt: string;
  } | null;
  scores: Partial<Record<ScoreKey, ScoreSnapshot>>;
  dailyPlan: {
    summary: string;
    workoutPlan: {
      activityType?: string;
      status?: string;
      durationMinutes?: number;
      suggestedStart?: string | null;
      suggestedEnd?: string | null;
    } | null;
    mealPlan: unknown;
  } | null;
  dayTemplate: DayTemplateSnapshot | null;
  freshness: Array<{
    source: string;
    lastSuccessfulIngestAt: string | null;
    lastStatus: string | null;
  }>;
};

type WeeklySummary = {
  weekStart: string;
  workoutCount: number;
  workoutDurationSeconds: number;
  meals: {
    totalEntries: number;
    daysWithTwoMealsLogged: number;
    totals: {
      calories: number;
      protein: number;
      fibre: number;
    };
  };
  latestWeight: {
    kilograms: number;
  } | null;
  previousWeight: {
    kilograms: number;
  } | null;
  weightDeltaKg: number | null;
  scores: Partial<Record<ScoreKey, ScoreSnapshot>>;
  engagementStatus: {
    status: string;
  } | null;
};

type OperatorStatus = {
  generatedAt: string;
  overallStatus: "healthy" | "warning" | "critical";
  sources: Array<{
    key: string;
    label: string;
    status: "healthy" | "warning" | "critical" | "unknown" | "skipped";
    detail: string;
    lastSeenAt: string | null;
  }>;
  jobs: Array<{
    key: string;
    label: string;
    status: "healthy" | "warning" | "critical" | "unknown" | "skipped";
    detail: string;
    lastSeenAt: string | null;
  }>;
  alerts: Array<{
    alertKey: string;
    category: string;
    severity: "info" | "warning" | "critical";
    summary: string;
    details: string | null;
    lastRaisedAt: string;
    lastNotifiedAt: string | null;
    notificationCount: number;
  }>;
};

const ACCESS_CATEGORY_COPY: Record<
  AccessCategory,
  {
    label: string;
    description: string;
  }
> = {
  exercise: {
    label: "Exercise",
    description: "Workouts, adherence, and training-side plan context."
  },
  nutrition: {
    label: "Nutrition",
    description: "Meals, calories, macros, and meal-plan context."
  },
  weight: {
    label: "Weight",
    description: "Weight entries, trend movement, and weight delta."
  },
  engagement_status: {
    label: "Engagement",
    description: "Green/amber/red recovery state and relapse signals."
  }
};

const DEFAULT_SCOPE_BY_ROLE: Record<AuthUser["role"], AccessCategory[]> = {
  user: ["exercise", "nutrition", "weight", "engagement_status"],
  trainer: ["exercise"],
  nutritionist: ["nutrition", "weight"]
};

const ROLE_COPY: Record<
  AuthUser["role"],
  {
    eyebrow: string;
    lead: string;
    scopeLabel: string;
  }
> = {
  user: {
    eyebrow: "Live coaching surface",
    lead: "Full-owner view over the same scoped state that powers Zaphod: daily plan, weekly trend, freshness, and consent controls.",
    scopeLabel: "Owner access"
  },
  trainer: {
    eyebrow: "Trainer view",
    lead: "Strength-side operating picture with scheduling, adherence, and any extra visibility the user has explicitly granted.",
    scopeLabel: "Coach scope"
  },
  nutritionist: {
    eyebrow: "Nutritionist view",
    lead: "Intake-side working view with meal coverage, weight context, and any extra visibility the user has explicitly granted.",
    scopeLabel: "Nutrition scope"
  }
};

const ORDERED_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

const INTENSITY_OPTIONS = [
  { label: "None", value: "" },
  { label: "Rest", value: "rest" },
  { label: "Light", value: "light" },
  { label: "Moderate", value: "moderate" },
  { label: "Intense", value: "intense" }
] as const;

const PREFERRED_TIME_OPTIONS = [
  { label: "Any time", value: "" },
  { label: "Morning", value: "morning" },
  { label: "Midday", value: "midday" },
  { label: "Evening", value: "evening" }
] as const;

function getCurrentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: string) {
  const base = new Date(`${date}T12:00:00`);
  const day = base.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + delta);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const currentDay = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${currentDay}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatClockRange(start?: string | null, end?: string | null) {
  if (!start || !end) {
    return "Time not set";
  }

  return `${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(start))}-${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(end))}`;
}

function formatDuration(seconds: number) {
  if (!seconds) {
    return "0 min";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function formatMealMethod(method: "photo" | "barcode" | "text" | "quick_log") {
  switch (method) {
    case "quick_log":
      return "Quick log";
    case "photo":
      return "Photo";
    case "barcode":
      return "Barcode";
    case "text":
      return "Text estimate";
    default:
      return method;
  }
}

function formatScoreLabel(scoreKey: ScoreKey) {
  switch (scoreKey) {
    case "workout_adherence":
      return "Adherence";
    case "effort":
      return "Effort";
    case "recovery":
      return "Recovery";
    case "consistency":
      return "Consistency";
    default:
      return scoreKey;
  }
}

function formatDayLabel(dayOfWeek: DayOfWeek) {
  return `${dayOfWeek[0]?.toUpperCase() ?? ""}${dayOfWeek.slice(1)}`;
}

function formatDayTemplateSummary(template: DayTemplateSnapshot) {
  const parts = [template.activityType];
  if (template.intensity) {
    parts.push(template.intensity);
  }
  if (template.preferredTime) {
    parts.push(template.preferredTime);
  }
  if (template.hevyRoutineTitle) {
    parts.push(`Hevy: ${template.hevyRoutineTitle}`);
  }
  return parts.join(" · ");
}

function createEmptyTemplateDrafts() {
  return ORDERED_DAYS.reduce(
    (accumulator, dayOfWeek) => {
      accumulator[dayOfWeek] = {
        activityType: "",
        intensity: "",
        preferredTime: "",
        notes: "",
        hevyRoutineId: "",
        hevyRoutineTitle: ""
      };
      return accumulator;
    },
    {} as Record<DayOfWeek, DayTemplateDraft>
  );
}

function buildTemplateDrafts(templates: DayTemplateSnapshot[]) {
  const drafts = createEmptyTemplateDrafts();

  for (const template of templates) {
    drafts[template.dayOfWeek] = {
      activityType: template.activityType,
      intensity: template.intensity ?? "",
      preferredTime: template.preferredTime ?? "",
      notes: template.notes ?? "",
      hevyRoutineId: template.hevyRoutineId ?? "",
      hevyRoutineTitle: template.hevyRoutineTitle ?? ""
    };
  }

  return drafts;
}

function buildNutritionTargetDraft(targetState: NutritionTargetState | null): NutritionTargetDraft {
  return {
    calories: targetState?.targets.calories?.toString() ?? "",
    protein: targetState?.targets.protein?.toString() ?? "",
    fibre: targetState?.targets.fibre?.toString() ?? ""
  };
}

async function apiRequest<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers ?? undefined);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    [key: string]: unknown;
  } | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(getCurrentLocalDate);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<AccessCategory[]>([]);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [grants, setGrants] = useState<GrantSnapshot[]>([]);
  const [templates, setTemplates] = useState<DayTemplateSnapshot[]>([]);
  const [hevyRoutineOptions, setHevyRoutineOptions] = useState<HevyRoutineOption[]>([]);
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatus | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<Record<DayOfWeek, DayTemplateDraft>>(
    createEmptyTemplateDrafts
  );
  const [nutritionTargetState, setNutritionTargetState] = useState<NutritionTargetState | null>(null);
  const [nutritionTargetDraft, setNutritionTargetDraft] = useState<NutritionTargetDraft>(
    buildNutritionTargetDraft(null)
  );
  const [error, setError] = useState<string | null>(null);
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);
  const [nutritionTargetFeedback, setNutritionTargetFeedback] = useState<string | null>(null);
  const [activeGrantKey, setActiveGrantKey] = useState<string | null>(null);
  const [activeTemplateDay, setActiveTemplateDay] = useState<DayOfWeek | null>(null);
  const [savingNutritionTargets, setSavingNutritionTargets] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadDashboard(date: string) {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const auth = await apiRequest<{ user: AuthUser; access: { categories: AccessCategory[] } }>("/auth/me");
          const weekStart = getWeekStart(date);
          const requests = [
            apiRequest<{ summary: DailySummary }>(`/state/daily?date=${date}`),
            apiRequest<{ summary: WeeklySummary }>(`/state/weekly?weekStart=${weekStart}`)
          ] as const;
          const grantRequest =
            auth.user.role === "user"
              ? apiRequest<{ grants: GrantSnapshot[] }>("/access-grants")
              : Promise.resolve<{ grants: GrantSnapshot[] }>({
                  grants: []
                });
          const templateRequest = auth.access.categories.includes("exercise")
            ? apiRequest<{ templates: DayTemplateSnapshot[]; hevyRoutines: HevyRoutineOption[] }>("/day-templates")
            : Promise.resolve<{ templates: DayTemplateSnapshot[]; hevyRoutines: HevyRoutineOption[] }>({
                templates: [],
                hevyRoutines: []
              });
          const nutritionTargetRequest = auth.access.categories.includes("nutrition")
            ? apiRequest<NutritionTargetState>("/nutrition-targets")
            : Promise.resolve<NutritionTargetState | null>(null);
          const opsRequest =
            auth.user.role === "user"
              ? apiRequest<{ status: OperatorStatus }>("/ops/status")
              : Promise.resolve<{ status: OperatorStatus | null }>({
                  status: null
                });
          const [dailyResponse, weeklyResponse, grantResponse, templateResponse, nutritionResponse, opsResponse] = await Promise.all([
            ...requests,
            grantRequest,
            templateRequest,
            nutritionTargetRequest,
            opsRequest
          ]);

          setUser(auth.user);
          setVisibleCategories(auth.access.categories);
          setDaily(dailyResponse.summary);
          setWeekly(weeklyResponse.summary);
          setGrants(grantResponse.grants);
          setTemplates(templateResponse.templates);
          setHevyRoutineOptions(templateResponse.hevyRoutines);
          setNutritionTargetState(nutritionResponse);
          setOperatorStatus(opsResponse.status);
        } catch (requestError) {
          const message =
            requestError instanceof Error ? requestError.message : "Unable to load the dashboard.";
          if (/authentication required/i.test(message)) {
            setUser(null);
            setVisibleCategories([]);
            setDaily(null);
            setWeekly(null);
            setGrants([]);
            setTemplates([]);
            setHevyRoutineOptions([]);
            setNutritionTargetState(null);
            setOperatorStatus(null);
          } else {
            setError(message);
          }
        } finally {
          setAuthChecked(true);
        }
      })();
    });
  }

  useEffect(() => {
    loadDashboard(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    setTemplateDrafts(buildTemplateDrafts(templates));
  }, [templates]);

  useEffect(() => {
    setNutritionTargetDraft(buildNutritionTargetDraft(nutritionTargetState));
  }, [nutritionTargetState]);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({
              email,
              password
            })
          });
          setPassword("");
          loadDashboard(selectedDate);
        } catch (requestError) {
          setError(
            requestError instanceof Error ? requestError.message : "Unable to sign in right now."
          );
          setUser(null);
        }
      })();
    });
  }

  function handleLogout() {
    startTransition(() => {
      void (async () => {
        await apiRequest("/auth/logout", {
          method: "POST"
        });
        setUser(null);
        setVisibleCategories([]);
        setDaily(null);
        setWeekly(null);
        setGrants([]);
        setTemplates([]);
        setHevyRoutineOptions([]);
        setNutritionTargetState(null);
        setOperatorStatus(null);
        setGrantFeedback(null);
        setTemplateFeedback(null);
        setNutritionTargetFeedback(null);
      })();
    });
  }

  function handleGrantToggle(practitionerRole: "trainer" | "nutritionist", category: AccessCategory, enabled: boolean) {
    const grantKey = `${practitionerRole}:${category}`;
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setGrantFeedback(null);
          setActiveGrantKey(grantKey);
          const response = await apiRequest<{ grants: GrantSnapshot[]; message: string }>(
            enabled ? "/access-grants/revoke" : "/access-grants/grant",
            {
              method: "POST",
              body: JSON.stringify({
                practitionerRole,
                category
              })
            }
          );
          setGrants(response.grants);
          setGrantFeedback(response.message);
          loadDashboard(selectedDate);
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to update access right now."
          );
        } finally {
          setActiveGrantKey(null);
        }
      })();
    });
  }

  function handleTemplateDraftChange(
    dayOfWeek: DayOfWeek,
    field: keyof DayTemplateDraft,
    value: string
  ) {
    setTemplateDrafts((current) => ({
      ...current,
      [dayOfWeek]: {
        ...current[dayOfWeek],
        [field]: value
      }
    }));
  }

  function handleTemplateRoutineChange(dayOfWeek: DayOfWeek, routineId: string) {
    const selectedRoutine = hevyRoutineOptions.find((routine) => routine.id === routineId) ?? null;
    setTemplateDrafts((current) => ({
      ...current,
      [dayOfWeek]: {
        ...current[dayOfWeek],
        hevyRoutineId: selectedRoutine?.id ?? "",
        hevyRoutineTitle: selectedRoutine?.title ?? ""
      }
    }));
  }

  function handleTemplateSave(dayOfWeek: DayOfWeek) {
    const draft = templateDrafts[dayOfWeek];
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setTemplateFeedback(null);
          setActiveTemplateDay(dayOfWeek);

          const activityType = draft?.activityType.trim();
          if (!activityType) {
            throw new Error("Activity type is required.");
          }

          const response = await apiRequest<{
            templates: DayTemplateSnapshot[];
            hevyRoutines: HevyRoutineOption[];
            message: string;
          }>("/day-templates", {
            method: "POST",
            body: JSON.stringify({
              dayOfWeek,
              activityType,
              intensity: draft?.intensity || null,
              preferredTime: draft?.preferredTime || null,
              notes: draft?.notes.trim() ? draft.notes.trim() : null,
              hevyRoutineId: draft?.hevyRoutineId || null,
              hevyRoutineTitle: draft?.hevyRoutineTitle || null
            })
          });

          setTemplates(response.templates);
          setHevyRoutineOptions(response.hevyRoutines);
          setTemplateFeedback(response.message);
          setDaily((current) =>
            current && current.dayOfWeek === dayOfWeek
              ? {
                  ...current,
                  dayTemplate: {
                    dayOfWeek,
                    activityType,
                    intensity: draft?.intensity || null,
                    preferredTime: draft?.preferredTime || null,
                    notes: draft?.notes.trim() ? draft.notes.trim() : null,
                    hevyRoutineId: draft?.hevyRoutineId || null,
                    hevyRoutineTitle: draft?.hevyRoutineTitle || null
                  }
                }
              : current
          );
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to update the weekly template right now."
          );
        } finally {
          setActiveTemplateDay(null);
        }
      })();
    });
  }

  function handleNutritionTargetSave() {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setNutritionTargetFeedback(null);
          setSavingNutritionTargets(true);

          const response = await apiRequest<{
            message: string;
            targets: NutritionTargetState["targets"];
            source: NutritionTargetState["source"];
            notes: string | null;
            updatedAt: string | null;
          }>("/nutrition-targets", {
            method: "POST",
            body: JSON.stringify({
              calories: nutritionTargetDraft.calories
                ? Number(nutritionTargetDraft.calories)
                : null,
              protein: nutritionTargetDraft.protein
                ? Number(nutritionTargetDraft.protein)
                : null,
              fibre: nutritionTargetDraft.fibre ? Number(nutritionTargetDraft.fibre) : null
            })
          });

          setNutritionTargetState({
            targets: response.targets,
            source: response.source,
            notes: response.notes,
            updatedAt: response.updatedAt
          });
          setNutritionTargetFeedback(response.message);
          loadDashboard(selectedDate);
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to update nutrition targets right now."
          );
        } finally {
          setSavingNutritionTargets(false);
        }
      })();
    });
  }

  const workoutPlan = daily?.dailyPlan?.workoutPlan ?? null;
  const workoutHeadline = workoutPlan?.activityType ?? daily?.workouts[0]?.title ?? "No workout loaded";
  const roleCopy = ROLE_COPY[user?.role ?? "user"];
  const visibleScoreKeys: ScoreKey[] = ["workout_adherence", "effort", "recovery", "consistency"];
  const hiddenCategories = user
    ? (Object.keys(ACCESS_CATEGORY_COPY) as AccessCategory[]).filter(
        (category) => !visibleCategories.includes(category)
      )
    : [];
  const canViewTemplates = visibleCategories.includes("exercise");
  const canViewNutritionTargets = visibleCategories.includes("nutrition");
  const selectedDayTemplate = daily?.dayTemplate;

  return (
    <main className="dashboard-shell">
      <section className="hero-band">
        <div>
          <p className="eyebrow">{roleCopy.eyebrow}</p>
          <h1>46KG</h1>
          <p className="lede">
            {roleCopy.lead}
          </p>
        </div>
        <div className="hero-panel">
          <span className="hero-label">API</span>
          <strong>{API_BASE_URL}</strong>
          <span className={isPending ? "status-pill status-live" : "status-pill"}>
            {isPending ? "Refreshing" : authChecked ? "Connected" : "Checking session"}
          </span>
          {user ? (
            <p className="hero-scope">
              {roleCopy.scopeLabel}: {visibleCategories.map((category) => ACCESS_CATEGORY_COPY[category].label).join(", ")}
            </p>
          ) : null}
        </div>
      </section>

      {!user ? (
        <section className="login-grid">
          <article className="panel statement-panel">
            <h2>What this dashboard now does</h2>
            <ul className="feature-list">
              <li>Signs in against the API and holds a signed session cookie.</li>
              <li>Loads role-scoped daily and weekly summaries through authenticated routes.</li>
              <li>Shows the same planner outputs the Telegram coach is using.</li>
            </ul>
          </article>
          <article className="panel login-panel">
            <h2>Sign in</h2>
            <form className="login-form" data-testid="login-form" onSubmit={handleLogin}>
              <label>
                Email
                <input
                  autoComplete="email"
                  data-testid="login-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="current-password"
                  data-testid="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                />
              </label>
              <button
                className="primary-button"
                data-testid="login-submit"
                type="submit"
                disabled={isPending}
              >
                {isPending ? "Signing in..." : "Open dashboard"}
              </button>
            </form>
            <p className="muted-copy">
              The API enforces role-aware redaction, so trainer and nutritionist logins can
              reuse this same surface safely.
            </p>
            {error ? <p className="error-banner" data-testid="error-banner">{error}</p> : null}
          </article>
        </section>
      ) : (
        <>
          <section className="toolbar">
            <div>
              <p className="eyebrow">Signed in</p>
              <h2>{user.displayName}</h2>
              <p className="muted-copy">
                {user.role} view for {selectedDate}
              </p>
            </div>
            <div className="toolbar-actions">
              <label className="date-picker">
                <span>Focus date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
              <button className="secondary-button" type="button" onClick={() => loadDashboard(selectedDate)}>
                Refresh
              </button>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </section>

          {error ? <p className="error-banner" data-testid="error-banner">{error}</p> : null}
          {grantFeedback ? (
            <p className="success-banner" data-testid="success-banner">
              {grantFeedback}
            </p>
          ) : null}
          {templateFeedback ? (
            <p className="success-banner" data-testid="template-success-banner">
              {templateFeedback}
            </p>
          ) : null}
          {nutritionTargetFeedback ? (
            <p className="success-banner" data-testid="nutrition-target-success-banner">
              {nutritionTargetFeedback}
            </p>
          ) : null}

          <section className="metrics-grid">
            <article className="panel lead-panel">
              <div className="panel-header">
                <span className="eyebrow">Today</span>
                <span className="status-pill">
                  {daily?.engagementStatus?.status ?? "scoped"}
                </span>
              </div>
              <h3>{workoutHeadline}</h3>
              <p className="headline-copy">
                {daily?.dailyPlan?.summary ?? "No daily plan has been generated yet."}
              </p>
              <dl className="metric-pairs">
                <div>
                  <dt>Workout slot</dt>
                  <dd>{formatClockRange(workoutPlan?.suggestedStart, workoutPlan?.suggestedEnd)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{workoutPlan?.status ?? "Not scheduled"}</dd>
                </div>
                <div>
                  <dt>Template</dt>
                  <dd>
                    {selectedDayTemplate
                      ? formatDayTemplateSummary(selectedDayTemplate)
                      : "No weekly template loaded"}
                  </dd>
                </div>
                <div>
                  <dt>Calories logged</dt>
                  <dd>{daily?.meals.totals.calories ?? 0}</dd>
                </div>
                <div>
                  <dt>Latest weight</dt>
                  <dd>
                    {daily?.latestWeight ? `${daily.latestWeight.kilograms.toFixed(1)} kg` : "Hidden or not logged"}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <div className="panel-header">
                <span className="eyebrow">Week</span>
                <span className="status-pill accent-pill">
                  {weekly?.workoutCount ?? 0} workouts
                </span>
              </div>
              <h3>Weekly trend</h3>
              <dl className="metric-pairs">
                <div>
                  <dt>Training volume</dt>
                  <dd>{formatDuration(weekly?.workoutDurationSeconds ?? 0)}</dd>
                </div>
                <div>
                  <dt>Meals logged</dt>
                  <dd>{weekly?.meals.totalEntries ?? 0}</dd>
                </div>
                <div>
                  <dt>Coverage</dt>
                  <dd>{weekly?.meals.daysWithTwoMealsLogged ?? 0} days with 2+ meals</dd>
                </div>
                <div>
                  <dt>Weight delta</dt>
                  <dd>
                    {weekly?.weightDeltaKg === null || weekly?.weightDeltaKg === undefined
                      ? "Hidden or insufficient data"
                      : `${weekly.weightDeltaKg.toFixed(1)} kg`}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <div className="panel-header">
                <span className="eyebrow">Nutrition</span>
                <span className="status-pill">Today</span>
              </div>
              <h3>Meal log</h3>
              <ul className="stack-list">
                {(daily?.meals.entries ?? []).length === 0 ? (
                  <li>No visible meal entries in this scope yet.</li>
                ) : (
                  (daily?.meals.entries ?? []).slice(0, 4).map((meal) => (
                    <li key={meal.id}>
                      <div>
                        <strong>{meal.description}</strong>
                        <p className="entry-meta">
                          {formatMealMethod(meal.method)}
                          {meal.confidence !== null
                            ? ` · ${Math.round(meal.confidence * 100)}% confidence`
                            : ""}
                        </p>
                      </div>
                      <span>{meal.calories} kcal</span>
                    </li>
                  ))
                )}
              </ul>
              <p className="muted-copy">
                Protein {daily?.meals.totals.protein ?? 0}g. Carbs {daily?.meals.totals.carbs ?? 0}g. Fat {daily?.meals.totals.fat ?? 0}g.
              </p>
              {daily?.nutritionBudget ? (
                <p className="muted-copy">
                  Target {daily.nutritionBudget.targets.calories ?? "?"} kcal.
                  Remaining {daily.nutritionBudget.remaining.calories ?? "?"} kcal.
                  Protein to go {daily.nutritionBudget.remaining.protein ?? "?"}g.
                </p>
              ) : null}
            </article>

            <article className="panel">
              <div className="panel-header">
                <span className="eyebrow">Freshness</span>
                <span className="status-pill">Signals</span>
              </div>
              <h3>Latest source syncs</h3>
              <ul className="stack-list">
                {(daily?.freshness ?? []).length === 0 ? (
                  <li>No freshness records yet.</li>
                ) : (
                  (daily?.freshness ?? []).map((entry) => (
                    <li key={entry.source}>
                      <strong>{entry.source}</strong>
                      <span>{entry.lastSuccessfulIngestAt ? formatDateTime(entry.lastSuccessfulIngestAt) : "No successful sync yet"}</span>
                    </li>
                  ))
                )}
              </ul>
            </article>
          </section>

          <section className="summary-grid">
            <article className="panel score-panel" data-testid="score-panel">
              <div className="panel-header">
                <span className="eyebrow">Signals</span>
                <span className="status-pill accent-pill">
                  {daily?.engagementStatus?.status ?? "scoped"}
                </span>
              </div>
              <h3>Scoreboard</h3>
              <dl className="metric-pairs">
                {visibleScoreKeys.map((scoreKey) => (
                  <div key={scoreKey}>
                    <dt>{formatScoreLabel(scoreKey)}</dt>
                    <dd>
                      {typeof daily?.scores?.[scoreKey]?.value === "number"
                        ? `${Math.round(daily.scores[scoreKey]!.value)}`
                        : "Hidden or not scored"}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="muted-copy">
                Weekly engagement: {weekly?.engagementStatus?.status ?? "Hidden or not scored"}.
              </p>
            </article>

            <article className="panel role-panel" data-testid="scope-panel">
              <div className="panel-header">
                <span className="eyebrow">Scope</span>
                <span className="status-pill accent-pill">
                  {visibleCategories.length} visible
                </span>
              </div>
              <h3>{user.role === "user" ? "Everything is in scope" : "Current practitioner visibility"}</h3>
              <p className="muted-copy">
                {user.role === "user"
                  ? "This is the full owner view. Trainer and nutritionist sessions see a redacted subset."
                  : "This session only shows the categories the user has left visible for your role."}
              </p>
              <div className="scope-columns">
                <div>
                  <h4>Visible</h4>
                  <ul className="pill-list">
                    {visibleCategories.map((category) => (
                      <li key={category} className="scope-pill scope-pill-live">
                        {ACCESS_CATEGORY_COPY[category].label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Hidden</h4>
                  <ul className="pill-list">
                    {hiddenCategories.length === 0 ? (
                      <li className="scope-pill">Nothing hidden</li>
                    ) : (
                      hiddenCategories.map((category) => (
                        <li key={category} className="scope-pill">
                          {ACCESS_CATEGORY_COPY[category].label}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </article>

            <article className="panel report-panel" data-testid="report-panel">
              <div className="panel-header">
                <span className="eyebrow">Report card</span>
                <span className="status-pill">{user.role}</span>
              </div>
              <h3>
                {user.role === "trainer"
                  ? "Coaching summary"
                  : user.role === "nutritionist"
                    ? "Nutrition summary"
                    : "Operator summary"}
              </h3>
              <ul className="stack-list">
                {user.role === "trainer" ? (
                  <>
                    <li>
                      <strong>Workouts visible</strong>
                      <span>{daily?.workouts.length ?? 0} today</span>
                    </li>
                    <li>
                      <strong>Training volume</strong>
                      <span>{formatDuration(weekly?.workoutDurationSeconds ?? 0)}</span>
                    </li>
                    <li>
                      <strong>Plan context</strong>
                      <span>{workoutPlan?.status ?? "No plan loaded"}</span>
                    </li>
                  </>
                ) : user.role === "nutritionist" ? (
                  <>
                    <li>
                      <strong>Meal entries visible</strong>
                      <span>{daily?.meals.entries.length ?? 0} today</span>
                    </li>
                    <li>
                      <strong>Calories visible</strong>
                      <span>{daily?.meals.totals.calories ?? 0} kcal</span>
                    </li>
                    <li>
                      <strong>Weight context</strong>
                      <span>
                        {weekly?.weightDeltaKg === null || weekly?.weightDeltaKg === undefined
                          ? "Hidden or insufficient data"
                          : `${weekly.weightDeltaKg.toFixed(1)} kg`}
                      </span>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <strong>Practitioner sharing</strong>
                      <span>{grants.length} roles configured</span>
                    </li>
                    <li>
                      <strong>Weekly workouts</strong>
                      <span>{weekly?.workoutCount ?? 0}</span>
                    </li>
                    <li>
                      <strong>Weekly meal coverage</strong>
                      <span>{weekly?.meals.daysWithTwoMealsLogged ?? 0} days</span>
                    </li>
                  </>
                )}
              </ul>
            </article>

            {user.role === "user" ? (
              <article className="panel report-panel" data-testid="ops-panel">
                <div className="panel-header">
                  <span className="eyebrow">Operations</span>
                  <span className={`status-pill ${operatorStatus?.overallStatus === "critical" ? "status-live" : ""}`}>
                    {operatorStatus?.overallStatus ?? "unknown"}
                  </span>
                </div>
                <h3>Live system health</h3>
                <ul className="stack-list">
                  <li>
                    <strong>Generated</strong>
                    <span>{operatorStatus?.generatedAt ? formatDateTime(operatorStatus.generatedAt) : "Not loaded"}</span>
                  </li>
                  <li>
                    <strong>Open alerts</strong>
                    <span>{operatorStatus?.alerts.length ?? 0}</span>
                  </li>
                  <li>
                    <strong>Source health</strong>
                    <span>
                      {(operatorStatus?.sources ?? [])
                        .filter((item) => item.status === "warning" || item.status === "critical")
                        .length || "All clear"}
                    </span>
                  </li>
                  <li>
                    <strong>Recent job warnings</strong>
                    <span>
                      {(operatorStatus?.jobs ?? [])
                        .filter((item) => item.status === "warning" || item.status === "critical")
                        .length || "None"}
                    </span>
                  </li>
                </ul>
                {operatorStatus?.alerts.length ? (
                  <ul className="stack-list">
                    {operatorStatus.alerts.slice(0, 3).map((alert) => (
                      <li key={alert.alertKey}>
                        <div>
                          <strong>{alert.summary}</strong>
                          <p className="entry-meta">{alert.details ?? alert.category}</p>
                        </div>
                        <span>{formatDateTime(alert.lastRaisedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-copy">
                    No open operator alerts. Latest sources and cron jobs are visible below.
                  </p>
                )}
                <ul className="stack-list">
                  {(operatorStatus?.jobs ?? []).slice(0, 4).map((job) => (
                    <li key={job.key}>
                      <div>
                        <strong>{job.label}</strong>
                        <p className="entry-meta">{job.detail}</p>
                      </div>
                      <span>{job.status}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </section>

          {canViewTemplates ? (
            <section className="template-section">
              <article className="panel template-panel" data-testid="template-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Weekly template</p>
                    <h3>
                      {user.role === "user" ? "Edit the default week" : "Current weekly schedule"}
                    </h3>
                  </div>
                  <span className="status-pill accent-pill">{templates.length} days</span>
                </div>
                <p className="muted-copy">
                  {user.role === "user"
                    ? "These defaults feed daily planning before the calendar and recovery signals start reshaping the day."
                    : "This is the stored weekly template the planner starts from before calendar and recovery adjustments."}
                </p>
                <div className="template-list">
                  {templates.map((template) => {
                    const draft = templateDrafts[template.dayOfWeek];
                    const summary = formatDayTemplateSummary(template);

                    return (
                      <article
                        className="template-card"
                        data-testid={`template-row-${template.dayOfWeek}`}
                        key={template.dayOfWeek}
                      >
                        <div className="template-card-header">
                          <div>
                            <span className="eyebrow">{formatDayLabel(template.dayOfWeek)}</span>
                            <h4>{summary}</h4>
                          </div>
                          {user.role === "user" ? (
                            <button
                              className="secondary-button"
                              data-testid={`template-save-${template.dayOfWeek}`}
                              type="button"
                              disabled={isPending || activeTemplateDay === template.dayOfWeek}
                              onClick={() => handleTemplateSave(template.dayOfWeek)}
                            >
                              {activeTemplateDay === template.dayOfWeek ? "Saving..." : "Save"}
                            </button>
                          ) : (
                            <span className="grant-badge">Read only</span>
                          )}
                        </div>
                        {user.role === "user" ? (
                          <div className="template-editor-grid">
                            <label>
                              Activity
                              <input
                                data-testid={`template-activity-${template.dayOfWeek}`}
                                type="text"
                                value={draft?.activityType ?? ""}
                                onChange={(event) =>
                                  handleTemplateDraftChange(
                                    template.dayOfWeek,
                                    "activityType",
                                    event.target.value
                                  )
                                }
                              />
                            </label>
                            <label>
                              Intensity
                              <select
                                data-testid={`template-intensity-${template.dayOfWeek}`}
                                value={draft?.intensity ?? ""}
                                onChange={(event) =>
                                  handleTemplateDraftChange(
                                    template.dayOfWeek,
                                    "intensity",
                                    event.target.value
                                  )
                                }
                              >
                                {INTENSITY_OPTIONS.map((option) => (
                                  <option key={option.value || "none"} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Preferred time
                              <select
                                data-testid={`template-time-${template.dayOfWeek}`}
                                value={draft?.preferredTime ?? ""}
                                onChange={(event) =>
                                  handleTemplateDraftChange(
                                    template.dayOfWeek,
                                    "preferredTime",
                                    event.target.value
                                  )
                                }
                              >
                                {PREFERRED_TIME_OPTIONS.map((option) => (
                                  <option key={option.value || "any"} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Hevy routine
                              <select
                                data-testid={`template-routine-${template.dayOfWeek}`}
                                value={draft?.hevyRoutineId ?? ""}
                                onChange={(event) =>
                                  handleTemplateRoutineChange(template.dayOfWeek, event.target.value)
                                }
                              >
                                <option value="">No linked routine</option>
                                {hevyRoutineOptions.map((routine) => (
                                  <option key={routine.id} value={routine.id}>
                                    {routine.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ) : (
                          <p className="template-summary">{summary}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </article>
            </section>
          ) : null}

          {canViewNutritionTargets ? (
            <section className="template-section">
              <article className="panel template-panel" data-testid="nutrition-target-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Nutrition targets</p>
                    <h3>
                      {user.role === "user" ? "Daily calorie and macro floor" : "Current intake targets"}
                    </h3>
                  </div>
                  <span className="status-pill accent-pill">
                    {nutritionTargetState?.source ?? "default"}
                  </span>
                </div>
                <p className="muted-copy">
                  {user.role === "user"
                    ? "These targets drive the remaining-budget math in the dashboard and the coaching prompts."
                    : "These are the active targets the nutrition-side budget is being measured against."}
                </p>
                {user.role === "user" ? (
                  <div className="template-editor-grid">
                    <label>
                      Calories
                      <input
                        data-testid="nutrition-target-calories"
                        type="number"
                        min="0"
                        step="1"
                        value={nutritionTargetDraft.calories}
                        onChange={(event) =>
                          setNutritionTargetDraft((current) => ({
                            ...current,
                            calories: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Protein (g)
                      <input
                        data-testid="nutrition-target-protein"
                        type="number"
                        min="0"
                        step="1"
                        value={nutritionTargetDraft.protein}
                        onChange={(event) =>
                          setNutritionTargetDraft((current) => ({
                            ...current,
                            protein: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Fibre (g)
                      <input
                        data-testid="nutrition-target-fibre"
                        type="number"
                        min="0"
                        step="1"
                        value={nutritionTargetDraft.fibre}
                        onChange={(event) =>
                          setNutritionTargetDraft((current) => ({
                            ...current,
                            fibre: event.target.value
                          }))
                        }
                      />
                    </label>
                    <div className="template-card-header">
                      <div>
                        <span className="eyebrow">Last update</span>
                        <h4>
                          {nutritionTargetState?.updatedAt
                            ? formatDateTime(nutritionTargetState.updatedAt)
                            : "No stored update yet"}
                        </h4>
                      </div>
                      <button
                        className="secondary-button"
                        data-testid="nutrition-target-save"
                        type="button"
                        disabled={isPending || savingNutritionTargets}
                        onClick={handleNutritionTargetSave}
                      >
                        {savingNutritionTargets ? "Saving..." : "Save targets"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="stack-list">
                    <li>
                      <strong>Calories</strong>
                      <span>
                        {nutritionTargetState?.targets.calories === null
                          ? "Not set"
                          : `${nutritionTargetState?.targets.calories} kcal`}
                      </span>
                    </li>
                    <li>
                      <strong>Protein</strong>
                      <span>
                        {nutritionTargetState?.targets.protein === null
                          ? "Not set"
                          : `${nutritionTargetState?.targets.protein} g`}
                      </span>
                    </li>
                    <li>
                      <strong>Fibre</strong>
                      <span>
                        {nutritionTargetState?.targets.fibre === null
                          ? "Not set"
                          : `${nutritionTargetState?.targets.fibre} g`}
                      </span>
                    </li>
                  </ul>
                )}
              </article>
            </section>
          ) : null}

          {user.role === "user" ? (
            <section className="sharing-section">
              <div className="sharing-header">
                <div>
                  <p className="eyebrow">Consent</p>
                  <h3>Practitioner access</h3>
                  <p className="muted-copy">
                    These toggles write directly to the same grant records the API and Telegram
                    commands use.
                  </p>
                </div>
              </div>
              <div className="sharing-grid">
                {grants.map((snapshot) => (
                  <article
                    className="panel grant-panel"
                    data-testid={`grant-panel-${snapshot.practitionerRole}`}
                    key={snapshot.practitionerRole}
                  >
                    <div className="panel-header">
                      <div>
                        <span className="eyebrow">{snapshot.practitionerRole}</span>
                        <h4>{snapshot.practitionerDisplayName}</h4>
                      </div>
                      <span className="status-pill accent-pill">
                        {snapshot.effectiveCategories.length} visible
                      </span>
                    </div>
                    <ul className="grant-list">
                      {(Object.keys(ACCESS_CATEGORY_COPY) as AccessCategory[]).map((category) => {
                        const enabled = snapshot.effectiveCategories.includes(category);
                        const actionKey = `${snapshot.practitionerRole}:${category}`;
                        return (
                          <li key={category} className="grant-item">
                            <div>
                              <strong>{ACCESS_CATEGORY_COPY[category].label}</strong>
                              <p>{ACCESS_CATEGORY_COPY[category].description}</p>
                            </div>
                            <button
                              className={enabled ? "grant-toggle grant-toggle-live" : "grant-toggle"}
                              data-testid={`grant-toggle-${snapshot.practitionerRole}-${category}`}
                              type="button"
                              disabled={isPending || activeGrantKey === actionKey}
                              onClick={() =>
                                handleGrantToggle(snapshot.practitionerRole, category, enabled)
                              }
                            >
                              {activeGrantKey === actionKey
                                ? "Saving..."
                                : enabled
                                  ? "Visible"
                                  : "Hidden"}
                            </button>
                            <span className="grant-badge">
                              {DEFAULT_SCOPE_BY_ROLE[snapshot.practitionerRole].includes(category)
                                ? "Default"
                                : "Optional"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
