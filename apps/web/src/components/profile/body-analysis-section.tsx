/**
 * BodyAnalysisSection — "Анализ тела" section rendered inside ProfileWorkspace.
 *
 * Design source: docs/product/features/body-and-nutrition/body-analysis-profile-section.md
 *
 * Layout:
 *   Provenance banner (green, light) → BodyComposition (dark card) →
 *   MuscleMap (dark card) → CoachNotes (light)
 *
 * Async states: loading → error → empty (no analysis) → success.
 * Read-only — the only write path is "Обновить по фото" → /chat.
 *
 * SAFETY FLOORS:
 * - MedicalNote disclaimer is ALWAYS rendered on instrument cards.
 * - No image bytes are ever in props or displayed — numbers only.
 * - Wellness language only — no diagnosis/treatment/medical-certainty text.
 */

"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { BodyCompositionAnalysis } from "@health/types";
import { apiQueryKeys, getBodyAnalysisLatest } from "../../lib/api";
import {
  DsRing,
  DsTrendStrip,
  CoachNotes,
  MedicalNote,
  type DsTrendStripDayData,
} from "../ui";
import { Icon } from "../ui/icon";
import { MuscleMap } from "../ui/body-figure";
import type { MuscleMapData, MuscleMapLegendBlock } from "../ui/body-figure";
import { Stat } from "../ui/stat";
import { Skeleton } from "../ui/skeleton";
import { tokens } from "@health/ui";

// ── Design tokens (inline — two-world rule) ────────────────────────
// Dark instrument: floating dark cards on the light Profile page.

const D = {
  bg: "#1a1a18",
  bg2: "#222220",
  line: "rgba(255,255,255,0.08)",
  ink: "#f5f5f0",
  mut: "rgba(255,255,255,0.45)",
  mut2: "rgba(255,255,255,0.28)",
} as const;

const M = {
  green: "#19c37d",
  greenDim: "rgba(25,195,125,0.10)",
  greenBorder: "rgba(25,195,125,0.26)",
  amber: "#f5a524",
  amberDim: "rgba(245,165,36,0.12)",
  blue: "#3a8dff",
} as const;

const L = {
  ink: "#0e0e0d",
  mut: "#76766f",
  mut2: "#a5a59e",
  line: "#ececea",
  panel: "#f9f9f8",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────

/** Format an ISO date string as short Russian/locale month+day (e.g. "5 июня"). */
function formatShortDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Derive fat% mid-point from a body-composition analysis.
 * Returns null when both bounds are null.
 */
function fatPctMid(analysis: BodyCompositionAnalysis): number | null {
  if (analysis.fatPctMin == null && analysis.fatPctMax == null) return null;
  const lo = analysis.fatPctMin ?? analysis.fatPctMax!;
  const hi = analysis.fatPctMax ?? analysis.fatPctMin!;
  return Math.round((lo + hi) / 2);
}

/**
 * Map fat% trend entries to DsTrendStrip day data.
 * Uses the week-start date as a short label; values are fat% mid-points.
 */
function buildTrendData(
  analysis: BodyCompositionAnalysis,
): DsTrendStripDayData[] {
  if (!analysis.fatPctTrend.length) return [];
  return analysis.fatPctTrend.map((entry) => ({
    value: Math.round(entry.fatPctMid),
    label: new Date(entry.weekStart).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    }),
  }));
}

/**
 * Derive a naive muscle% estimate from muscleTone:
 * above_average → 40, average → 35, below_average → 30.
 * When no tone is present, returns 35 as a neutral mid-point.
 */
function musclePct(analysis: BodyCompositionAnalysis): number {
  switch (analysis.muscleTone) {
    case "above_average": return 40;
    case "below_average": return 30;
    default: return 35;
  }
}

// Water % is not stored in the current schema — the water ring is omitted
// until persisted water% data is available.

/**
 * Derive the 30-day fat% delta from the trend array.
 * Returns null when not enough data to compute.
 * A negative value means fat% is decreasing (good).
 */
function fatDelta30(analysis: BodyCompositionAnalysis): number | null {
  const trend = analysis.fatPctTrend;
  if (trend.length < 2) return null;
  // Array access is safe after the length guard above.
  const first = trend[0]!;
  const last = trend[trend.length - 1]!;
  return Math.round((last.fatPctMid - first.fatPctMid) * 10) / 10;
}

/** Format a delta number with sign prefix, e.g. "+0.9" or "−1.7". */
function formatDelta(delta: number): string {
  const abs = Math.abs(delta).toFixed(1);
  return delta < 0 ? `−${abs}` : `+${abs}`;
}

// computeBmi is deferred until user_profiles.heightCm is threaded into the
// body-analysis read schema. See compositionBmiLabel comment in BodyCompositionCard.

// ── Dark instrument card wrapper ─────────────────────────────────────

function DarkCard({
  children,
  style,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      style={{
        background: D.bg,
        border: `1px solid ${D.line}`,
        borderRadius: 18,
        padding: 22,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function DarkCardHead({
  iconChar,
  color,
  title,
  right,
}: {
  iconChar: string;
  color: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          background: `${color}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
        }}
        aria-hidden="true"
      >
        {iconChar}
      </div>
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: D.ink,
          letterSpacing: 0.2,
          flex: 1,
        }}
      >
        {title}
      </span>
      {right}
    </div>
  );
}

function DarkInnerPanel({
  children,
  style,
  role,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  role?: string;
}) {
  return (
    <div
      role={role}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${D.line}`,
        borderRadius: 14,
        padding: "14px 16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Provenance banner ────────────────────────────────────────────────

function ProvenanceBanner({
  date,
  t,
}: {
  date: string;
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  const shortDate = formatShortDate(date);

  return (
    <div
      style={{
        background: M.greenDim,
        border: `1px solid ${M.greenBorder}`,
        borderRadius: 13,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
      aria-label="Provenance"
    >
      {/* Icon badge */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: M.greenDim,
          border: `1px solid ${M.greenBorder}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden="true"
      >
        <Icon name="camera" size={16} stroke={M.green} />
      </div>

      {/* Copy */}
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: L.ink }}>
          {t("provenanceSavedFrom")} · {shortDate}.
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: L.mut }}>
          {/* Photo count is not persisted; show provenance source only */}
          {t("provenanceSource")}
        </p>
      </div>

      {/* History link */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: M.green,
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
        aria-label="Analysis history"
      >
        {t("provenanceHistory")}
      </span>
    </div>
  );
}

// ── BodyComposition card ──────────────────────────────────────────────

function BodyCompositionCard({
  analysis,
  t,
}: {
  analysis: BodyCompositionAnalysis;
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  const fat = fatPctMid(analysis);
  const muscle = musclePct(analysis);
  const trendData = buildTrendData(analysis);
  const hasTrend = trendData.length > 0;
  const shortDate = formatShortDate(analysis.date);
  const fatDeltaVal = fatDelta30(analysis);

  return (
    <DarkCard aria-label={t("compositionTitle")}>
      <DarkCardHead
        iconChar="♥"
        color={M.amber}
        title={t("compositionTitle")}
        right={
          <span style={{ fontSize: 11.5, color: D.mut2, letterSpacing: 0.3 }}>
            {t("compositionDateChip")} · {shortDate}
          </span>
        }
      />

      {/* Three composition rings */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
        }}
        role="list"
        aria-label="Body composition rings"
      >
        {/* Fat ring */}
        <DarkInnerPanel
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "16px 8px 12px",
          }}
          role="listitem"
        >
          <DsRing
            value={fat ?? 0}
            size={96}
            sw={9}
            color={tokens.color.metric.amber}
            track="rgba(255,255,255,0.07)"
            label={fat != null ? `${fat}%` : "—"}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: D.mut,
            }}
            aria-hidden="true"
          >
            {t("compositionFat")}
          </span>
          {fatDeltaVal != null ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: fatDeltaVal <= 0 ? tokens.color.metric.green : tokens.color.metric.amber,
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              {formatDelta(fatDeltaVal)}% {t("compositionDelta30")}
            </span>
          ) : null}
        </DarkInnerPanel>

        {/* Muscle ring */}
        <DarkInnerPanel
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "16px 8px 12px",
          }}
          role="listitem"
        >
          <DsRing
            value={muscle}
            size={96}
            sw={9}
            color={tokens.color.metric.green}
            track="rgba(255,255,255,0.07)"
            label={`${muscle}%`}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: D.mut,
            }}
            aria-hidden="true"
          >
            {t("compositionMuscle")}
          </span>
          {/* No muscle delta: musclePct is derived from muscleTone (not time-series data).
              Showing a fabricated delta would present invented numbers as measured data. */}
        </DarkInnerPanel>

        {/* Water ring — shown with "—" because water% is not persisted yet.
            When the schema includes waterPct, replace label with the real value. */}
        <DarkInnerPanel
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "16px 8px 12px",
          }}
          role="listitem"
        >
          <DsRing
            value={0}
            size={96}
            sw={9}
            color={tokens.color.metric.blue}
            track="rgba(255,255,255,0.07)"
            label="—"
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: D.mut,
            }}
            aria-hidden="true"
          >
            {t("compositionWater")}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: D.mut2,
              textAlign: "center",
              lineHeight: 1.3,
            }}
          >
            {t("compositionWaterStatus")}
          </span>
        </DarkInnerPanel>
      </div>

      {/* Weight / BMI + trend row */}
      <div style={{ display: "flex", gap: 10 }}>
        {/* Weight/BMI stat panel */}
        {analysis.weightKg != null ? (
          <DarkInnerPanel
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Stat
              dark
              value={analysis.weightKg.toFixed(1)}
              unit="кг"
              label={t("compositionWeightLabel")}
              sub={
                analysis.weightSelfReported
                  ? "со слов"
                  : undefined
              }
              subTone="muted"
            />
            {/* Vertical divider */}
            <div
              style={{
                width: 1,
                alignSelf: "stretch",
                background: D.line,
                margin: "0 4px",
              }}
              aria-hidden="true"
            />
            {/* BMI is omitted: heightCm is not threaded into the body analysis
                read schema. Once user_profiles.heightCm is included in the response
                contract, render: <Stat dark value={computeBmi(weightKg, heightCm)}
                label={t("compositionBmiLabel")} sub={t("compositionBmiRange")} />
            */}
          </DarkInnerPanel>
        ) : null}

        {/* 8-week fat% trend */}
        {hasTrend ? (
          <DarkInnerPanel style={{ flex: 1.2 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: D.mut2,
                  flex: 1,
                }}
              >
                {t("compositionTrendTitle")}
              </span>
              <span style={{ fontSize: 12, color: M.green, fontWeight: 600 }}>
                {t("compositionTrendDown")}
              </span>
            </div>
            <DsTrendStrip
              days={trendData}
              maxH={42}
              barColor={tokens.color.metric.amber}
              ariaLabel={t("compositionTrendTitle")}
            />
          </DarkInnerPanel>
        ) : null}
      </div>

      {/* Disclaimer — content floor */}
      <MedicalNote
        style={{
          marginTop: 14,
          color: D.mut,
        }}
      >
        {t("disclaimer")}
      </MedicalNote>
    </DarkCard>
  );
}

// ── MuscleMap card ────────────────────────────────────────────────────

function buildMuscleMapLegend(
  analysis: BodyCompositionAnalysis,
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>,
): MuscleMapLegendBlock[] {
  const strongItems = analysis.strongGroups.join(" · ") || "";
  const weakItems = analysis.weakGroups.join(" · ") || "";
  return [
    { tone: "strong" as const, title: t("muscleMapStrong"), items: strongItems },
    { tone: "mid" as const, title: t("muscleMapMid"), items: "" },
    { tone: "weak" as const, title: t("muscleMapWeak"), items: weakItems },
  ].filter((b) => b.items.length > 0 || b.tone === "mid");
}

function MuscleMapCard({
  analysis,
  t,
}: {
  analysis: BodyCompositionAnalysis;
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  // Cast the record from the API to the UI-layer MuscleMapData type.
  const muscleMapData = analysis.muscleMap as MuscleMapData;
  const legend = buildMuscleMapLegend(analysis, t);

  return (
    <MuscleMap
      muscleMap={muscleMapData}
      legend={legend}
      coachHint={t("muscleMapCoachHint")}
      chipLabel={t("muscleMapChip")}
      style={{
        background: D.bg,
        border: `1px solid ${D.line}`,
        borderRadius: 18,
        padding: 22,
        color: D.ink,
      }}
      aria-label={t("muscleMapTitle")}
    />
  );
}

// ── Loading / error / empty states ────────────────────────────────────

function BodyAnalysisLoading({
  t,
}: {
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  return (
    <section aria-label={t("sectionTitle")} aria-busy="true">
      <Skeleton h={280} r={18} />
    </section>
  );
}

function BodyAnalysisError({
  t,
}: {
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  return (
    <section
      aria-label={t("sectionTitle")}
      role="alert"
      style={{
        padding: "20px 0",
        fontSize: 14,
        color: "#f0506a",
        textAlign: "center",
      }}
    >
      {t("error")}
    </section>
  );
}

function BodyAnalysisEmpty({
  t,
}: {
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  return (
    <section
      aria-label={t("sectionTitle")}
      style={{
        padding: "24px 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <p
        style={{ margin: 0, fontSize: 14, fontWeight: 600, color: L.ink }}
      >
        {t("emptyTitle")}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: L.mut,
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        {t("emptyDescription")}
      </p>
      <Link
        href="/chat"
        style={{
          marginTop: 6,
          display: "inline-flex",
          alignItems: "center",
          padding: "9px 18px",
          borderRadius: 12,
          background: M.greenDim,
          border: `1px solid ${M.greenBorder}`,
          color: M.green,
          fontSize: 13.5,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {t("emptyAction")}
      </Link>
    </section>
  );
}

// ── Section header ────────────────────────────────────────────────────

function BodyAnalysisSectionHeader({
  t,
}: {
  t: ReturnType<typeof useTranslations<"Profile.bodyAnalysis">>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: L.ink,
        }}
      >
        {t("sectionTitle")}
      </h2>
      <Link
        href="/chat"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 14px",
          borderRadius: 10,
          background: M.greenDim,
          border: `1px solid ${M.greenBorder}`,
          color: M.green,
          fontSize: 12.5,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        <Icon name="camera" size={14} stroke={M.green} aria-hidden />
        {t("updateButton")}
      </Link>
    </div>
  );
}

// ── BodyAnalysisSection (exported) ───────────────────────────────────

/**
 * BodyAnalysisSection renders the "Анализ тела" block inside ProfileWorkspace.
 * It owns its own TanStack Query for the latest body analysis.
 *
 * States:
 *  - loading  → skeleton card
 *  - error    → "Анализ тела недоступен" line
 *  - empty    → "Запустите анализ в чате" empty state with /chat deep-link
 *  - success  → provenance banner + BodyComposition + MuscleMap + CoachNotes
 */
export function BodyAnalysisSection(): ReactElement {
  const { getToken } = useAuth();
  const t = useTranslations("Profile.bodyAnalysis");

  const bodyQuery = useQuery({
    queryKey: apiQueryKeys.bodyAnalysisLatest,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getBodyAnalysisLatest(token);
      if (result.error || result.data === undefined) {
        throw new Error(result.error ?? "Body analysis could not be loaded.");
      }
      return result.data;
    },
  });

  if (bodyQuery.isLoading) {
    return (
      <section id="body-analysis" aria-label={t("sectionTitle")}>
        <BodyAnalysisSectionHeader t={t} />
        <BodyAnalysisLoading t={t} />
      </section>
    );
  }

  if (bodyQuery.isError) {
    return (
      <section id="body-analysis" aria-label={t("sectionTitle")}>
        <BodyAnalysisSectionHeader t={t} />
        <BodyAnalysisError t={t} />
      </section>
    );
  }

  const data = bodyQuery.data;
  const analysis = data?.analysis ?? null;

  if (analysis == null) {
    return (
      <section id="body-analysis" aria-label={t("sectionTitle")}>
        <BodyAnalysisSectionHeader t={t} />
        <BodyAnalysisEmpty t={t} />
      </section>
    );
  }

  return (
    <section
      id="body-analysis"
      aria-label={t("sectionTitle")}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <BodyAnalysisSectionHeader t={t} />

      {/* Provenance banner */}
      <ProvenanceBanner date={analysis.date} t={t} />

      {/* BodyComposition — dark instrument card */}
      <BodyCompositionCard analysis={analysis} t={t} />

      {/* MuscleMap — dark instrument card */}
      <MuscleMapCard analysis={analysis} t={t} />

      {/* Coach notes — light card */}
      <CoachNotes label={t("coachNotesLabel")}>
        {t("coachNotesText")}
      </CoachNotes>
    </section>
  );
}
