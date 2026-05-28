import { describe, expect, it } from "vitest";
import {
  resolveChatMessageAttachmentPreviews,
  resolveChatMessageTextContent,
} from "./chat-message-attachments.js";
import { createOptimisticUserMessage } from "./chat-ui-state.js";

describe("chat message attachments", () => {
  it("parses persisted attachment ref ids from message metadata", () => {
    const previews = resolveChatMessageAttachmentPreviews({
      id: "44444444-4444-4444-8444-444444444444",
      threadId: "33333333-3333-4333-8333-333333333333",
      role: "user",
      content: "Shared attachment(s) for coaching review.",
      metadata: {
        attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
      },
      createdAt: "2026-05-22T12:00:00.000Z",
    });

    expect(previews).toEqual([
      {
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        filename: "",
        mimeType: "",
        previewUrl: null,
      },
    ]);
  });

  it("reads optimistic attachment previews from metadata", () => {
    const optimistic = createOptimisticUserMessage(
      "33333333-3333-4333-8333-333333333333",
      "Leg day check-in",
      [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          filename: "session.jpg",
          mimeType: "image/jpeg",
          previewUrl: "blob:preview",
        },
      ],
    );

    expect(resolveChatMessageAttachmentPreviews(optimistic)).toEqual([
      {
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        filename: "session.jpg",
        mimeType: "image/jpeg",
        previewUrl: "blob:preview",
      },
    ]);
  });

  it("hides attachment-only boilerplate when previews exist", () => {
    expect(
      resolveChatMessageTextContent("Shared attachment(s) for coaching review.", [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          filename: "session.jpg",
          mimeType: "image/jpeg",
          previewUrl: "blob:preview",
        },
      ]),
    ).toBe("");

    expect(
      resolveChatMessageTextContent("Post-workout meal\n\n[Attachment: Food photo — meal.jpg]", [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          filename: "meal.jpg",
          mimeType: "image/jpeg",
          previewUrl: null,
        },
      ]),
    ).toBe("Post-workout meal");
  });
});
