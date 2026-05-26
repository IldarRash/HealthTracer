import type { ChatAttachmentRecord, WorkoutAttachmentRecognitionEnvelope } from "@health/types";
import {
  assertRecognitionProviderIsolation,
  recognitionProvenanceSchema,
  workoutAttachmentRecognitionEnvelopeSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface WorkoutAttachmentRecognitionProvider {
  recognize(input: {
    attachment: ChatAttachmentRecord;
  }): Promise<WorkoutAttachmentRecognitionEnvelope>;
}

@Injectable()
export class DevWorkoutAttachmentRecognitionProvider
  implements WorkoutAttachmentRecognitionProvider
{
  async recognize(input: {
    attachment: ChatAttachmentRecord;
  }): Promise<WorkoutAttachmentRecognitionEnvelope> {
    assertRecognitionProviderIsolation({
      category: "workout_attachment",
      payload: {
        filename: input.attachment.filename,
        mimeType: input.attachment.mimeType,
      },
    });

    const suffix = input.attachment.id.slice(-1);
    const confidence = suffix <= "3" ? "low" : suffix <= "7" ? "medium" : "high";
    const isPlanDoc =
      input.attachment.mimeType === "application/pdf" ||
      input.attachment.filename.toLowerCase().includes("plan");

    const envelope = workoutAttachmentRecognitionEnvelopeSchema.parse({
      category: "workout_attachment",
      attachmentRefId: input.attachment.id,
      attachmentKind: isPlanDoc ? "plan_screenshot" : "exercise_photo",
      sessionLabel: isPlanDoc ? null : "Recognized training session",
      sessionDate: null,
      exercises: [
        {
          name: isPlanDoc ? "Barbell squat" : "Dumbbell row",
          target: "3 sets",
          sets: 3,
          reps: "8-10",
          notes: "Review extracted values before confirming.",
        },
        {
          name: isPlanDoc ? "Romanian deadlift" : "Push-up",
          target: "3 sets",
          sets: 3,
          reps: "10-12",
        },
      ],
      suggestedIntent: isPlanDoc ? "create_workout_plan" : "log_session_context",
      planDraftTitle: isPlanDoc ? "Imported workout plan draft" : null,
      provenance: recognitionProvenanceSchema.parse({
        source: "dev_stub",
        providerId: "dev_workout_attachment",
        recognitionId: randomUUID(),
        confidence,
      }),
      manualFallbackNotice:
        confidence === "low"
          ? "Recognition confidence is low. Edit exercises or describe the workout in text."
          : null,
    });

    return envelope;
  }
}

@Injectable()
export class WorkoutAttachmentRecognizer {
  constructor(private readonly provider: DevWorkoutAttachmentRecognitionProvider) {}

  recognize(input: { attachment: ChatAttachmentRecord }) {
    return this.provider.recognize(input);
  }
}

export function buildEphemeralWorkoutAttachmentExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt;
}
