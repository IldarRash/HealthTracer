import { describe, expect, it } from "vitest";
import {
  DevWorkoutAttachmentRecognitionProvider,
  WorkoutAttachmentRecognizer,
} from "./workout-attachment-recognizer.js";

describe("WorkoutAttachmentRecognizer", () => {
  it("returns stub recognition envelope for plan documents", async () => {
    const provider = new DevWorkoutAttachmentRecognitionProvider();
    const recognizer = new WorkoutAttachmentRecognizer(provider);

    const envelope = await recognizer.recognize({
      attachment: {
        id: "c1000008-0000-4000-8000-000000000008",
        filename: "weekly-plan.pdf",
        mimeType: "application/pdf",
      } as never,
    });

    expect(envelope.category).toBe("workout_attachment");
    expect(envelope.suggestedIntent).toBe("create_workout_plan");
    expect(envelope.exercises.length).toBeGreaterThan(0);
    expect(envelope.manualFallbackNotice).toBeNull();
  });

  it("returns session context intent for exercise photos with manual fallback on low confidence", async () => {
    const provider = new DevWorkoutAttachmentRecognitionProvider();
    const recognizer = new WorkoutAttachmentRecognizer(provider);

    const envelope = await recognizer.recognize({
      attachment: {
        id: "c1000001-0000-4000-8000-000000000001",
        filename: "gym-photo.jpg",
        mimeType: "image/jpeg",
      } as never,
    });

    expect(envelope.suggestedIntent).toBe("log_session_context");
    expect(envelope.manualFallbackNotice).toMatch(/low/i);
  });

  it("labels volleyball sessions from the user message", async () => {
    const provider = new DevWorkoutAttachmentRecognitionProvider();
    const recognizer = new WorkoutAttachmentRecognizer(provider);

    const envelope = await recognizer.recognize({
      attachment: {
        id: "c1000004-0000-4000-8000-000000000004",
        filename: "volleyball.jpg",
        mimeType: "image/jpeg",
      } as never,
      boundedMessage: "запиши мне тренировку волейбола на сегодня",
    });

    expect(envelope.sessionLabel).toBe("Volleyball training");
    expect(envelope.suggestedIntent).toBe("log_session_context");
  });
});
