import type { AppConfig } from "../config.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import type { AuthenticatedUser } from "./auth.js";
import {
  createAccessGrant,
  createAccessRevocationMarker,
  getPrimaryUserByRole,
  listAccessGrantDecisionsForPair,
  revokeActiveAccessGrants,
  storeConversationMessage
} from "./persistence.js";
import type { AccessCategory, UserRole } from "@codex/shared";

type PractitionerRole = Extract<UserRole, "trainer" | "nutritionist">;
type GrantAction = "grant" | "revoke" | "list";

type AccessGrantDependencies = {
  createAccessGrant: typeof createAccessGrant;
  createAccessRevocationMarker: typeof createAccessRevocationMarker;
  getPrimaryUserByRole: typeof getPrimaryUserByRole;
  listAccessGrantDecisionsForPair: typeof listAccessGrantDecisionsForPair;
  revokeActiveAccessGrants: typeof revokeActiveAccessGrants;
  sendTelegramMessage: typeof sendTelegramMessage;
  storeConversationMessage: typeof storeConversationMessage;
};

const defaultDependencies: AccessGrantDependencies = {
  createAccessGrant,
  createAccessRevocationMarker,
  getPrimaryUserByRole,
  listAccessGrantDecisionsForPair,
  revokeActiveAccessGrants,
  sendTelegramMessage,
  storeConversationMessage
};

const PRACTITIONER_ROLES: PractitionerRole[] = ["trainer", "nutritionist"];
const DEFAULT_CATEGORIES_BY_ROLE: Record<PractitionerRole, AccessCategory[]> = {
  trainer: ["exercise"],
  nutritionist: ["nutrition", "weight"]
};

function titleCase(value: string) {
  return value[0] ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function formatCategory(category: AccessCategory) {
  switch (category) {
    case "exercise":
      return "exercise data";
    case "nutrition":
      return "nutrition data";
    case "weight":
      return "weight data";
    case "engagement_status":
      return "engagement status";
  }
}

function parseCategory(value: string): AccessCategory | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (/\bexercise\b|\bworkout\b|\bworkouts\b|\btraining\b/.test(normalized)) {
    return "exercise";
  }
  if (/\bnutrition\b|\bmeal\b|\bmeals\b|\bfood\b|\bcalorie\b|\bcalories\b|\bmacro\b|\bmacros\b/.test(normalized)) {
    return "nutrition";
  }
  if (/\bweight\b|\bweigh\b/.test(normalized)) {
    return "weight";
  }
  if (/\bengagement\b|\bstatus\b|\brelapse\b/.test(normalized)) {
    return "engagement_status";
  }
  return null;
}

function parseAccessGrantCommand(text: string): {
  action: GrantAction;
  practitionerRole?: PractitionerRole;
  category?: AccessCategory;
} | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (
    normalized === "show access grants" ||
    normalized === "show sharing" ||
    normalized === "who can see what"
  ) {
    return { action: "list" };
  }

  const grantMatch = /^(?:give|grant)\s+my\s+(trainer|nutritionist)\s+access\s+to\s+(.+?)(?:\s+data)?[.!?]*$/.exec(normalized);
  if (grantMatch) {
    const category = parseCategory(grantMatch[2] ?? "");
    if (!category) {
      return null;
    }
    return {
      action: "grant",
      practitionerRole: grantMatch[1] as PractitionerRole,
      category
    };
  }

  const revokeMatch = /^(?:revoke|remove)\s+my\s+(trainer|nutritionist)(?:'s)?\s+access\s+to\s+(.+?)(?:\s+data)?[.!?]*$/.exec(normalized);
  if (revokeMatch) {
    const category = parseCategory(revokeMatch[2] ?? "");
    if (!category) {
      return null;
    }
    return {
      action: "revoke",
      practitionerRole: revokeMatch[1] as PractitionerRole,
      category
    };
  }

  return null;
}

function computeEffectiveCategories(
  practitionerRole: PractitionerRole,
  decisions: Array<{
    category: AccessCategory;
    revokedAt: Date | null;
  }>
) {
  const categories = new Set<AccessCategory>(DEFAULT_CATEGORIES_BY_ROLE[practitionerRole]);
  const seen = new Set<AccessCategory>();

  for (const decision of decisions) {
    if (seen.has(decision.category)) {
      continue;
    }
    seen.add(decision.category);
    if (decision.revokedAt) {
      categories.delete(decision.category);
      continue;
    }
    categories.add(decision.category);
  }

  return [...categories].sort();
}

async function getConsentContext(
  practitionerRole: PractitionerRole,
  dependencies: Pick<
    AccessGrantDependencies,
    "getPrimaryUserByRole" | "listAccessGrantDecisionsForPair"
  >
) {
  const subjectUser = await dependencies.getPrimaryUserByRole("user");
  if (!subjectUser) {
    throw new Error("No primary user account is configured yet.");
  }

  const practitionerUser = await dependencies.getPrimaryUserByRole(practitionerRole);
  if (!practitionerUser) {
    throw new Error(`No ${practitionerRole} account is configured yet.`);
  }

  const decisions = await dependencies.listAccessGrantDecisionsForPair({
    subjectUserId: subjectUser.id,
    practitionerUserId: practitionerUser.id
  });

  return {
    subjectUser,
    practitionerUser,
    decisions,
    effectiveCategories: computeEffectiveCategories(practitionerRole, decisions)
  };
}

function renderGrantSummary(
  snapshots: Array<{
    practitionerDisplayName: string;
    practitionerRole: PractitionerRole;
    effectiveCategories: AccessCategory[];
  }>
) {
  const lines = ["Current sharing:"];

  for (const snapshot of snapshots) {
    const categories =
      snapshot.effectiveCategories.length > 0
        ? snapshot.effectiveCategories.map(formatCategory).join(", ")
        : "nothing right now";
    lines.push(`${titleCase(snapshot.practitionerRole)} (${snapshot.practitionerDisplayName}): ${categories}.`);
  }

  return lines.join("\n");
}

export async function listAccessGrantState(
  dependencies: Pick<
    AccessGrantDependencies,
    "getPrimaryUserByRole" | "listAccessGrantDecisionsForPair"
  > = defaultDependencies
) {
  const snapshots = [];

  for (const practitionerRole of PRACTITIONER_ROLES) {
    const context = await getConsentContext(practitionerRole, dependencies);
    snapshots.push({
      practitionerUserId: context.practitionerUser.id,
      practitionerDisplayName: context.practitionerUser.displayName,
      practitionerRole,
      effectiveCategories: context.effectiveCategories
    });
  }

  return snapshots;
}

export async function updateAccessGrant(input: {
  actorUserId: string;
  practitionerRole: PractitionerRole;
  category: AccessCategory;
  action: "grant" | "revoke";
}, dependencies: Pick<
  AccessGrantDependencies,
  | "createAccessGrant"
  | "createAccessRevocationMarker"
  | "getPrimaryUserByRole"
  | "listAccessGrantDecisionsForPair"
  | "revokeActiveAccessGrants"
> = defaultDependencies) {
  const context = await getConsentContext(input.practitionerRole, dependencies);
  const currentlyVisible = context.effectiveCategories.includes(input.category);

  if (input.action === "grant") {
    if (currentlyVisible) {
      return {
        changed: false,
        responseText: `${titleCase(input.practitionerRole)} already has ${formatCategory(input.category)}.`,
        snapshots: await listAccessGrantState(dependencies)
      };
    }

    await dependencies.createAccessGrant({
      subjectUserId: context.subjectUser.id,
      practitionerUserId: context.practitionerUser.id,
      category: input.category,
      createdByUserId: input.actorUserId
    });

    return {
      changed: true,
      responseText: `Granted. ${titleCase(input.practitionerRole)} can now see ${formatCategory(input.category)}.`,
      snapshots: await listAccessGrantState(dependencies)
    };
  }

  if (!currentlyVisible) {
    return {
      changed: false,
      responseText: `${titleCase(input.practitionerRole)} cannot currently see ${formatCategory(input.category)}.`,
      snapshots: await listAccessGrantState(dependencies)
    };
  }

  const revokedCount = await dependencies.revokeActiveAccessGrants({
    subjectUserId: context.subjectUser.id,
    practitionerUserId: context.practitionerUser.id,
    category: input.category
  });

  if (revokedCount === 0) {
    await dependencies.createAccessRevocationMarker({
      subjectUserId: context.subjectUser.id,
      practitionerUserId: context.practitionerUser.id,
      category: input.category,
      createdByUserId: input.actorUserId
    });
  }

  return {
    changed: true,
    responseText: `Done. ${titleCase(input.practitionerRole)} can no longer see ${formatCategory(input.category)}.`,
    snapshots: await listAccessGrantState(dependencies)
  };
}

export async function handleAccessGrantCommand(
  config: AppConfig,
  input: {
    text: string;
    dryRun?: boolean;
  },
  dependencies: AccessGrantDependencies = defaultDependencies
) {
  const parsed = parseAccessGrantCommand(input.text);
  if (!parsed) {
    return {
      handled: false
    };
  }

  const subjectUser = await dependencies.getPrimaryUserByRole("user");
  if (!subjectUser) {
    throw new Error("No primary user account is configured yet.");
  }

  let responseText = "";
  let metadata: Record<string, unknown> = {
    kind: "access_grant"
  };

  if (parsed.action === "list") {
    const snapshots = await listAccessGrantState(dependencies);
    responseText = renderGrantSummary(snapshots);
    metadata = {
      ...metadata,
      action: "list"
    };
  } else {
    const result = await updateAccessGrant(
      {
        actorUserId: subjectUser.id,
        practitionerRole: parsed.practitionerRole!,
        category: parsed.category!,
        action: parsed.action
      },
      dependencies
    );
    responseText = `${result.responseText}\n\n${renderGrantSummary(result.snapshots)}`;
    metadata = {
      ...metadata,
      action: parsed.action,
      practitionerRole: parsed.practitionerRole,
      category: parsed.category,
      changed: result.changed
    };
  }

  if (!input.dryRun) {
    await dependencies.sendTelegramMessage(config, responseText);
    await dependencies.storeConversationMessage({
      actor: "assistant",
      content: responseText,
      metadata
    });
  }

  return {
    handled: true,
    responseText
  };
}
