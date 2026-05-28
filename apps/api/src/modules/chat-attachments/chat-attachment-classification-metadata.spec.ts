import { describe, expect, it } from "vitest";
import { createDefaultLocalChatAttachmentClassificationProvider } from "../ai/test-ai-behavior-fixtures.js";
import {
  resolveAttachmentClassificationProviderId,
  withAttachmentClassificationMetadata,
} from "./chat-attachment-classification-metadata.js";
import { LocalChatAttachmentClassificationProvider } from "./local-chat-attachment-classification.provider.js";

describe("chat attachment classification metadata", () => {
  it("names the local heuristic provider after dev-chat cleanup", () => {
    const provider = createDefaultLocalChatAttachmentClassificationProvider();

    expect(provider).toBeInstanceOf(LocalChatAttachmentClassificationProvider);
    expect(resolveAttachmentClassificationProviderId(provider)).toBe("local_heuristic");
  });

  it("attaches provider metadata without changing classification fields", async () => {
    const provider = createDefaultLocalChatAttachmentClassificationProvider();
    const classified = await provider.classify({
      message: "второй прием пищи",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    const enriched = withAttachmentClassificationMetadata({
      result: classified,
      providerId: resolveAttachmentClassificationProviderId(provider),
      method: "dev_heuristic",
    });

    expect(enriched.classificationProviderId).toBe("local_heuristic");
    expect(enriched.classificationMethod).toBe("dev_heuristic");
    expect(enriched.category).toBe("food_photo");
  });
});
