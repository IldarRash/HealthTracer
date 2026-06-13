import type { HeartRateSample, HeartRateZoneSummary } from "./device-metrics.js";

/**
 * Standard %HRmax zone bands (fitness, not clinical).
 * Z1: 50–60%, Z2: 60–70%, Z3: 70–80%, Z4: 80–90%, Z5: 90–100%.
 * Samples below 50% are counted in Z1.
 */
export const HR_ZONE_BANDS = [
  { zone: "z1", minPct: 0, maxPct: 0.6 },
  { zone: "z2", minPct: 0.6, maxPct: 0.7 },
  { zone: "z3", minPct: 0.7, maxPct: 0.8 },
  { zone: "z4", minPct: 0.8, maxPct: 0.9 },
  { zone: "z5", minPct: 0.9, maxPct: Infinity },
] as const;

/**
 * Derive an estimated maximum heart rate from a birth date string (YYYY-MM-DD).
 * Uses the simplified 220 − age formula. Defaults to 190 when birthDate is
 * null, undefined, or not a valid parseable date.
 */
export function deriveMaxHeartRate(birthDate: string | null | undefined): number {
  if (!birthDate) {
    return 190;
  }

  const born = new Date(birthDate);

  if (Number.isNaN(born.getTime())) {
    return 190;
  }

  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  if (age < 5 || age > 120) {
    return 190;
  }

  return Math.max(100, 220 - age);
}

/**
 * Compute minutes spent in each HR zone from a sample series.
 * Each sample is assumed to represent one second (offsetSec increments by 1).
 * When the offset gap between consecutive samples is > 60 s, the gap is
 * counted once toward the zone of the current sample (to avoid double-counting).
 * Samples are sorted ascending by offsetSec before processing.
 *
 * Zone cutoffs are derived from HR_ZONE_BANDS — that constant is the single
 * source of truth for zone thresholds.
 */
export function computeHeartRateZones(
  samples: HeartRateSample[],
  maxHr: number,
): HeartRateZoneSummary {
  const result: HeartRateZoneSummary = {
    z1Min: 0,
    z2Min: 0,
    z3Min: 0,
    z4Min: 0,
    z5Min: 0,
  };

  if (samples.length === 0 || maxHr <= 0) {
    return result;
  }

  const sorted = [...samples].sort((a, b) => a.offsetSec - b.offsetSec);

  // Accumulate seconds per zone, then convert to whole minutes at the end.
  const zoneSec = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  // Derive zone cutoffs from HR_ZONE_BANDS (z1–z4 have a finite maxPct; z5 is open).
  // The bands are ordered z1…z5 with maxPct = [0.6, 0.7, 0.8, 0.9, Infinity].
  const [z1Band, z2Band, z3Band, z4Band] = HR_ZONE_BANDS;

  for (let i = 0; i < sorted.length; i++) {
    const sample = sorted[i]!;
    const next = sorted[i + 1];

    // Duration in seconds this sample "covers" — capped at 60 to avoid
    // runaway gaps inflating zone totals.
    const durationSec = next
      ? Math.min(60, Math.max(0, next.offsetSec - sample.offsetSec))
      : 1;

    const pct = sample.bpm / maxHr;

    if (pct < z1Band.maxPct) {
      zoneSec.z1 += durationSec;
    } else if (pct < z2Band.maxPct) {
      zoneSec.z2 += durationSec;
    } else if (pct < z3Band.maxPct) {
      zoneSec.z3 += durationSec;
    } else if (pct < z4Band.maxPct) {
      zoneSec.z4 += durationSec;
    } else {
      zoneSec.z5 += durationSec;
    }
  }

  result.z1Min = Math.round(zoneSec.z1 / 60);
  result.z2Min = Math.round(zoneSec.z2 / 60);
  result.z3Min = Math.round(zoneSec.z3 / 60);
  result.z4Min = Math.round(zoneSec.z4 / 60);
  result.z5Min = Math.round(zoneSec.z5 / 60);

  return result;
}
