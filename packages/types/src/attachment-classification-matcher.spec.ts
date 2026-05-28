import { describe, expect, it } from "vitest";
import {
  buildDefaultAttachmentBehaviorConfig,
  normalizeAttachmentBehaviorConfig,
} from "./attachment-behavior-config.js";
import { compileAttachmentClassificationMatcher } from "./attachment-classification-matcher.js";

describe("attachment classification matcher", () => {
  it("compiles default config patterns and classifies meal photos", () => {
    const matcher = compileAttachmentClassificationMatcher(
      buildDefaultAttachmentBehaviorConfig().classification,
    );

    const result = matcher.classifyAttachmentFromMessageContext({
      message: "второй прием пищи",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.category).toBe("food_photo");
    expect(result.mealContextLabel).toBe("Second meal");
  });

  it("changes dev classification rationales from config without code changes", () => {
    const config = normalizeAttachmentBehaviorConfig({
      classification: {
        ...buildDefaultAttachmentBehaviorConfig().classification,
        rationales: {
          ...buildDefaultAttachmentBehaviorConfig().classification.rationales,
          devAmbiguousManualFallback: "Config-only ambiguous fallback copy.",
        },
      },
    });
    const matcher = compileAttachmentClassificationMatcher(config.classification);

    const result = matcher.classifyDevAttachment({
      message: "",
      filename: "IMG_1234.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.rationale).toBe("Config-only ambiguous fallback copy.");
    expect(result.suggestedAction).toBe("manual_fallback");
  });

  it("changes signal detection when config patterns change", () => {
    const config = normalizeAttachmentBehaviorConfig({
      classification: {
        ...buildDefaultAttachmentBehaviorConfig().classification,
        foodMessageSignal: {
          source: String.raw`\bcustom-food-token\b`,
          flags: "i",
        },
      },
    });
    const matcher = compileAttachmentClassificationMatcher(config.classification);

    expect(matcher.hasFoodAttachmentSignals("custom-food-token photo", null)).toBe(true);
    expect(matcher.hasFoodAttachmentSignals("второй прием пищи", null)).toBe(false);
  });

  it("skips invalid regex patterns without throwing", () => {
    const config = normalizeAttachmentBehaviorConfig({
      classification: {
        ...buildDefaultAttachmentBehaviorConfig().classification,
        medicalMessagePatterns: [{ source: "(unclosed", flags: "i" }],
      },
    });
    const matcher = compileAttachmentClassificationMatcher(config.classification);

    expect(matcher.hasMedicalDocumentSignals("lab results", "scan.pdf")).toBe(false);
  });
});
