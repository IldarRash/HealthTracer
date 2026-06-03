import { describe, expect, it } from "vitest";
import { chatAttachmentCategorySourceSchema } from "./chat-attachment-category-source.js";

describe("chatAttachmentCategorySourceSchema — DB-compat read", () => {
  it("parses all historical categorySource values", () => {
    for (const value of [
      "default_unclassified",
      "mime_inferred",
      "user_selected",
      "ai_classified",
    ] as const) {
      expect(chatAttachmentCategorySourceSchema.parse(value)).toBe(value);
    }
  });

  it("rejects unknown categorySource values", () => {
    expect(chatAttachmentCategorySourceSchema.safeParse("llm_classified").success).toBe(false);
  });
});
