"use client";

import {
  buildLongevityWeekEyebrowFromAnchorDate,
  todayIsoDate,
} from "../../lib/longevity-ui-state";
import { PageHeader } from "../ui";

export function LongevityPageHeader() {
  const eyebrow = buildLongevityWeekEyebrowFromAnchorDate(todayIsoDate());

  return (
    <PageHeader
      eyebrow={eyebrow}
      title="Longevity"
      description="Your weekly wellness overview across Today, training, nutrition, goals, and logged signals."
    />
  );
}
