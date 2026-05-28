# Chat Attachment Composer And Classification Refinements

## Problem

The current chat attachment MVP works functionally, but the browser experience feels unlike a modern chat composer and can mislead users. Attachments are selected through a visible block before the text box, with a prominent "Attachment privacy" panel and status cards. Sent chat messages mostly show text or generated attachment summary strings rather than the actual attached photo, so the user cannot visually verify what they sent in the conversation.

Classification also over-favors food photos for generic images. A volleyball or training photo can become `food_photo`, show "Food photo READY", and create a nutrition proposal because image MIME types overlap food and workout attachments and the fallback path defaults ambiguous images to food.

## Acceptance Criteria

- The chat composer has an attachment button inside the composer controls, visually colocated with the text input and send button, similar to common chat products.
- Selecting an image shows an inline composer preview without moving the user into a separate attachment block above or below the composer.
- The visible "Attachment privacy" panel is removed from the default chat composer experience. Required consent and wellness-only copy still appears only when a medical/wellness document actually needs it.
- Sent messages with image attachments render photo thumbnails or previews in the transcript for both optimistic and server-loaded messages.
- Attachment previews in chat remain ownership-scoped and do not expose raw private storage URLs beyond the existing authorized client flow.
- Generic image attachments are not classified as `food_photo` solely because the MIME type is `image/jpeg`, `image/png`, or `image/webp`.
- Workout/training cues in the message or filename, including examples such as volleyball, sport, training, gym, exercise, session, activity, and Russian equivalents already supported, classify to `workout_attachment`.
- A workout/training image routes to the workout attachment family and does not create a nutrition incident proposal.
- Food-specific cues still classify food photos correctly and preserve meal context inference.
- Low-confidence ambiguous images should either stay manual/ambiguous or ask for clarification/correction rather than silently producing a nutrition proposal.

## Scope Boundaries

In scope:

- Web chat composer layout and selected-attachment preview behavior.
- Transcript rendering for image attachments associated with user messages.
- Backend/shared classification rules for ambiguous images and workout/training signals.
- Focused tests for composer layout contracts, transcript attachment rendering, and classifier routing.

Out of scope:

- Replacing the current dev recognition providers with real vision models.
- Adding diagnosis, treatment, or medical interpretation flows.
- Changing proposal approval rules or allowing attachments to directly mutate structured workout or nutrition state.
- Building a full attachment gallery, long-term media library, or public file serving system.
- Redesigning Profile document consent outside the chat composer needs.

## Risks And Considerations

- Transcript image rendering may require extending chat message DTOs or deriving attachment display data from message metadata; this should preserve ownership checks, expiry behavior, and retention policy.
- Existing server messages currently store `attachmentRefIds` in metadata but the public `ChatMessage` contract does not expose a typed attachment display payload. A small API contract change may be needed to avoid string-only summaries.
- Removing the privacy panel must not remove required medical document consent, document title/type fields, or wellness-only safety copy when those fields are relevant.
- Ambiguous image classification should avoid swapping one bad default for another. Food photos without food context still need a usable path, but training/sport images should not become nutrition proposals just because they are images.
- If previews use object URLs for optimistic messages and backend attachment refs for persisted messages, the implementation should clean up local URLs and handle expired server refs gracefully.

## Implementation Plan By Role

### Frontend

- Move the file trigger into `ChatComposer` controls beside the send action and render selected thumbnails inline within the composer shell.
- Remove the always-visible chat composer `Attachment privacy` note while preserving medical-only consent and wellness document notices.
- Add a transcript attachment renderer for user messages that can show image thumbnails, file name, category/status, and a non-image fallback chip.
- Update optimistic send behavior so selected photos appear as previews immediately, then reconcile with server-loaded message attachment data after the send succeeds.
- Keep category correction available but visually secondary for ambiguous images.

### Backend

- Adjust shared classifier precedence so image MIME type alone does not default to `food_photo` before workout/training evidence is considered.
- Expand workout/training signals to include sport/team-training terms such as volleyball and related filename cues.
- For ambiguous image-only uploads with no food or workout evidence, return low-confidence/manual fallback or require user/category clarification instead of generating a food proposal.
- Ensure `attachmentTurn` uses the final classified category and that workout attachments route to `attachment_workout`.
- If needed, extend chat thread responses with safe attachment display metadata for message rendering rather than only opaque `attachmentRefIds`.

### Test

- Add classifier tests for volleyball/training images routing to `workout_attachment`, generic image-only uploads not auto-producing food proposals, and food-context images still routing to `food_photo`.
- Add API/service tests that workout-classified attachments do not create nutrition proposals and route through the workout attachment family.
- Add web tests for composer attachment button placement, hidden/default-removed privacy panel, inline selected previews, and transcript photo rendering for optimistic and persisted messages.
- Add regression coverage for medical document consent copy so safety requirements remain visible when a medical attachment is selected.

## Clarifying Questions

No blocking questions. Product intent is clear enough for planning: prioritize a ChatGPT-like composer, hide default privacy education, render sent photos in chat, and make ambiguous sports/training images avoid the food-photo path.
