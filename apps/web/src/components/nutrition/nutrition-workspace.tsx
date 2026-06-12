"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import type { NutritionPlanRevision, Recipe } from "@health/types";
import {
  apiQueryKeys,
  getActiveNutritionPlan,
  getNutritionMealsBreakdown,
  getRecipe,
  getTodayNutritionAdherence,
  listNutritionRevisions,
  listRecipes,
} from "../../lib/api";
import {
  MealCaloriesBreakdown,
  type MealCaloriesBreakdownState,
} from "./meal-calories-breakdown";
import {
  buildAdherenceState,
  formatLocalIsoDate,
} from "../../lib/nutrition-ui-state";
import {
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionReason,
} from "../../lib/plan-view-ui-state";
import {
  ChangeBanner,
  CheckCircle,
  CoachNotes,
  DailyExecCard,
  Icon,
  IconBadge,
  LoadingScreen,
  MediaCard,
  PlayBadge,
  RevisionFacts,
  RevisionHistoryDark,
  SectionError,
  SkeletonCard,
  type RevisionHistoryRow,
} from "../ui";
import { ErrorState } from "../ui";
import { NutritionWeekPlan } from "./nutrition-week-plan";
import { RecipeRecommendationsPanel } from "../recipes/recipe-recommendations-panel";

// ── ActiveNutritionHeader ────────────────────────────────────────

type ActiveNutritionHeaderEmptyProps = { empty: true };
type ActiveNutritionHeaderDataProps = {
  empty?: false;
  name: string;
  summary: string;
  revisionNumber: number;
};
type ActiveNutritionHeaderProps =
  | ActiveNutritionHeaderEmptyProps
  | ActiveNutritionHeaderDataProps;

function ActiveNutritionHeader(props: ActiveNutritionHeaderProps): ReactElement {
  if (props.empty) {
    return (
      <div
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 22,
        }}
      >
        <div
          style={{
            borderRadius: 14,
            border: "1px dashed var(--color-border-muted)",
            padding: "30px 24px",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 54,
              height: 54,
              borderRadius: 15,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(25,195,125,0.12)",
            }}
          >
            <Icon name="fork" size={26} stroke="var(--color-metric-green)" />
          </div>
          <p
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: -0.3,
              margin: 0,
            }}
          >
            No active nutrition plan yet
          </p>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--color-text-muted)",
              marginTop: 9,
              lineHeight: 1.5,
              maxWidth: 420,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            A nutrition plan is created by your coach based on your goals, preferences, and
            restrictions. Tell the coach what you enjoy and want to avoid — accept a proposal to
            get started.
          </p>
          <Link
            href="/chat"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 18,
              padding: "9px 18px",
              borderRadius: 12,
              background: "rgba(25,195,125,0.12)",
              border: "1px solid rgba(25,195,125,0.28)",
              color: "var(--color-metric-green)",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 150ms ease",
            }}
          >
            <Icon name="chat" size={15} stroke="var(--color-metric-green)" />
            Open Chat with coach
          </Link>
        </div>
      </div>
    );
  }

  const { name, summary, revisionNumber } = props;

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(25,195,125,0.14)",
            color: "var(--color-metric-green)",
          }}
        >
          Active plan
        </span>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(255,255,255,0.07)",
            color: "var(--color-text-secondary)",
          }}
        >
          v{revisionNumber}
        </span>
      </div>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          letterSpacing: -0.4,
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {name}
      </p>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--color-text-muted)",
          marginTop: 8,
          lineHeight: 1.55,
          maxWidth: 560,
        }}
      >
        {summary}
      </p>
    </div>
  );
}

// ── NutrientGoals ────────────────────────────────────────────────

type MacroRow = {
  label: string;
  target: number | null;
  unit: string;
  color: string;
};

type NutrientGoalsProps = {
  caloriesPerDay: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
};

function NutrientGoals({
  caloriesPerDay,
  proteinGrams,
  carbsGrams,
  fatGrams,
}: NutrientGoalsProps): ReactElement {
  const macros: MacroRow[] = [
    {
      label: "Calories",
      target: caloriesPerDay,
      unit: "kcal",
      color: "var(--color-metric-amber)",
    },
    {
      label: "Protein",
      target: proteinGrams,
      unit: "g",
      color: "var(--color-metric-green)",
    },
    {
      label: "Carbs",
      target: carbsGrams,
      unit: "g",
      color: "var(--color-metric-blue)",
    },
    {
      label: "Fat",
      target: fatGrams,
      unit: "g",
      color: "var(--color-metric-indigo)",
    },
  ].filter((m) => m.target != null);

  return (
    <div
      style={{
        flex: "1.2 1 0",
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 20,
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 18,
        }}
      >
        <IconBadge icon="fork" color="var(--color-metric-green)" size={26} />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            flex: 1,
          }}
        >
          Daily targets
        </span>
        <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>plan goal</span>
      </div>

      {/* Macro rows */}
      {macros.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {macros.map((m) => (
            <div
              key={m.label}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}
              >
                {m.label}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ color: m.color, fontWeight: 700 }}>{m.target}</span>{" "}
                {m.unit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          No daily targets set yet.
        </p>
      )}

      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginTop: 14,
          lineHeight: 1.4,
        }}
      >
        Targets are a guide, not a strict cap. Your coach adjusts them in chat.
      </p>
    </div>
  );
}

// ── MealStructure ────────────────────────────────────────────────

type MealRow = {
  label: string;
  timingHint?: string | null;
  isNew?: boolean;
};

const MEAL_ICONS: Record<string, Parameters<typeof Icon>[0]["name"]> = {
  breakfast: "sun",
  snack: "drop",
  lunch: "fork",
  dinner: "moon",
  default: "fork",
};

function getMealIcon(label: string): Parameters<typeof Icon>[0]["name"] {
  const lower = label.toLowerCase();
  for (const key of Object.keys(MEAL_ICONS)) {
    if (lower.includes(key)) return MEAL_ICONS[key] as Parameters<typeof Icon>[0]["name"];
  }
  return MEAL_ICONS.default as Parameters<typeof Icon>[0]["name"];
}

type MealStructureProps = {
  meals: readonly MealRow[];
};

function MealStructure({ meals }: MealStructureProps): ReactElement {
  return (
    <div
      style={{
        flex: "1 1 0",
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 20,
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 10,
        }}
      >
        <IconBadge icon="today" color="var(--color-metric-blue)" size={26} />
        <span
          style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}
        >
          Meal structure
        </span>
      </div>

      {meals.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {meals.map((meal, i) => (
            <div
              key={meal.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "11px 4px",
                borderBottom:
                  i === meals.length - 1
                    ? "none"
                    : "1px solid var(--color-border-default)",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <Icon name={getMealIcon(meal.label)} size={15} stroke="var(--color-text-secondary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {meal.label}
                  </span>
                  {meal.isNew ? (
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 600,
                        background: "rgba(245,165,36,0.14)",
                        color: "var(--color-metric-amber)",
                      }}
                    >
                      new
                    </span>
                  ) : null}
                </div>
                {meal.timingHint ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      marginTop: 2,
                      margin: "2px 0 0",
                    }}
                  >
                    {meal.timingHint}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
          No meal structure defined yet.
        </p>
      )}
    </div>
  );
}

// ── PrefsCard ────────────────────────────────────────────────────

type PrefGroup = {
  label: string;
  tone: string;
  toneVar: string;
  dimBg: string;
  icon: Parameters<typeof Icon>[0]["name"];
  items: readonly string[];
};

type PrefsCardProps = {
  preferences: readonly string[];
  restrictions: readonly string[];
  allergies: readonly string[];
};

function PrefsCard({ preferences, restrictions, allergies }: PrefsCardProps): ReactElement {
  const groups: PrefGroup[] = [
    {
      label: "Preferences",
      tone: "green",
      toneVar: "var(--color-metric-green)",
      dimBg: "rgba(25,195,125,0.14)",
      icon: "star",
      items: preferences,
    },
    {
      label: "Restrictions",
      tone: "amber",
      toneVar: "var(--color-metric-amber)",
      dimBg: "rgba(245,165,36,0.14)",
      icon: "info",
      items: restrictions,
    },
    {
      label: "Allergies",
      tone: "red",
      toneVar: "var(--color-metric-red)",
      dimBg: "rgba(240,80,106,0.14)",
      icon: "shield",
      items: allergies,
    },
  ];

  const hasAny = preferences.length > 0 || restrictions.length > 0 || allergies.length > 0;

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 16,
        }}
      >
        <IconBadge icon="heart" color="var(--color-metric-amber)" size={26} />
        <span
          style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}
        >
          Preferences, restrictions &amp; allergies
        </span>
      </div>

      {hasAny ? (
        <div style={{ display: "flex", gap: 14 }}>
          {groups.map((g) => (
            <div
              key={g.label}
              style={{
                flex: 1,
                padding: "14px 15px",
                borderRadius: 13,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: 11,
                }}
              >
                <Icon name={g.icon} size={14} stroke={g.toneVar} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {g.label}
                </span>
              </div>
              {g.items.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {g.items.map((item) => (
                    <span
                      key={item}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: g.dimBg,
                        color: g.toneVar,
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                  None listed
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          No preferences, restrictions, or allergies on record yet.
        </p>
      )}
    </div>
  );
}

// ── AdherencePanel — own sub-states ─────────────────────────────

type AdherencePanelState = "data" | "loading" | "error" | "empty";

type AdherenceMealRow = {
  label: string;
  completed: boolean;
};

type AdherencePanelDataProps = {
  state: "data";
  meals: readonly AdherenceMealRow[];
  hydrationLiters: number | null;
  hydrationTarget: number | null;
  proteinTarget: number | null;
};

type AdherencePanelProps =
  | { state: "loading" }
  | { state: "error"; onRetry?: () => void }
  | { state: "empty" }
  | AdherencePanelDataProps;

function AdherencePanel(props: AdherencePanelProps): ReactElement {
  const head = (
    <div
      style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}
    >
      <IconBadge icon="check" color="var(--color-metric-green)" size={28} />
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          flex: 1,
        }}
      >
        Logged today
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: "rgba(255,255,255,0.07)",
          color: "var(--color-text-muted)",
        }}
      >
        <Icon name="lock" size={12} stroke="var(--color-text-muted)" />
        read only
      </span>
      <Link
        href="/today"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 12px",
          borderRadius: 10,
          fontSize: 12.5,
          fontWeight: 600,
          background: "rgba(25,195,125,0.10)",
          border: "1px solid rgba(25,195,125,0.28)",
          color: "var(--color-metric-green)",
          textDecoration: "none",
          transition: "background 150ms ease",
        }}
      >
        <Icon name="today" size={14} stroke="var(--color-metric-green)" />
        Log in Today
      </Link>
    </div>
  );

  let inner: ReactNode;

  if (props.state === "loading") {
    inner = (
      <div style={{ display: "flex", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1 }}>
            <SkeletonCard h={56} head={false} />
          </div>
        ))}
      </div>
    );
  } else if (props.state === "error") {
    inner = (
      <SectionError
        label="Today's adherence could not be loaded"
        height={90}
        onRetry={props.onRetry}
      />
    );
  } else if (props.state === "empty") {
    inner = (
      <div
        style={{
          borderRadius: 13,
          border: "1px dashed var(--color-border-muted)",
          padding: "26px 20px",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}
        >
          <Icon name="fork" size={24} stroke="var(--color-metric-green)" />
        </div>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Nothing logged yet
        </p>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--color-text-muted)",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          Mark your first meal or a glass of water in Today — your summary will appear here.
        </p>
        <Link
          href="/today"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginTop: 14,
            padding: "7px 15px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: "rgba(25,195,125,0.12)",
            border: "1px solid rgba(25,195,125,0.28)",
            color: "var(--color-metric-green)",
            textDecoration: "none",
            transition: "background 150ms ease",
          }}
        >
          Open Today
        </Link>
      </div>
    );
  } else {
    // state === "data"
    const { meals, hydrationLiters, hydrationTarget, proteinTarget } = props;

    inner = (
      <>
        {/* Meal cards */}
        {meals.length > 0 ? (
          <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
            {meals.map((meal) => (
              <div
                key={meal.label}
                style={{
                  flex: "1 1 140px",
                  padding: "13px 15px",
                  borderRadius: 13,
                  background: meal.completed
                    ? "rgba(25,195,125,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${meal.completed ? "rgba(25,195,125,0.2)" : "var(--color-border-default)"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <CheckCircle done={meal.completed} size={18} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: meal.completed
                        ? "var(--color-text-primary)"
                        : "var(--color-text-muted)",
                    }}
                  >
                    {meal.label}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {meal.completed ? "Logged" : "Not yet logged"}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Macro / hydration tiles */}
        <div style={{ display: "flex", gap: 14 }}>
          {/* Protein tile — shows target + on/off-target state (actual grams backend follow-up) */}
          {proteinTarget != null ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 15px",
                borderRadius: 13,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <Icon name="fork" size={18} stroke="var(--color-metric-green)" aria-hidden />
              <span
                style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)" }}
              >
                Protein target
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--color-metric-green)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {proteinTarget} g
              </span>
            </div>
          ) : null}

          {/* Hydration tile */}
          {hydrationTarget != null ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 15px",
                borderRadius: 13,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <Icon name="drop" size={18} stroke="var(--color-metric-blue)" aria-hidden />
              <span
                style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)" }}
              >
                Water
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--color-metric-blue)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {hydrationLiters ?? "—"} / {hydrationTarget} L
              </span>
            </div>
          ) : null}

          {/* Fallback when no tiles to show */}
          {proteinTarget == null && hydrationTarget == null ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
              Log meals in Today to track progress.
            </p>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 20,
      }}
      aria-label="Today's adherence panel"
    >
      {head}
      {inner}
    </div>
  );
}

// ── RecipeIdeas — 4-col MediaCard grid ───────────────────────────

type RecipeIdeasProps = {
  onOpenRecipe: (recipeId: string) => void;
};

function RecipeIdeas({ onOpenRecipe }: RecipeIdeasProps): ReactElement {
  const { getToken } = useAuth();

  const recipesQuery = useQuery({
    queryKey: apiQueryKeys.recipesCatalog,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await listRecipes(token, {});
      if (result.error) throw new Error(result.error);
      return result.data?.recipes ?? [];
    },
  });

  const recipes = (recipesQuery.data ?? []).slice(0, 4);

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 20,
      }}
      aria-label="Meal ideas for your plan"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 16,
        }}
      >
        <IconBadge icon="spark" color="var(--color-metric-green)" size={26} />
        <div style={{ flex: 1 }}>
          <span
            style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", display: "block" }}
          >
            Meal ideas
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Generic catalog — not filtered to your plan
          </span>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          approx. nutrient estimate
        </span>
      </div>

      {/* Loading */}
      {recipesQuery.isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} h={140} head={false} />
          ))}
        </div>
      ) : recipesQuery.isError ? (
        <SectionError label="Recipe ideas could not be loaded" height={120} onRetry={() => recipesQuery.refetch()} />
      ) : recipes.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          No recipes in the catalog yet.
        </p>
      ) : (
        /* 4-col recipe grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          {recipes.map((r, i) => {
            const totalMins = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
            const duration =
              totalMins > 0
                ? `${Math.floor(totalMins / 60) > 0 ? `${Math.floor(totalMins / 60)}h ` : ""}${totalMins % 60 > 0 ? `${totalMins % 60}m` : ""}`.trim()
                : undefined;
            return (
              <MediaCard
                key={r.id}
                kind="recipe"
                icon="fork"
                color="var(--color-metric-green)"
                title={r.name}
                meta={`≈ ${r.perServingMacros.caloriesPerServing} kcal · ${r.perServingMacros.proteinGramsPerServing} g protein`}
                duration={duration}
                tags={r.mealTypes}
                poster={i}
                onOpen={() => onOpenRecipe(r.id)}
              />
            );
          })}
        </div>
      )}

      {/* Disclaimer row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 16,
          padding: "11px 15px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <Icon name="info" size={16} stroke="var(--color-text-muted)" aria-hidden />
        <span style={{ fontSize: 12.5, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          Saving or logging a recipe in Today does{" "}
          <strong style={{ color: "var(--color-text-secondary)" }}>not</strong> change plan
          targets.
        </span>
      </div>
    </div>
  );
}

// ── RecipeDetail — recipe focus view ────────────────────────────

type RecipeDetailProps = {
  recipe: Recipe;
  onBack: () => void;
};

function RecipeDetail({ recipe, onBack }: RecipeDetailProps): ReactElement {
  function handleBackKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBack();
    }
  }

  const totalMins = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const duration =
    totalMins > 0
      ? `${Math.floor(totalMins / 60) > 0 ? `${Math.floor(totalMins / 60)}h ` : ""}${totalMins % 60 > 0 ? `${totalMins % 60}m` : ""}`.trim()
      : null;

  return (
    <div style={{ padding: "20px 34px" }}>
      {/* Header: back + chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          onKeyDown={handleBackKey}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 10,
            padding: "5px 12px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            transition: "background 150ms ease",
          }}
          aria-label="Back to plan"
        >
          <span aria-hidden="true" style={{ display: "flex", transform: "rotate(180deg)" }}>
            <Icon name="chevR" size={15} stroke="var(--color-text-secondary)" />
          </span>
          Back to plan
        </button>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(255,255,255,0.07)",
            color: "var(--color-text-muted)",
          }}
        >
          Meal idea · doesn&apos;t change plan
        </span>
      </div>

      {/* Two-pane layout */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left: poster + how to cook */}
        <div style={{ flex: "1.5 1 0", minWidth: 0 }}>
          {/* Poster */}
          <div
            role="img"
            aria-label={`Recipe poster: ${recipe.name}`}
            style={{
              position: "relative",
              height: 360,
              borderRadius: 18,
              overflow: "hidden",
              background: "linear-gradient(135deg, #1b2620, #0c100e)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <span aria-hidden="true" style={{ opacity: 0.22, display: "flex" }}>
              <Icon
                name="fork"
                size={84}
                stroke="var(--color-metric-green)"
                sw={1.2}
              />
            </span>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PlayBadge size={72} />
            </div>
            {duration ? (
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  padding: "4px 10px",
                  borderRadius: 8,
                  background: "rgba(8,10,11,0.6)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                }}
                aria-hidden="true"
              >
                {duration}
              </div>
            ) : null}
          </div>

          {/* How to cook card */}
          {recipe.preparationSteps.length > 0 ? (
            <div
              style={{
                background: "var(--color-surface-card)",
                border: "1px solid var(--color-border-default)",
                borderRadius: 16,
                padding: 20,
                marginTop: 16,
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  marginBottom: 12,
                  margin: "0 0 12px",
                }}
              >
                How to cook
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {recipe.preparationSteps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 11 }}>
                    <div
                      aria-hidden="true"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        flexShrink: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--color-metric-green)",
                        background: "rgba(25,195,125,0.14)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {i + 1}
                    </div>
                    <span
                      style={{
                        fontSize: 13.5,
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.45,
                      }}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: detail card + log note */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                letterSpacing: -0.4,
                margin: 0,
              }}
            >
              {recipe.name}
            </p>

            {/* Chips */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              {recipe.mealTypes.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "4px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "rgba(25,195,125,0.14)",
                    color: "var(--color-metric-green)",
                  }}
                >
                  {tag}
                </span>
              ))}
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "4px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "rgba(255,255,255,0.07)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Macro tiles — recipe-specific estimates */}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {(
                [
                  [String(recipe.perServingMacros.caloriesPerServing), "kcal", "var(--color-metric-amber)"],
                  [`${recipe.perServingMacros.proteinGramsPerServing} g`, "protein", "var(--color-metric-green)"],
                  [`${recipe.perServingMacros.fatGramsPerServing} g`, "fat", "var(--color-metric-indigo)"],
                ] as const
              ).map(([val, label, color]) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    textAlign: "center",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--color-border-default)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color,
                      margin: 0,
                    }}
                  >
                    {val}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.1,
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
                      marginTop: 4,
                      margin: "4px 0 0",
                    }}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: "var(--color-border-default)",
                margin: "18px 0",
              }}
            />

            {/* Ingredients */}
            {recipe.ingredients.length > 0 ? (
              <>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: 12,
                    margin: "0 0 12px",
                  }}
                >
                  Ingredients
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {recipe.ingredients.map((ingredient, i) => {
                    const display = [
                      ingredient.name,
                      ingredient.quantity != null ? String(ingredient.quantity) : null,
                      ingredient.unit,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={i}
                        style={{ display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: "var(--color-metric-green)",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{ fontSize: 13.5, color: "var(--color-text-secondary)" }}
                        >
                          {display}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
                Ingredient details not available.
              </p>
            )}
          </div>

          {/* Log note card */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 13,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Icon name="info" size={18} stroke="var(--color-text-muted)" aria-hidden />
            <p
              style={{
                flex: 1,
                fontSize: 12.5,
                color: "var(--color-text-muted)",
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Log this recipe in Today. Plan targets do not change.
            </p>
            <Link
              href="/today"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 600,
                background: "rgba(25,195,125,0.12)",
                border: "1px solid rgba(25,195,125,0.28)",
                color: "var(--color-metric-green)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "background 150ms ease",
              }}
            >
              <Icon name="today" size={14} stroke="var(--color-metric-green)" />
              Log in Today
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen layout wrapper ────────────────────────────────────────

function NutritionScreenLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "20px 34px",
      }}
    >
      {children}
    </div>
  );
}

// ── Build revision history rows for nutrition ─────────────────────

function buildNutritionRevisionRows(
  revisions: readonly NutritionPlanRevision[],
  activeRevisionId: string,
): RevisionHistoryRow[] {
  const sorted = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
  return sorted.map((r, index) => {
    const previousRevision = sorted[index + 1];
    const reason = formatRevisionReason(r.reason, previousRevision?.reason, r.revisionNumber);
    const note = reason.length > 90 ? `${reason.slice(0, 90)}…` : reason;
    return {
      rev: `v${r.revisionNumber}`,
      when: formatPlanRevisionTimestamp(r.createdAt),
      note,
      active: r.id === activeRevisionId,
    };
  });
}

// ── Main export: NutritionWorkspace ──────────────────────────────

export function NutritionWorkspace() {
  const { getToken } = useAuth();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const today = formatLocalIsoDate(new Date());

  const activePlanQuery = useQuery({
    queryKey: apiQueryKeys.nutritionActive,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveNutritionPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null };
    },
  });

  const revisionsQuery = useQuery({
    queryKey: apiQueryKeys.nutritionRevisions,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listNutritionRevisions(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const adherenceQuery = useQuery({
    queryKey: apiQueryKeys.nutritionAdherenceToday,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getTodayNutritionAdherence(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { adherence: null };
    },
    enabled: Boolean(activePlanQuery.data?.activeRevision),
  });

  const mealsBreakdownQuery = useQuery({
    queryKey: apiQueryKeys.nutritionMealsBreakdown,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getNutritionMealsBreakdown(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? null;
    },
    // Only fetch when there is an active plan revision to read from.
    enabled: Boolean(activePlanQuery.data?.activeRevision),
  });

  const selectedRecipeQuery = useQuery({
    queryKey: apiQueryKeys.recipeDetail(selectedRecipeId ?? ""),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      // selectedRecipeId is guaranteed non-null when enabled
      const result = await getRecipe(token, selectedRecipeId as string);
      if (result.error) throw new Error(result.error);
      return result.data ?? null;
    },
    enabled: selectedRecipeId !== null,
  });

  // ── Loading state ──────────────────────────────────────────────
  if (activePlanQuery.isLoading || revisionsQuery.isLoading) {
    return <LoadingScreen label="Loading your nutrition plan" layout="plan" />;
  }

  // ── Error state ────────────────────────────────────────────────
  if (activePlanQuery.isError || revisionsQuery.isError) {
    return (
      <ErrorState
        title="Nutrition plan unavailable"
        description="Your nutrition plan could not be loaded. Try refreshing — your data is safe."
        action={
          <Link
            href="/chat"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--color-metric-green)",
              textDecoration: "none",
            }}
          >
            Open Chat →
          </Link>
        }
      />
    );
  }

  const activeRevision = activePlanQuery.data?.activeRevision ?? null;
  const payload = activeRevision?.payload ?? null;
  const revisions = revisionsQuery.data ?? [];

  // ── Empty state ────────────────────────────────────────────────
  if (!activeRevision || !payload) {
    return (
      <NutritionScreenLayout>
        <ChangeBanner />
        <ActiveNutritionHeader empty />
        <AdherencePanel state="empty" />
      </NutritionScreenLayout>
    );
  }

  // ── Recipe (detail) state ──────────────────────────────────────
  if (selectedRecipeId !== null) {
    if (selectedRecipeQuery.isLoading) {
      return <LoadingScreen label="Loading recipe" layout="plan" />;
    }
    if (selectedRecipeQuery.isError || !selectedRecipeQuery.data) {
      return (
        <NutritionScreenLayout>
          <button
            type="button"
            onClick={() => setSelectedRecipeId(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 10,
              padding: "5px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              marginBottom: 12,
            }}
            aria-label="Back to plan"
          >
            Back to plan
          </button>
          <SectionError
            label="Recipe could not be loaded"
            height={120}
            onRetry={() => selectedRecipeQuery.refetch()}
          />
        </NutritionScreenLayout>
      );
    }
    return (
      <RecipeDetail
        recipe={selectedRecipeQuery.data}
        onBack={() => setSelectedRecipeId(null)}
      />
    );
  }

  // ── Derive adherence panel state ───────────────────────────────
  const adherenceRecord = adherenceQuery.data?.adherence ?? null;
  const adherenceState = buildAdherenceState({
    date: adherenceRecord?.date ?? today,
    payload,
    record: adherenceRecord,
  });

  let adherencePanelState: AdherencePanelState;
  if (adherenceQuery.isLoading) {
    adherencePanelState = "loading";
  } else if (adherenceQuery.isError) {
    adherencePanelState = "error";
  } else if (!adherenceRecord) {
    adherencePanelState = "empty";
  } else {
    adherencePanelState = "data";
  }

  // ── Derive meal-calories breakdown state ──────────────────────
  let mealsBreakdownState: MealCaloriesBreakdownState;
  if (mealsBreakdownQuery.isLoading) {
    mealsBreakdownState = { state: "loading" };
  } else if (mealsBreakdownQuery.isError) {
    mealsBreakdownState = {
      state: "error",
      onRetry: () => mealsBreakdownQuery.refetch(),
    };
  } else if (!mealsBreakdownQuery.data) {
    mealsBreakdownState = { state: "empty" };
  } else {
    mealsBreakdownState = { state: "data", model: mealsBreakdownQuery.data };
  }

  // ── Build revision history rows ────────────────────────────────
  const historyRows = buildNutritionRevisionRows(revisions, activeRevision.id);

  // ── Done state ─────────────────────────────────────────────────
  return (
    <NutritionScreenLayout>
      {/* 1. ChangeBanner */}
      <ChangeBanner />

      {/* 2. ActiveNutritionHeader */}
      <ActiveNutritionHeader
        name={payload.title}
        summary={payload.summary}
        revisionNumber={activeRevision.revisionNumber}
      />

      {/* 3. DailyExecCard */}
      <DailyExecCard
        icon="today"
        color="green"
        title="Logging happens on Today"
        text="Track meals, hydration, and notes from the Today screen. This view is read-only."
        cta="Go to Today"
        todayHref="/today"
      />

      {/* 4. RevisionFacts */}
      <RevisionFacts
        rev={`v${activeRevision.revisionNumber}`}
        when={formatPlanRevisionTimestamp(activeRevision.createdAt)}
        source={formatPlanRevisionSource(activeRevision.source)}
        why={activeRevision.reason}
        accent="var(--color-metric-green)"
      />

      {/* 5. Two-column: NutrientGoals + MealStructure */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <NutrientGoals
          caloriesPerDay={payload.caloriesPerDay ?? null}
          proteinGrams={payload.proteinGrams ?? null}
          carbsGrams={payload.carbsGrams ?? null}
          fatGrams={payload.fatGrams ?? null}
        />
        <MealStructure
          meals={payload.mealStructure.map((m) => ({
            label: m.label,
            timingHint: m.timingHint,
          }))}
        />
      </div>

      {/* 6. MealCaloriesBreakdown (C1) */}
      <MealCaloriesBreakdown {...mealsBreakdownState} />

      {/* 7. CoachNotes — portion estimate framing (C1 requirement) */}
      <CoachNotes>
        Цифры — ориентир: вес порций оценивается по фото и описанию. Если калорий мало к вечеру, это нормально — день ещё не закончен. Точные граммы можно поправить в «Сегодня».
      </CoachNotes>

      {/* 8. NutritionWeekPlan — C2 7-day grid (shown when weeklyPlan is present; graceful empty otherwise) */}
      <NutritionWeekPlan weeklyPlan={payload.weeklyPlan ?? null} />

      {/* 9. PrefsCard */}
      <PrefsCard
        preferences={payload.preferences}
        restrictions={payload.restrictions}
        allergies={payload.allergies}
      />

      {/* 10. CoachNotes — plan-level notes */}
      {payload.notes.length > 0 ? (
        <CoachNotes>{payload.notes.join(" ")}</CoachNotes>
      ) : null}

      {/* 11. AdherencePanel */}
      {adherencePanelState === "data" ? (
        <AdherencePanel
          state="data"
          meals={adherenceState.mealCompletion.map((m) => ({
            label: m.label,
            completed: m.completed,
          }))}
          hydrationLiters={adherenceState.hydrationLitersConsumed}
          hydrationTarget={payload.hydrationLiters ?? null}
          proteinTarget={payload.proteinGrams ?? null}
        />
      ) : adherencePanelState === "loading" ? (
        <AdherencePanel state="loading" />
      ) : adherencePanelState === "error" ? (
        <AdherencePanel state="error" />
      ) : (
        <AdherencePanel state="empty" />
      )}

      {/* 12. RecipeIdeas — generic catalog browse, not plan-filtered */}
      <RecipeIdeas onOpenRecipe={(id) => setSelectedRecipeId(id)} />

      {/* 13. RecipeRecommendationsPanel — plan-fit suggestions keyed to active revision */}
      <div
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 20,
        }}
        aria-label="Plan-fit recipe recommendations"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 16,
          }}
        >
          <IconBadge icon="star" color="var(--color-metric-green)" size={26} />
          <div style={{ flex: 1 }}>
            <span
              style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", display: "block" }}
            >
              Recommended for you
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Plan-fit suggestions matched to your active nutrition revision
            </span>
          </div>
        </div>
        <RecipeRecommendationsPanel activeRevision={activeRevision} embedded />
      </div>

      {/* 14. RevisionHistoryDark */}
      <RevisionHistoryDark
        rows={historyRows}
        defaultOpen={true}
        footerNote="Past logged meals stay tied to the revision that was active when you logged them."
      />
    </NutritionScreenLayout>
  );
}
