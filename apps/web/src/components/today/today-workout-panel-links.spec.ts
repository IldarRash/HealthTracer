import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "today-workspace.tsx"),
  "utf8",
);

describe("TodayWorkoutPanel link regressions", () => {
  it("keeps a read-only Training weekly view link in the workout card", () => {
    const workoutPanelStart = componentSource.indexOf("function TodayWorkoutPanel");
    const workoutPanelEnd = componentSource.indexOf("export function TodayWorkspace");
    const workoutPanelSource = componentSource.slice(workoutPanelStart, workoutPanelEnd);

    expect(workoutPanelSource).toMatch(/today-workout-links[\s\S]*?href="\/training"/);
    expect(workoutPanelSource).toContain("Open Workouts →");
    expect(workoutPanelSource.indexOf("today-workout-links")).toBeLessThan(
      workoutPanelSource.indexOf("isTerminalSessionStatus"),
    );
  });
});
