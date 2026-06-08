"use client";

import { useAuth } from "@clerk/nextjs";
import type {
  CoachingHierarchySummary,
  Entitlement,
  Goal,
  SubscriptionSummary,
  User,
  UserProfile,
} from "@health/types";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  apiQueryKeys,
  getCurrentProfile,
  getCurrentUser,
  getCurrentUserState,
  getEntitlement,
  getSubscription,
} from "../../lib/api";
import { goalTypeLabel } from "../../lib/dashboard-ui-state";
import {
  formatHierarchyDirection,
  hasCoachingHierarchySummary,
} from "../../lib/onboarding-ui-state";
import { setLocaleCookie } from "../../i18n/set-locale-action";
import { isLocale } from "../../i18n/config";
import { LanguageSwitcher } from "../settings/language-switcher";
import { DocumentsWorkspace } from "../documents/documents-workspace";
import { Toggle } from "../ui/toggle";
import { Icon } from "../ui/icon";
import type { IconName } from "../ui/icon";
import { BodyAnalysisSection } from "./body-analysis-section";

// ── Token palette (inline – light "ChatGPT" world) ───────────────

const L = {
  bg: "#ffffff",
  panel: "#f9f9f8",
  panel2: "#f0f0ee",
  line: "#ececea",
  line2: "#d8d8d5",
  ink: "#0e0e0d",
  ink2: "#3a3a38",
  mut: "#76766f",
  mut2: "#a5a59e",
} as const;

const M = {
  green: "#19c37d",
  greenDim: "rgba(25,195,125,0.12)",
  amber: "#f5a524",
  amberDim: "rgba(245,165,36,0.12)",
  blue: "#3a8dff",
  blueDim: "rgba(58,141,255,0.12)",
  indigo: "#7b7bff",
  indigoDim: "rgba(123,123,255,0.12)",
} as const;

// ── Local atoms ──────────────────────────────────────────────────

function LightCard({
  children,
  style,
  accent,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 20,
        background: L.bg,
        border: `1px solid ${L.line}`,
        borderTop: accent ? `2px solid ${accent}` : `1px solid ${L.line}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHead({
  icon,
  color,
  title,
  right,
}: {
  icon?: IconName;
  color?: string;
  title: string;
  right?: React.ReactNode;
}) {
  const iconColor = color ?? L.mut;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 14,
      }}
    >
      {icon ? (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${iconColor}22`,
          }}
        >
          <Icon name={icon} size={15} stroke={iconColor} />
        </div>
      ) : null}
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: L.ink,
          flex: 1,
        }}
      >
        {title}
      </span>
      {right}
    </div>
  );
}

function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: L.mut2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PrefChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: L.panel2,
        color: L.ink2,
        border: `1px solid ${L.line}`,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function PlanChip({ tier }: { tier: string }) {
  const isProTier = tier === "pro";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        background: isProTier ? M.greenDim : M.amberDim,
        color: isProTier ? M.green : M.amber,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {tier.toUpperCase()}
    </span>
  );
}

function FieldRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: IconName;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: `1px solid ${L.line}`,
      }}
    >
      {icon ? <Icon name={icon} size={17} stroke={L.mut} /> : null}
      <span style={{ fontSize: 13.5, color: L.mut, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: L.ink }}>{value}</span>
    </div>
  );
}

// ── Loading / Error states ────────────────────────────────────────

function ProfileLoading({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 240,
        color: L.mut,
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

function ProfileError({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 240,
        color: "#f0506a",
        fontSize: 14,
      }}
      role="alert"
    >
      {message}
    </div>
  );
}

// ── Account header card ───────────────────────────────────────────

function AccountHeaderCard({
  user,
  tier,
  fallbackLabel,
}: {
  user: User;
  tier: string;
  fallbackLabel: string;
}) {
  // Prefer real name → email → neutral label; never expose raw Clerk user ids.
  // A Clerk id starts with "user_" and contains only alphanumerics/underscores —
  // real names and email addresses never look like that.
  const isRawClerkId = (s: string) =>
    /^user_[A-Za-z0-9]+$/.test(s) || s.startsWith("user_") && s.includes("@clerk.local");

  const cleanName =
    user.displayName && !isRawClerkId(user.displayName) ? user.displayName : null;
  const cleanEmail = user.email && !isRawClerkId(user.email) ? user.email : null;
  const safeDisplayName = cleanName ?? cleanEmail ?? fallbackLabel;

  const initials = safeDisplayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <LightCard>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Avatar — initials circle */}
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: M.amberDim,
            color: M.amber,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: -0.5,
            border: `2px solid ${M.amber}40`,
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: L.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {safeDisplayName}
          </div>
          {cleanEmail && cleanEmail !== safeDisplayName ? (
            <div
              style={{
                fontSize: 12.5,
                color: L.mut,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cleanEmail}
            </div>
          ) : null}
        </div>

        <PlanChip tier={tier} />
      </div>
    </LightCard>
  );
}

// ── Goal hierarchy card ───────────────────────────────────────────

function goalDomainIcon(type: Goal["type"]): IconName {
  switch (type) {
    case "fat_loss":
    case "muscle_gain":
    case "endurance":
      return "dumbbell";
    case "maintenance":
      return "heart";
    case "general_wellness":
      return "sun";
  }
}

function goalDomainColor(type: Goal["type"]): string {
  switch (type) {
    case "fat_loss":
    case "muscle_gain":
      return M.blue;
    case "endurance":
      return M.green;
    case "maintenance":
      return M.amber;
    case "general_wellness":
      return M.indigo;
  }
}

function GoalHierarchyCard({
  hierarchy,
}: {
  hierarchy: CoachingHierarchySummary;
}) {
  const t = useTranslations("Profile.goals");
  const direction = formatHierarchyDirection(hierarchy);
  const hasContent = hasCoachingHierarchySummary(hierarchy);

  if (!hasContent) {
    return (
      <LightCard>
        <CardHead
          icon="flag"
          color={M.green}
          title={t("title")}
          right={
            <span style={{ fontSize: 12, color: L.mut2 }}>{t("changesThrough")}</span>
          }
        />
        <div style={{ padding: "8px 0", fontSize: 13.5, color: L.mut }}>
          {t("noActiveGoals")}{" "}
          <Link href="/onboarding" style={{ color: M.green, fontWeight: 600 }}>
            {t("completeOnboarding")}
          </Link>{" "}
          {t("setDirection")}
        </div>
      </LightCard>
    );
  }

  return (
    <LightCard>
      <CardHead
        icon="flag"
        color={M.green}
        title={t("title")}
        right={
          <span style={{ fontSize: 12, color: L.mut2 }}>{t("changesThrough")}</span>
        }
      />

      {direction ? (
        <div style={{ marginBottom: 14 }}>
          <Eyebrow style={{ marginBottom: 6 }}>{t("direction")}</Eyebrow>
          <div style={{ fontSize: 13.5, color: L.ink2, lineHeight: 1.45 }}>{direction}</div>
        </div>
      ) : null}

      {/* Quarterly goal — starred, bordered panel */}
      {hierarchy.activeQuarterlyGoal ? (
        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${L.line}`,
            padding: 16,
            background: L.panel,
            marginBottom: 12,
          }}
        >
          <Eyebrow style={{ marginBottom: 8 }}>{t("quarterlyGoal")}</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="star" size={17} stroke={M.amber} fill={M.amber} />
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: L.ink,
              }}
            >
              {hierarchy.activeQuarterlyGoal.title}
            </span>
          </div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: L.mut }}>
            {goalTypeLabel(hierarchy.activeQuarterlyGoal.type)}
          </div>
        </div>
      ) : (
        <div
          style={{
            borderRadius: 12,
            border: `1px dashed ${L.line2}`,
            padding: 14,
            marginBottom: 12,
            fontSize: 13.5,
            color: L.mut,
          }}
        >
          {t("noQuarterlyObjective")}
        </div>
      )}

      {/* Weekly goals */}
      {hierarchy.weeklyFocus.length > 0 ? (
        <div>
          <Eyebrow style={{ marginBottom: 10, paddingLeft: 2 }}>{t("weeklyGoals")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {hierarchy.weeklyFocus.map((goal) => {
              const icon = goalDomainIcon(goal.type);
              const color = goalDomainColor(goal.type);
              return (
                <div
                  key={goal.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "11px 14px",
                    borderRadius: 11,
                    border: `1px solid ${L.line}`,
                  }}
                >
                  <Icon name={icon} size={17} stroke={color} />
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: L.ink2, flex: 1 }}>
                    {goal.title}
                  </span>
                  <Icon name="chevR" size={15} stroke={L.mut2} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </LightCard>
  );
}

// ── Personal context card ─────────────────────────────────────────

function PersonalContextCard({ profile }: { profile: UserProfile | null }) {
  const t = useTranslations("Profile.personalContext");
  const tCommon = useTranslations("Common");

  function activityLevelLabel(level: string | null): string {
    if (!level) return tCommon("notSet");
    const key = `activityLevels.${level}` as Parameters<typeof t>[0];
    return t(key);
  }

  function trainingExperienceLabel(exp: string | null): string {
    if (!exp) return tCommon("notSet");
    const key = `trainingExperiences.${exp}` as Parameters<typeof t>[0];
    return t(key);
  }

  if (!profile) {
    return (
      <LightCard>
        <CardHead icon="profile" title={t("title")} />
        <div style={{ padding: "8px 0", fontSize: 13.5, color: L.mut }}>
          {t("notSetUp")}{" "}
          <Link href="/onboarding" style={{ color: M.green, fontWeight: 600 }}>
            {t("continueOnboarding")}
          </Link>{" "}
          {t("updateViaChat")}
        </div>
      </LightCard>
    );
  }

  const hasPrefs = profile.preferences.length > 0;
  const hasConstraints = profile.constraints.length > 0;
  const hasNotes = profile.coachingNotes.length > 0;
  const hasAnyContent =
    profile.activityLevel ||
    profile.trainingExperience ||
    hasPrefs ||
    hasConstraints ||
    hasNotes;

  if (!hasAnyContent) {
    return (
      <LightCard>
        <CardHead icon="profile" title={t("title")} />
        <div style={{ padding: "8px 0", fontSize: 13.5, color: L.mut }}>
          {t("noPreferences")}{" "}
          <Link href="/chat" style={{ color: M.green, fontWeight: 600 }}>
            {t("updateViaChat2")}
          </Link>
          .
        </div>
      </LightCard>
    );
  }

  return (
    <LightCard>
      <CardHead icon="profile" title={t("title")} />

      {profile.activityLevel ? (
        <FieldRow label={t("activityLevel")} value={activityLevelLabel(profile.activityLevel)} />
      ) : null}

      {profile.trainingExperience ? (
        <FieldRow
          label={t("trainingExperience")}
          value={trainingExperienceLabel(profile.trainingExperience)}
        />
      ) : null}

      {hasConstraints ? (
        <div
          style={{
            padding: "12px 0",
            borderBottom: `1px solid ${L.line}`,
          }}
        >
          <span style={{ fontSize: 13.5, color: L.mut }}>{t("constraints")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {profile.constraints.map((c) => (
              <PrefChip key={c}>{c}</PrefChip>
            ))}
          </div>
        </div>
      ) : null}

      {hasPrefs ? (
        <div
          style={{
            padding: "12px 0",
            borderBottom: hasNotes ? `1px solid ${L.line}` : "none",
          }}
        >
          <span style={{ fontSize: 13.5, color: L.mut }}>{t("preferences")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {profile.preferences.map((p) => (
              <PrefChip key={p}>{p}</PrefChip>
            ))}
          </div>
        </div>
      ) : null}

      {hasNotes ? (
        <div style={{ paddingTop: 12 }}>
          <span style={{ fontSize: 13.5, color: L.mut }}>{t("coachNotes")}</span>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {profile.coachingNotes.map((note, i) => (
              <div key={i} style={{ fontSize: 13.5, color: L.ink2, lineHeight: 1.45 }}>
                {note.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </LightCard>
  );
}

// ── Documents card (amber accent, wraps existing DocumentsWorkspace) ─

function DocumentsCard() {
  const t = useTranslations("Profile.documents");
  return (
    <LightCard accent={M.amber}>
      <CardHead
        icon="doc"
        color={M.amber}
        title={t("title")}
      />
      {/* Wellness / "visible only to you" framing */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 12,
          background: M.amberDim,
          marginBottom: 16,
        }}
      >
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <Icon name="shield" size={17} stroke={M.amber} />
        </span>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: L.ink2 }}>
          {t("privacyNotice")}
        </div>
      </div>
      {/* All upload / consent / list / parse logic stays in DocumentsWorkspace */}
      <DocumentsWorkspace embedded />
    </LightCard>
  );
}

// ── Devices card (disabled placeholder, not in MVP) ───────────────

function DevicesCard() {
  const t = useTranslations("Profile.devices");
  const tCommon = useTranslations("Common");

  const deviceRows = [
    { label: t("watchLabel") },
    { label: t("scaleLabel") },
    { label: t("phoneLabel") },
  ];

  return (
    <LightCard>
      <CardHead icon="spark" title={t("title")} />
      {deviceRows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 0",
            borderBottom: i < deviceRows.length - 1 ? `1px solid ${L.line}` : "none",
            opacity: 0.55,
          }}
        >
          <span style={{ fontSize: 14, color: L.ink2, flex: 1 }}>{row.label}</span>
          <span
            style={{
              fontSize: 12.5,
              color: L.mut2,
              fontWeight: 600,
              marginRight: 8,
            }}
          >
            {tCommon("comingSoon")}
          </span>
          <Toggle
            checked={false}
            onChange={() => {
              /* intentionally disabled — HealthKit/Health Connect not in MVP */
            }}
            label={`${row.label} connection`}
            labelHidden
            disabled
          />
        </div>
      ))}
    </LightCard>
  );
}

// ── Subscription summary card ─────────────────────────────────────

function SubscriptionSummaryCard({
  subscription,
  entitlement,
}: {
  subscription: SubscriptionSummary;
  entitlement: Entitlement;
}) {
  const t = useTranslations("Profile.subscription");
  const isPro = subscription.tier === "pro";
  const tierLabel = isPro ? t("proPlan") : t("freePlan");
  const msgLabel =
    entitlement.aiMessagesRemaining === null
      ? t("unlimitedMessages")
      : t("messagesRemaining", { count: entitlement.aiMessagesRemaining });

  return (
    <LightCard>
      <CardHead icon="star" color={M.amber} title={t("title")} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: L.ink }}>{tierLabel}</div>
          <div style={{ fontSize: 12.5, color: L.mut, marginTop: 2 }}>{msgLabel}</div>
        </div>
        <Link
          href="/billing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 11,
            background: isPro ? L.panel2 : M.amber,
            color: isPro ? L.ink2 : "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {isPro ? t("managePlan") : t("upgradeToPro")}
        </Link>
      </div>
    </LightCard>
  );
}

// ── Language preferences card ─────────────────────────────────────

function LanguageCard() {
  const t = useTranslations("Profile.language");
  return (
    <LightCard>
      <CardHead icon="spark" color={M.indigo} title={t("title")} />
      <p style={{ fontSize: 13, color: L.mut, marginBottom: 14, marginTop: 0 }}>
        {t("description")}
      </p>
      <LanguageSwitcher />
    </LightCard>
  );
}

// ── Combined data type for the profile query ──────────────────────

type ProfileData = {
  user: User;
  profile: UserProfile | null;
  hierarchy: CoachingHierarchySummary;
  subscription: SubscriptionSummary;
  entitlement: Entitlement;
  errors: string[];
};

// ── Main ProfileWorkspace ─────────────────────────────────────────

export function ProfileWorkspace() {
  const { getToken } = useAuth();
  const t = useTranslations("Profile");
  const locale = useLocale();
  const router = useRouter();
  // Guard so the reconciliation effect fires at most once per mount.
  const reconciledRef = useRef(false);

  const profileQuery = useQuery({
    queryKey: apiQueryKeys.dashboardState,
    queryFn: async (): Promise<ProfileData> => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const [userResult, profileResult, stateResult, subscriptionResult, entitlementResult] =
        await Promise.all([
          getCurrentUser(token),
          getCurrentProfile(token),
          getCurrentUserState(token),
          getSubscription(token),
          getEntitlement(token),
        ]);

      if (userResult.error || !userResult.data) {
        throw new Error(userResult.error ?? "User data could not be loaded.");
      }
      if (stateResult.error || !stateResult.data) {
        throw new Error(stateResult.error ?? "User state could not be loaded.");
      }

      const errors: string[] = [];
      if (profileResult.error) errors.push(profileResult.error);
      if (subscriptionResult.error) errors.push(subscriptionResult.error);
      if (entitlementResult.error) errors.push(entitlementResult.error);

      // Build fallback subscription/entitlement when the billing query fails
      const subscription: SubscriptionSummary = subscriptionResult.data ?? {
        tier: "free",
        status: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        hasStripeCustomer: false,
      };
      const entitlement: Entitlement = entitlementResult.data ?? {
        tier: "free",
        aiMessagesPerDay: 10,
        aiMessagesUsedToday: 0,
        aiMessagesRemaining: 10,
      };

      return {
        user: userResult.data,
        profile: profileResult.data ?? null,
        hierarchy: stateResult.data.hierarchy,
        subscription,
        entitlement,
        errors,
      };
    },
  });

  // Backend→cookie reconciliation: when the durable backend locale differs
  // from the cookie-derived locale, update the cookie once and refresh.
  // First paint already used the cookie value — no round-trip delay.
  useEffect(() => {
    const backendLocale = profileQuery.data?.user.locale;
    if (
      !reconciledRef.current &&
      backendLocale &&
      isLocale(backendLocale) &&
      backendLocale !== locale
    ) {
      reconciledRef.current = true;
      void setLocaleCookie(backendLocale).then(() => {
        router.refresh();
      });
    }
  }, [profileQuery.data?.user.locale, locale, router]);

  // ── Async states ──
  if (profileQuery.isLoading) return <ProfileLoading message={t("loading")} />;

  if (profileQuery.isError) {
    return (
      <ProfileError
        message={
          profileQuery.error instanceof Error
            ? profileQuery.error.message
            : t("error")
        }
      />
    );
  }

  const data = profileQuery.data;
  if (!data) return null;

  // ── Success state: two-column layout ──
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: L.bg,
      }}
    >
      {/* Page heading */}
      <div style={{ paddingBottom: 22 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.3,
            color: L.ink,
            margin: 0,
          }}
        >
          {t("title")}
        </h1>
        <div style={{ fontSize: 13.5, color: L.mut, marginTop: 4 }}>
          {t("subtitle")}
        </div>
      </div>

      {data.errors.length > 0 ? (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(245,165,36,0.10)",
            border: `1px solid ${M.amber}40`,
            fontSize: 13,
            color: L.ink2,
            marginBottom: 16,
          }}
        >
          {t("partialError")}
        </div>
      ) : null}

      {/* Two-column flex */}
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        {/* LEFT column */}
        <div
          id="profile-left-col"
          style={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <AccountHeaderCard
            user={data.user}
            tier={data.subscription.tier}
            fallbackLabel={t("account.yourAccount")}
          />
          {/* goals anchor — /goals redirects to /profile#goals */}
          <div id="goals">
            <GoalHierarchyCard hierarchy={data.hierarchy} />
          </div>
          <PersonalContextCard profile={data.profile} />
        </div>

        {/* RIGHT column */}
        <div
          id="profile-right-col"
          style={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* documents anchor — /documents redirects to /profile#documents */}
          <div id="documents">
            <DocumentsCard />
          </div>
          {/* data-consent anchor — /metrics redirects to /profile#data-consent */}
          <div id="data-consent">
            <DevicesCard />
          </div>
          <SubscriptionSummaryCard
            subscription={data.subscription}
            entitlement={data.entitlement}
          />
          {/* Preferences / language card */}
          <LanguageCard />
        </div>
      </div>

      {/* "Анализ тела" — full-width section below the two columns.
          Dark instrument cards float on the light Profile page (two-world rule).
          The section owns its own TanStack Query; it is read-only. */}
      <div style={{ marginTop: 16 }}>
        <BodyAnalysisSection />
      </div>
    </div>
  );
}
