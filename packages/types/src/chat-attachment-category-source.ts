/**
 * Re-exports the category-source schema for DB-compat reading of persisted rows.
 * The upload-time categorySource machinery (isTrustedUserSelectedChatAttachmentUpload,
 * resolveProvisionalUploadCategorySource, resolveCreateAttachmentCategorySource) has been
 * removed — uploads are now image-only and category classification is context-only (no AI
 * classifier gate at upload time).
 *
 * Removal condition: remove this file once DB migration backfills or drops the
 * categorySource column from historical rows.
 */
export type { ChatAttachmentCategorySource } from "./chat-attachments.js";
export { chatAttachmentCategorySourceSchema } from "./chat-attachments.js";
