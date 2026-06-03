import { describe, expect, it } from "vitest";
import {
  buildChatAttachmentContentPath,
  isImageAttachmentPreview,
  resolveChatMessageAttachmentPreviews,
  resolveChatMessageTextContent,
  type ChatMessageAttachmentPreview,
} from "./chat-message-attachments.js";
import { createOptimisticUserMessage } from "./chat-ui-state.js";
import type { ChatMessage } from "@health/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePersistedMessage(
  attachments: ChatMessage["attachments"],
  metadataRefIds?: string[],
): Pick<ChatMessage, "metadata" | "attachments"> {
  return {
    metadata: metadataRefIds ? { attachmentRefIds: metadataRefIds } : {},
    attachments,
  };
}

/** A minimal ChatMessageAttachmentPreview with all required fields. */
function makePreview(
  partial: Partial<ChatMessageAttachmentPreview> & Pick<ChatMessageAttachmentPreview, "attachmentRefId" | "filename" | "mimeType">,
): ChatMessageAttachmentPreview {
  return {
    previewUrl: null,
    category: null,
    status: null,
    hasViewableContent: false,
    ...partial,
  };
}

const VIEWABLE_IMAGE_ATT: ChatMessage["attachments"][number] = {
  attachmentRefId: "a1000001-0000-4000-8000-000000000001",
  filename: "food.jpg",
  mimeType: "image/jpeg",
  category: "food_photo",
  status: "ready",
  hasViewableContent: true,
};

const PDF_ATT: ChatMessage["attachments"][number] = {
  attachmentRefId: "a1000002-0000-4000-8000-000000000002",
  filename: "bloodwork.pdf",
  mimeType: "application/pdf",
  category: "medical_document",
  status: "ready",
  hasViewableContent: false,
};

const NEEDS_CONSENT_ATT: ChatMessage["attachments"][number] = {
  attachmentRefId: "a1000003-0000-4000-8000-000000000003",
  filename: "labs.pdf",
  mimeType: "application/pdf",
  category: "medical_document",
  status: "needs_consent",
  hasViewableContent: false,
};

const EXPIRED_IMAGE_ATT: ChatMessage["attachments"][number] = {
  attachmentRefId: "a1000004-0000-4000-8000-000000000004",
  filename: "old-photo.jpg",
  mimeType: "image/jpeg",
  category: "food_photo",
  status: "ready",
  hasViewableContent: false,
};

// ---------------------------------------------------------------------------
// buildChatAttachmentContentPath
// ---------------------------------------------------------------------------

describe("buildChatAttachmentContentPath", () => {
  it("returns the /content path for the given id", () => {
    expect(buildChatAttachmentContentPath("abc-123")).toBe(
      "/chat/attachments/abc-123/content",
    );
  });

  it("percent-encodes special characters in the id", () => {
    expect(buildChatAttachmentContentPath("a/b")).toBe("/chat/attachments/a%2Fb/content");
  });
});

// ---------------------------------------------------------------------------
// resolveChatMessageAttachmentPreviews — persisted path (server metadata)
// ---------------------------------------------------------------------------

describe("resolveChatMessageAttachmentPreviews (persisted — server metadata)", () => {
  it("builds a previewUrl for a viewable image attachment", () => {
    const previews = resolveChatMessageAttachmentPreviews(
      makePersistedMessage([VIEWABLE_IMAGE_ATT]),
    );

    expect(previews).toHaveLength(1);
    const p = previews[0]!;
    expect(p.attachmentRefId).toBe(VIEWABLE_IMAGE_ATT.attachmentRefId);
    expect(p.filename).toBe("food.jpg");
    expect(p.mimeType).toBe("image/jpeg");
    expect(p.category).toBe("food_photo");
    expect(p.status).toBe("ready");
    expect(p.hasViewableContent).toBe(true);
    expect(p.previewUrl).toBe(
      buildChatAttachmentContentPath(VIEWABLE_IMAGE_ATT.attachmentRefId),
    );
  });

  it("sets previewUrl to null for a non-image attachment (PDF)", () => {
    const previews = resolveChatMessageAttachmentPreviews(makePersistedMessage([PDF_ATT]));

    expect(previews).toHaveLength(1);
    const p = previews[0]!;
    expect(p.previewUrl).toBeNull();
    expect(p.hasViewableContent).toBe(false);
    expect(p.filename).toBe("bloodwork.pdf");
    expect(p.category).toBe("medical_document");
  });

  it("sets previewUrl to null for needs_consent (no /content request should be made)", () => {
    const previews = resolveChatMessageAttachmentPreviews(
      makePersistedMessage([NEEDS_CONSENT_ATT]),
    );

    expect(previews).toHaveLength(1);
    const p = previews[0]!;
    expect(p.previewUrl).toBeNull();
    expect(p.hasViewableContent).toBe(false);
    expect(p.status).toBe("needs_consent");
  });

  it("sets previewUrl to null for an expired image (hasViewableContent=false)", () => {
    const previews = resolveChatMessageAttachmentPreviews(
      makePersistedMessage([EXPIRED_IMAGE_ATT]),
    );

    expect(previews).toHaveLength(1);
    const p = previews[0]!;
    expect(p.previewUrl).toBeNull();
    expect(p.hasViewableContent).toBe(false);
    expect(p.mimeType).toBe("image/jpeg"); // image MIME but not viewable
  });

  it("maps multiple attachments preserving order", () => {
    const previews = resolveChatMessageAttachmentPreviews(
      makePersistedMessage([VIEWABLE_IMAGE_ATT, PDF_ATT, NEEDS_CONSENT_ATT]),
    );

    expect(previews).toHaveLength(3);
    expect(previews.map((p) => p.attachmentRefId)).toEqual([
      VIEWABLE_IMAGE_ATT.attachmentRefId,
      PDF_ATT.attachmentRefId,
      NEEDS_CONSENT_ATT.attachmentRefId,
    ]);
  });

  it("returns empty array when attachments is empty", () => {
    const previews = resolveChatMessageAttachmentPreviews(makePersistedMessage([]));
    expect(previews).toHaveLength(0);
  });

  it("falls back to refId-only chips when server attachments empty but metadata has refIds", () => {
    const refId = "a1000099-0000-4000-8000-000000000099";
    const previews = resolveChatMessageAttachmentPreviews(
      makePersistedMessage([], [refId]),
    );

    expect(previews).toHaveLength(1);
    const p = previews[0]!;
    expect(p.attachmentRefId).toBe(refId);
    expect(p.filename).toBe("");
    expect(p.previewUrl).toBeNull();
    expect(p.hasViewableContent).toBe(false);
  });

  it("does not produce previewUrl for image MIME when hasViewableContent is false (expired/purged)", () => {
    // Both EXPIRED_IMAGE_ATT and NEEDS_CONSENT_ATT have image/non-image MIMEs
    // but hasViewableContent=false — no /content URL must be set.
    const allUnavailable = [EXPIRED_IMAGE_ATT, NEEDS_CONSENT_ATT];
    const previews = resolveChatMessageAttachmentPreviews(
      makePersistedMessage(allUnavailable),
    );

    for (const p of previews) {
      expect(p.previewUrl).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// resolveChatMessageAttachmentPreviews — legacy persisted path (no metadata)
// ---------------------------------------------------------------------------

describe("resolveChatMessageAttachmentPreviews (persisted — legacy refIds only)", () => {
  it("parses persisted attachment ref ids from message metadata (backward compat)", () => {
    const previews = resolveChatMessageAttachmentPreviews({
      metadata: {
        attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
      },
      attachments: [],
    });

    expect(previews).toHaveLength(1);
    expect(previews[0]).toMatchObject({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      filename: "",
      mimeType: "",
      previewUrl: null,
      hasViewableContent: false,
    });
  });
});

// ---------------------------------------------------------------------------
// resolveChatMessageAttachmentPreviews — optimistic path
// ---------------------------------------------------------------------------

describe("resolveChatMessageAttachmentPreviews (optimistic)", () => {
  it("reads optimistic attachment previews from metadata (blob previewUrl)", () => {
    const preview = makePreview({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      filename: "session.jpg",
      mimeType: "image/jpeg",
      previewUrl: "blob:preview",
    });
    const optimistic = createOptimisticUserMessage(
      "33333333-3333-4333-8333-333333333333",
      "Leg day check-in",
      [preview],
    );

    const resolved = resolveChatMessageAttachmentPreviews(optimistic);
    expect(resolved).toHaveLength(1);
    const p = resolved[0]!;
    expect(p.attachmentRefId).toBe("a1000001-0000-4000-8000-000000000001");
    expect(p.filename).toBe("session.jpg");
    expect(p.mimeType).toBe("image/jpeg");
    expect(p.previewUrl).toBe("blob:preview");
  });

  it("returns empty array when optimistic metadata has no attachment displays", () => {
    const optimistic = createOptimisticUserMessage(
      "33333333-3333-4333-8333-333333333333",
      "No attachments",
    );
    const previews = resolveChatMessageAttachmentPreviews(optimistic);
    expect(previews).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveChatMessageTextContent
// ---------------------------------------------------------------------------

describe("resolveChatMessageTextContent", () => {
  it("hides attachment-only boilerplate when previews exist", () => {
    const preview = makePreview({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      filename: "session.jpg",
      mimeType: "image/jpeg",
      previewUrl: "blob:preview",
    });

    expect(
      resolveChatMessageTextContent("Shared attachment(s) for coaching review.", [preview]),
    ).toBe("");
  });

  it("strips attachment summary lines from mixed content", () => {
    const preview = makePreview({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
    });

    expect(
      resolveChatMessageTextContent(
        "Post-workout meal\n\n[Attachment: Food photo — meal.jpg]",
        [preview],
      ),
    ).toBe("Post-workout meal");
  });

  it("returns content unchanged when there are no previews", () => {
    expect(resolveChatMessageTextContent("Just a message", [])).toBe("Just a message");
  });
});

// ---------------------------------------------------------------------------
// isImageAttachmentPreview
// ---------------------------------------------------------------------------

describe("isImageAttachmentPreview", () => {
  it("returns true for supported image MIME types", () => {
    const base = makePreview({ attachmentRefId: "id", filename: "f", mimeType: "" });
    expect(isImageAttachmentPreview({ ...base, mimeType: "image/jpeg" })).toBe(true);
    expect(isImageAttachmentPreview({ ...base, mimeType: "image/png" })).toBe(true);
  });

  it("returns false for non-image MIME types", () => {
    const base = makePreview({ attachmentRefId: "id", filename: "f", mimeType: "" });
    expect(isImageAttachmentPreview({ ...base, mimeType: "application/pdf" })).toBe(false);
  });

  it("returns false for empty mimeType", () => {
    const base = makePreview({ attachmentRefId: "id", filename: "f", mimeType: "" });
    expect(isImageAttachmentPreview(base)).toBe(false);
  });
});
