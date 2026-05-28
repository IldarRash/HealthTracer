import { describe, expect, it, vi } from "vitest";
import { OpenAiChatAttachmentClassificationProvider } from "./openai-chat-attachment-classification.provider.js";

describe("OpenAiChatAttachmentClassificationProvider", () => {
  const attachmentRequest = {
    message: "",
    filename: "IMG_1234.jpg",
    mimeType: "image/jpeg",
    attachmentId: "u1000001-0000-4000-8000-000000000001",
    content: Buffer.from("fake-image"),
    userSelectedCategory: null,
    hasMedicalConsent: false,
  } as const;

  it("maps invalid model output to manual fallback instead of defaulting to food", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ unexpected: true }) } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const result = await provider.classify(attachmentRequest);

    expect(result.category).toBe("unclassified");
    expect(result.suggestedAction).toBe("manual_fallback");
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("maps manual_fallback model output to unclassified even when category is food_photo", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: "food_photo",
                confidence: "low",
                rationale: "Could not tell from the image alone.",
                suggestedAction: "manual_fallback",
                mealContextLabel: null,
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const result = await provider.classify(attachmentRequest);

    expect(result.category).toBe("unclassified");
    expect(result.suggestedAction).toBe("manual_fallback");

    vi.unstubAllGlobals();
  });

  it("rejects invalid category values without defaulting to food", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: "random_document",
                confidence: "high",
                rationale: "Looks like a document.",
                suggestedAction: "run_category_recognition",
                mealContextLabel: null,
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const result = await provider.classify(attachmentRequest);

    expect(result.category).toBe("unclassified");
    expect(result.suggestedAction).toBe("manual_fallback");

    vi.unstubAllGlobals();
  });

  it("sends attachment image bytes and allowed categories to the vision model", async () => {
    const attachmentBytes = Buffer.from("vision-classifier-input");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: "workout_attachment",
                confidence: "medium",
                rationale: "Training equipment visible.",
                suggestedAction: "run_category_recognition",
                mealContextLabel: null,
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const result = await provider.classify({
      ...attachmentRequest,
      content: attachmentBytes,
    });

    expect(result.category).toBe("workout_attachment");
    expect(result.suggestedAction).toBe("run_category_recognition");

    const fetchCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const requestBody = JSON.parse(String(fetchCall?.[1]?.body)) as {
      messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
    };
    const userContent = requestBody.messages.find((message) => message.role === "user")?.content;

    expect(userContent?.[0]?.text).toContain("food_photo, workout_attachment, medical_document");
    expect(userContent?.[1]?.type).toBe("image_url");
    expect(userContent?.[1]?.image_url?.url).toContain(
      `data:image/jpeg;base64,${attachmentBytes.toString("base64")}`,
    );

    vi.unstubAllGlobals();
  });

  it("includes text excerpt content for plain-text attachments", async () => {
    const textBytes = Buffer.from("Bench press 3x8 @ 80kg");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: "workout_attachment",
                confidence: "high",
                rationale: "Training log text.",
                suggestedAction: "run_category_recognition",
                mealContextLabel: null,
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    await provider.classify({
      message: "",
      filename: "session.txt",
      mimeType: "text/plain",
      attachmentId: "c1000001-0000-4000-8000-000000000001",
      content: textBytes,
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    const fetchCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const requestBody = JSON.parse(String(fetchCall?.[1]?.body)) as {
      messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    };
    const userContent = requestBody.messages.find((message) => message.role === "user")?.content;

    expect(userContent?.[1]?.text).toContain("Bench press 3x8");

    vi.unstubAllGlobals();
  });

  it("does not send PDF bytes and instructs against MIME-only medical classification", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: "food_photo",
                confidence: "low",
                rationale: "Uncertain from metadata alone.",
                suggestedAction: "manual_fallback",
                mealContextLabel: null,
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiChatAttachmentClassificationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const result = await provider.classify({
      message: "",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      content: Buffer.from("pdf-bytes"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.category).toBe("unclassified");
    expect(result.suggestedAction).toBe("manual_fallback");

    const fetchCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const requestBody = JSON.parse(String(fetchCall?.[1]?.body)) as {
      messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    };
    const userContent = requestBody.messages.find((message) => message.role === "user")?.content;

    expect(userContent?.[0]?.text).toContain("PDF file content is not parsed");
    expect(userContent?.[0]?.text).not.toContain("base64");

    vi.unstubAllGlobals();
  });
});
