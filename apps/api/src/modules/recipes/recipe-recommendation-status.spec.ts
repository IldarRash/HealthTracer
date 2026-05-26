import { describe, expect, it } from "vitest";
import {
  canTransitionRecipeRecommendationStatus,
  isTerminalRecipeRecommendationStatus,
} from "./recipe-recommendation-status.js";

describe("recipe recommendation status transitions", () => {
  it("allows pending recommendations to be saved, dismissed, or completed", () => {
    expect(canTransitionRecipeRecommendationStatus("pending", "accepted")).toBe(true);
    expect(canTransitionRecipeRecommendationStatus("pending", "dismissed")).toBe(true);
    expect(canTransitionRecipeRecommendationStatus("pending", "completed")).toBe(true);
  });

  it("allows accepted recommendations to be completed or dismissed", () => {
    expect(canTransitionRecipeRecommendationStatus("accepted", "completed")).toBe(true);
    expect(canTransitionRecipeRecommendationStatus("accepted", "dismissed")).toBe(true);
  });

  it("blocks transitions from terminal statuses", () => {
    expect(canTransitionRecipeRecommendationStatus("dismissed", "accepted")).toBe(false);
    expect(canTransitionRecipeRecommendationStatus("completed", "accepted")).toBe(false);
    expect(isTerminalRecipeRecommendationStatus("dismissed")).toBe(true);
    expect(isTerminalRecipeRecommendationStatus("completed")).toBe(true);
  });
});
