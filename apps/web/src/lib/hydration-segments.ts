/**
 * hydrationSegments — maps consumed/target liters to N-of-8 segments.
 * Pure frontend mapping; no fabricated unit conversion.
 * 8 segments = 8 eighths of the daily target.
 */

export const WATER_SEGMENT_COUNT = 8;

/**
 * Returns how many of the 8 segments should be filled.
 * Clamps to [0, 8]. Returns 0 when target is null/0.
 */
export function hydrationSegments(
  consumed: number | null | undefined,
  target: number | null | undefined,
): number {
  if (!target || target <= 0) {
    return 0;
  }

  if (!consumed || consumed <= 0) {
    return 0;
  }

  const ratio = consumed / target;
  return Math.min(WATER_SEGMENT_COUNT, Math.round(ratio * WATER_SEGMENT_COUNT));
}

/**
 * Returns a display label like "1.2 / 2.5 L"
 */
export function hydrationLabel(
  consumed: number | null | undefined,
  target: number | null | undefined,
): string {
  const c = consumed != null ? consumed.toFixed(1) : "0";
  const t = target != null ? target.toFixed(1) : "?";
  return `${c} / ${t} L`;
}
